import { expect, test, type Browser, type Page } from '@playwright/test';
import { openProjector, readPin } from './helpers';

/**
 * The "On the projector" replica in the presenter dashboard and the real projector must be the same view at
 * different sizes. The projector is deliberately opened in a window that is NOT 16:9 (browser chrome eats height),
 * which is where scaling bugs and overflow show up.
 */

type Geo = { stage: [number, number]; items: Record<string, [number, number, number, number]> };

/** Every visible text block inside the stage, as [x, y, w, h] in fractions of the stage. */
async function geometry(page: Page, scope: string): Promise<Geo> {
  return page.evaluate((sel) => {
    const stage = document.querySelector(`${sel} [data-testid="stage"]`) as HTMLElement;
    const sr = stage.getBoundingClientRect();
    const items: Record<string, [number, number, number, number]> = {};
    const seen: Record<string, number> = {};
    stage.querySelectorAll('*').forEach((el) => {
      if (el.children.length || el.closest('[role="timer"]') || el.closest('[aria-hidden="true"]')) return;
      const text = (el.textContent ?? '').trim();
      const r = el.getBoundingClientRect();
      if (!text || !r.width || !r.height) return;
      const n = (seen[text] = (seen[text] ?? 0) + 1);
      items[`${text}#${n}`] = [(r.left - sr.left) / sr.width, (r.top - sr.top) / sr.height, r.width / sr.width, r.height / sr.height];
    });
    return { stage: [sr.width, sr.height], items };
  }, scope);
}

function assertSameLayout(label: string, projector: Geo, replica: Geo) {
  expect(Object.keys(projector.items).sort(), `${label}: same text on both`).toEqual(Object.keys(replica.items).sort());
  for (const [key, p] of Object.entries(projector.items)) {
    const r = replica.items[key];
    const where = `${label}: “${key}”`;
    expect(Math.abs(p[0] - r[0]), `${where} x`).toBeLessThan(0.025);
    expect(Math.abs(p[1] - r[1]), `${where} y`).toBeLessThan(0.025);
    expect(Math.abs(p[2] - r[2]), `${where} width`).toBeLessThan(0.025);
    expect(Math.abs(p[3] - r[3]), `${where} height`).toBeLessThan(0.025);
  }
}

function assertNothingOverflows(label: string, g: Geo) {
  for (const [key, [x, y, w, h]] of Object.entries(g.items)) {
    expect(x, `${label}: “${key}” left edge`).toBeGreaterThanOrEqual(-0.003);
    expect(y, `${label}: “${key}” top edge`).toBeGreaterThanOrEqual(-0.003);
    expect(x + w, `${label}: “${key}” runs off the right`).toBeLessThanOrEqual(1.003);
    expect(y + h, `${label}: “${key}” runs off the bottom`).toBeLessThanOrEqual(1.003);
  }
}

/** No two text blocks may sit on top of each other (the response meter used to collide with the survey scale). */
function assertNoOverlap(label: string, g: Geo) {
  const entries = Object.entries(g.items).filter(([, [, , w, h]]) => w * h > 0);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ka, a] = entries[i];
      const [kb, b] = entries[j];
      const ix = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const iy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      if (ix <= 0 || iy <= 0) continue;
      const smaller = Math.min(a[2] * a[3], b[2] * b[3]);
      expect(ix * iy / smaller, `${label}: “${ka}” overlaps “${kb}”`).toBeLessThan(0.08);
    }
  }
}

/** Opens the dashboard and a letterboxed projector on one session, and returns helpers to compare them. */
async function harness(browser: Browser, dash: Page, sessionId: string) {
  await dash.setViewportSize({ width: 1600, height: 1000 });
  await dash.goto(`/session/${sessionId}`);
  await dash.getByTestId('ctl-primary').waitFor();
  const pin = await readPin(dash);

  // a projector in an awkward, letterboxed window (like a laptop browser with toolbars)
  const projector = await openProjector(browser, dash);
  await projector.setViewportSize({ width: 1919, height: 919 });
  // names are off, so opening the QR link is all it takes to join
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = { page: await phoneContext.newPage(), context: phoneContext };
  await phone.page.goto(`/join/${pin}`);
  await expect(phone.page.getByTestId('waiting-lobby')).toBeVisible();

  // wait for animations to finish: both screens must report the same layout twice in a row
  const settle = async () => {
    let last = '';
    for (let i = 0; i < 40; i++) {
      await projector.waitForTimeout(300);
      const now = JSON.stringify([await geometry(projector, '[data-testid="projector"]'), await geometry(dash, '[data-testid="dashboard-stage"]')]);
      if (now === last) return;
      last = now;
    }
  };
  const compare = async (label: string) => {
    await settle();
    const p = await geometry(projector, '[data-testid="projector"]');
    const r = await geometry(dash, '[data-testid="dashboard-stage"]');
    expect(p.stage[0] / p.stage[1], 'projector stage is 16:9').toBeCloseTo(16 / 9, 2);
    expect(p.stage[0], 'projector stage is letterboxed (narrower than its window)').toBeLessThan(1919);
    assertNothingOverflows(`${label} (projector)`, p);
    assertNothingOverflows(`${label} (replica)`, r);
    assertNoOverlap(`${label} (projector)`, p);
    assertNoOverlap(`${label} (replica)`, r);
    assertSameLayout(label, p, r);
  };
  const goto = async (i: number) => {
    await dash.getByTestId('flow-item').nth(i).click();
  };
  return { projector, phone, compare, goto, settle };
}

test('the dashboard replica matches the projector, and long slides never overflow', async ({ browser, request, page: dash }) => {
  const decks = await (await request.get('/api/studio/presentations')).json();
  const msg = decks.find((d: { title: string }) => d.title.startsWith('MSG'));
  const s = await (await request.post(`/api/studio/presentations/${msg.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();

  const { projector, phone, compare, goto } = await harness(browser, dash, s.id);

  // 1. word cloud with two responses
  await dash.getByTestId('ctl-primary').click(); // start -> title slide
  await compare('title slide');
  await goto(1);
  await phone.page.getByTestId('text-input').fill('sksks');
  await phone.page.getByTestId('text-submit').click();
  await phone.page.getByTestId('text-input').fill('your mom');
  await phone.page.getByTestId('text-submit').click();
  await expect(projector.getByTestId('stage-responses')).toHaveAttribute('data-value', '2');
  await compare('word cloud');

  // 2. the instruction slide from the bug report: five steps and a callout
  await goto(4);
  await expect(projector.getByText('Tasting is voluntary')).toBeVisible();
  await compare('instructions with callout');
  await expect(projector.getByText('You never have to taste to take part.')).toBeVisible();

  // 3. quiz question with four options and a countdown
  await goto(3);
  await compare('quiz');

  // 4. content slide with an image beside long text
  await goto(14);
  await compare('image and text');

  // 5. the longest text in the deck
  await goto(15);
  await compare('observation versus evidence');

  // 6. the feedback survey: two scales and a list, with the response meter underneath
  await goto(21);
  await expect(projector.getByText('Quick feedback on this lesson')).toBeVisible();
  await compare('survey');

  await phone.context.close();
  await projector.context().close();
});

test('matching and ordering questions look the same on the replica and the projector, before and after the reveal', async ({ browser, request, page: dash }) => {
  const imported = await request.post('/api/studio/presentations/import', {
    data: {
      schemaVersion: 1,
      title: 'Arrange replica',
      slides: [
        { id: 'match', type: 'quiz', kind: 'match', question: 'Match each country with its capital', explanation: 'Capitals are where governments sit.', pairs: ['France:Paris', 'Japan:Tokyo', 'Egypt:Cairo', 'Peru:Lima', 'Kenya:Nairobi', 'Chile:Santiago'].map((x, i) => ({ id: `p${i}`, left: x.split(':')[0], right: x.split(':')[1] })) },
        { id: 'order', type: 'quiz', kind: 'order', question: 'Put the stages of the water cycle in order', items: ['Evaporation', 'Condensation', 'Precipitation', 'Collection', 'Runoff'].map((text, i) => ({ id: `i${i}`, text })) },
        { id: 'multi', type: 'quiz', kind: 'multiple', question: 'Which of these are prime numbers?', options: ['2', '9', '11', '15', '17'].map((text, i) => ({ id: `o${i}`, text })), correctOptionIds: ['o0', 'o2', 'o4'] },
      ],
    },
  });
  const deck = await imported.json();
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();
  const { projector, phone, compare } = await harness(browser, dash, s.id);

  await dash.getByTestId('ctl-primary').click(); // start
  await expect(projector.getByTestId('stage-match')).toBeVisible();
  await compare('matching');
  await dash.getByTestId('ctl-primary').click(); // close
  await dash.getByTestId('ctl-primary').click(); // reveal
  await expect(projector.getByTestId('stage-match-answer')).toBeVisible();
  await compare('matching, revealed');

  await dash.getByTestId('ctl-primary').click(); // next
  await expect(projector.getByTestId('stage-order')).toBeVisible();
  await compare('ordering');
  await dash.getByTestId('ctl-primary').click();
  await dash.getByTestId('ctl-primary').click();
  await expect(projector.getByTestId('stage-order-answer')).toBeVisible();
  await compare('ordering, revealed');

  await dash.getByTestId('ctl-primary').click(); // next
  await expect(projector.getByTestId('stage-multi-hint')).toBeVisible();
  await compare('several answers');

  await phone.context.close();
  await projector.context().close();
});
