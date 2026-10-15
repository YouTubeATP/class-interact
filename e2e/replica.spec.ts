import { expect, test, type Page } from '@playwright/test';
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

test('the dashboard replica matches the projector, and long slides never overflow', async ({ browser, request, page: dash }) => {
  const decks = await (await request.get('/api/studio/presentations')).json();
  const msg = decks.find((d: { title: string }) => d.title.startsWith('MSG'));
  const s = await (await request.post(`/api/studio/presentations/${msg.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();

  await dash.setViewportSize({ width: 1600, height: 1000 });
  await dash.goto(`/session/${s.id}`);
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

  const settle = () => projector.waitForTimeout(1800);
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
