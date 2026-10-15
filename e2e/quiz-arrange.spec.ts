import { expect, test, type Page } from '@playwright/test';
import { openProjector, readPin, waitSaved } from './helpers';

const pairs = [
  { id: 'p1', left: 'France', right: 'Paris' },
  { id: 'p2', left: 'Japan', right: 'Tokyo' },
  { id: 'p3', left: 'Egypt', right: 'Cairo' },
  { id: 'p4', left: 'Peru', right: 'Lima' },
];
const order = ['Mouse', 'Cat', 'Dog', 'Horse'];

/**
 * Press "Lock in" and wait until it has registered. A scripted mouse drag finishes in a few milliseconds, and the drag
 * library swallows a click that lands right after it (a person never clicks that fast), so allow one more press.
 */
async function lockIn(page: Page) {
  await page.waitForTimeout(250);
  await expect(async () => {
    const button = page.getByTestId('quiz-submit');
    if (await button.isVisible()) await button.click();
    await expect(page.getByTestId('received')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

async function rowTexts(page: Page) {
  return (await page.getByTestId('order-row').allInnerTexts()).map((t) => t.trim());
}

test('matching and ordering: tap or drag on a phone, graded with partial credit, answers hidden until revealed', async ({ browser, request, page: dash }) => {
  const imported = await request.post('/api/studio/presentations/import', {
    data: {
      schemaVersion: 1,
      title: 'Arrange',
      slides: [
        { id: 'match', type: 'quiz', kind: 'match', question: 'Match each country with its capital', pairs },
        { id: 'order', type: 'quiz', kind: 'order', question: 'Smallest to largest', items: order.map((text, i) => ({ id: `i${i}`, text })) },
      ],
    },
  });
  expect(imported.status()).toBe(201);
  const deck = await imported.json();
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();

  await dash.setViewportSize({ width: 1600, height: 1000 });
  await dash.goto(`/session/${s.id}`);
  const pin = await readPin(dash);
  const projector = await openProjector(browser, dash);
  const mk = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(`/join/${pin}`);
    await expect(page.getByTestId('waiting-lobby')).toBeVisible();
    return { page, context };
  };
  const tapper = await mk();
  const dragger = await mk();

  await dash.getByTestId('ctl-primary').click(); // start: the matching question opens
  await expect(projector.getByTestId('stage-match')).toBeVisible();
  await expect(projector.getByTestId('stage-arrange-hint')).toContainText('Match each item');
  for (const p of [tapper, dragger]) await expect(p.page.getByTestId('match-board')).toBeVisible();

  // the lock-in button waits until everything is matched
  await expect(tapper.page.getByTestId('quiz-submit')).toBeDisabled();
  await expect(tapper.page.getByTestId('quiz-submit')).toContainText('Match all 4');

  // tapper: tap an answer, then tap the item it goes with. Everything right.
  const tapMatch = async (page: Page, left: string, right: string) => {
    await page.getByTestId('match-tray').getByRole('button', { name: right, exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^Answer for ${left}`) }).click();
  };
  for (const p of pairs) await tapMatch(tapper.page, p.left, p.right);
  await expect(tapper.page.getByTestId('quiz-submit')).toBeEnabled();
  await tapper.page.getByTestId('quiz-submit').click();
  await expect(tapper.page.getByTestId('received')).toContainText('locked in');

  // dragger: drag answers onto the items with the mouse. Two are swapped, so half is right.
  const dragMatch = async (page: Page, left: string, right: string) => {
    const chip = page.getByTestId('match-tray').getByRole('button', { name: right, exact: true });
    const slot = page.getByRole('button', { name: new RegExp(`^Answer for ${left}`) });
    const a = (await chip.boundingBox())!;
    const b = (await slot.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
  };
  const swapped = { France: 'Paris', Japan: 'Lima', Egypt: 'Cairo', Peru: 'Tokyo' };
  for (const [left, right] of Object.entries(swapped)) await dragMatch(dragger.page, left, right);
  await expect(dragger.page.getByRole('button', { name: 'Answer for Japan: Lima' })).toBeVisible();
  await expect(dragger.page.getByTestId('quiz-submit')).toBeEnabled();
  await lockIn(dragger.page);
  await expect(dash.getByTestId('answered')).toContainText('2 of 2 answered');

  // nothing on the projector shows a pairing yet
  await expect(projector.getByTestId('stage-match-answer')).toHaveCount(0);
  await dash.getByTestId('ctl-primary').click(); // close
  await dash.getByTestId('ctl-primary').click(); // reveal
  await expect(projector.getByTestId('stage-match-answer')).toBeVisible();
  await expect(projector.getByTestId('stage-match-answer')).toContainText('France');
  await expect(tapper.page.getByTestId('quiz-feedback')).toContainText('Correct!');
  await expect(dragger.page.getByTestId('quiz-feedback')).toContainText('Partly right');
  await expect(dragger.page.getByTestId('quiz-feedback')).toContainText('50%');
  await expect(dragger.page.getByTestId('match-correct')).toHaveCount(2); // shows the right answer for the two it missed

  // ordering
  await dash.getByTestId('ctl-primary').click(); // next
  await expect(projector.getByTestId('stage-order')).toBeVisible();
  for (const p of [tapper, dragger]) await expect(p.page.getByTestId('order-board')).toBeVisible();
  expect(await rowTexts(tapper.page)).not.toEqual(order); // never shown already solved

  // tapper: arrow buttons until it is right
  for (let target = 0; target < order.length; target++) {
    for (;;) {
      const now = await rowTexts(tapper.page);
      const at = now.findIndex((t) => t.includes(order[target]));
      if (at <= target) break;
      await tapper.page.getByRole('button', { name: `Move ${order[target]} up` }).click();
    }
  }
  expect((await rowTexts(tapper.page)).map((t) => order.find((o) => t.includes(o)))).toEqual(order);
  await tapper.page.getByTestId('quiz-submit').click();
  await expect(tapper.page.getByTestId('received')).toContainText('locked in');

  // dragger: just locks in the shuffled order as it is (almost certainly mostly wrong)
  const before = await rowTexts(dragger.page);
  await dragger.page.getByTestId('quiz-submit').click();
  await expect(dash.getByTestId('answered')).toContainText('2 of 2 answered');

  await dash.getByTestId('ctl-primary').click(); // close
  await dash.getByTestId('ctl-primary').click(); // reveal
  await expect(projector.getByTestId('stage-order-answer')).toBeVisible();
  expect((await projector.getByTestId('stage-order-answer').innerText()).replace(/\s+/g, ' ')).toMatch(/1 Mouse 2 Cat 3 Dog 4 Horse/);
  await expect(tapper.page.getByTestId('quiz-feedback')).toContainText('Correct!');
  const expected = before.filter((t, i) => t.includes(order[i])).length / order.length;
  if (expected < 1) await expect(dragger.page.getByTestId('quiz-feedback')).not.toContainText('Correct!');
  await expect(dragger.page.getByTestId('order-correct')).toContainText('Mouse › Cat › Dog › Horse');

  // the studio's own view keeps the answer key
  await expect(dash.getByTestId('answer-key')).toContainText('1. Mouse');

  for (const p of [tapper, dragger]) await p.context.close();
  await projector.context().close();
});

test('the editor builds matching and ordering questions and clears the answer key when the type changes', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('new-presentation').click();
  await page.getByTestId('prompt-input').fill('Editor kinds');
  await page.getByTestId('prompt-submit').click();
  await expect(page).toHaveURL(/\/studio\/.+/);
  await page.getByTestId('add-slide').click();
  await page.getByTestId('add-quiz').click();
  await page.getByTestId('quiz-question').fill('Capitals');

  const kind = page.getByLabel('Answer type');
  await kind.selectOption('match');
  await expect(page.getByLabel('Item 1', { exact: true })).toBeVisible();
  await page.getByLabel('Item 1', { exact: true }).fill('France');
  await page.getByLabel('Match for item 1').fill('Paris');
  await page.getByRole('button', { name: 'Add pair' }).click();
  await expect(page.getByLabel('Match for item 4')).toBeVisible();
  await waitSaved(page);

  await kind.selectOption('order');
  await expect(page.getByRole('list', { name: 'Items in the correct order' })).toBeVisible();
  await expect(page.getByLabel('Item 1', { exact: true })).toHaveValue('First');
  await page.getByRole('button', { name: 'Move item 1 down' }).click();
  await expect(page.getByLabel('Item 2', { exact: true })).toHaveValue('First');
  await waitSaved(page);

  // back to a choice type: a fresh, valid answer key, and nothing left over from matching or ordering
  await kind.selectOption('multiple');
  await expect(page.getByRole('checkbox', { name: 'Mark option 1 as a correct answer' })).toHaveAttribute('aria-checked', 'true');
  await kind.selectOption('single');
  await expect(page.getByRole('radio', { name: 'Mark option 1 as the correct answer' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('quiz-true-false').click();
  await expect(page.getByLabel('Option 1', { exact: true })).toHaveValue('True');
  await waitSaved(page);

  // the saved JSON carries only the fields of its kind
  await page.getByRole('tab', { name: /JSON/ }).click();
  const json = await page.getByRole('textbox').first().inputValue();
  expect(json).toContain('"kind": "single"');
  expect(json).not.toMatch(/"pairs"|"items"|"correctOptionIds"|"view"/);
});
