import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/** Creator screens on a phone (390px) and the editor's scroll behaviour on a laptop. */

async function overflow(page: Page) {
  await page.waitForTimeout(300);
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
}

async function expectNoHorizontalScroll(page: Page) {
  const o = await overflow(page);
  expect(o.scrollWidth, 'page is wider than the screen').toBeLessThanOrEqual(o.innerWidth);
}

async function importDeck(request: APIRequestContext, slides: unknown[], title = 'Layout deck') {
  const res = await request.post('/api/studio/presentations/import', { data: { schemaVersion: 1, title, slides } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string };
}

const opts = (...t: string[]) => t.map((text, i) => ({ id: `o${i}`, text }));

const ALL_KINDS = [
  { id: 'c', type: 'content', title: 'Welcome', body: 'Hello', callout: { tone: 'info', text: 'Note' } },
  { id: 'q1', type: 'quiz', question: 'Pick one of these options please', options: opts('One', 'Two', 'Three', 'Four'), correctOptionId: 'o1' },
  { id: 'q2', type: 'quiz', kind: 'multiple', question: 'Pick all', options: opts('A', 'B', 'C'), correctOptionIds: ['o0', 'o2'] },
  { id: 'q3', type: 'quiz', kind: 'match', question: 'Match', pairs: [['France', 'Paris'], ['Japan', 'Tokyo'], ['Egypt', 'Cairo']].map(([left, right], i) => ({ id: `p${i}`, left, right })) },
  { id: 'q4', type: 'quiz', kind: 'order', question: 'Order', items: opts('Mouse', 'Cat', 'Dog') },
  { id: 's', type: 'survey', title: 'Survey', questions: [{ id: 'a', kind: 'rating', question: 'How?' }, { id: 'b', kind: 'text', question: 'Why?' }] },
];

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('library, editor, dashboard and results never scroll sideways, and the editor has a bottom nav', async ({ page, request }) => {
    const deck = await importDeck(request, ALL_KINDS);

    await page.goto('/studio');
    await expect(page.getByTestId('new-presentation')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto(`/studio/${deck.id}`);
    const nav = page.getByTestId('editor-nav');
    await expect(nav).toBeVisible();
    // one pane at a time: the slide list, the editor and the preview
    await page.getByTestId('editor-nav-slides').click();
    await expect(page.getByTestId('slide-row')).toHaveCount(ALL_KINDS.length);
    await expectNoHorizontalScroll(page);
    for (let i = 0; i < ALL_KINDS.length; i++) {
      await page.getByTestId('editor-nav-slides').click();
      await page.getByTestId('slide-select').nth(i).click();
      await expectNoHorizontalScroll(page);
    }
    await page.getByTestId('editor-nav-preview').click();
    await expectNoHorizontalScroll(page);
    await page.getByTestId('editor-nav-edit').click();
    await page.getByTestId('tab-json').click();
    await expectNoHorizontalScroll(page);

    const session = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();
    await page.goto(`/session/${session.id}`);
    await page.getByTestId('ctl-primary').click();
    await expectNoHorizontalScroll(page);
    await page.getByTestId('flow-item').nth(3).click();
    await expectNoHorizontalScroll(page);
    await page.getByTestId('end-session').click();
    await page.getByTestId('confirm-submit').click();
    await expect(page.getByTestId('ended-banner')).toBeVisible();

    await page.goto(`/results/${session.id}`);
    await expect(page.getByTestId('result-card').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the AI panel fills the phone screen without sideways scroll', async ({ page }) => {
    await page.goto('/studio');
    await page.getByTestId('new-presentation').click();
    await page.getByTestId('prompt-input').fill('Phone AI');
    await page.getByTestId('prompt-submit').click();
    await expect(page).toHaveURL(/\/studio\/.+/);
    await page.getByTestId('ai-open').click();
    await expect(page.getByTestId('ai-panel')).toBeVisible();
    await expectNoHorizontalScroll(page);
    const box = (await page.getByTestId('ai-panel').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390.5); // exactly the screen width, give or take sub-pixel rounding
    await expect(page.getByTestId('ai-input')).toBeInViewport();
    await page.getByTestId('ai-close').click();
    await expect(page.getByTestId('ai-panel')).toHaveCount(0);
  });
});

test.describe('laptop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the editor page never scrolls into blank space, with a long form and the AI panel open', async ({ page, request }) => {
    const questions = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, kind: 'rating', question: `Question number ${i + 1}?` }));
    const deck = await importDeck(request, [{ id: 's', type: 'survey', title: 'Long survey', questions }]);
    await page.goto(`/studio/${deck.id}`);
    await expect(page.getByTestId('save-state')).toBeVisible();
    await page.getByTestId('ai-open').click();
    await expect(page.getByTestId('ai-panel')).toBeVisible();
    const noPageScroll = () => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
    expect(await noPageScroll()).toBe(true);
    // wheel over every region: only the panes scroll, the document does not
    for (const [x, y] of [[640, 400], [120, 400], [1100, 400]]) {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 3000);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await noPageScroll()).toBe(true);
    // the phone-only bottom nav is not shown here
    await expect(page.getByTestId('editor-nav')).toBeHidden();
  });
});
