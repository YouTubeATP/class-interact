import { expect, test, type Browser, type Page } from '@playwright/test';

/** The "Synthetic routes" template: reaction schemes, mhchem equations and structures as quiz answers. */
async function startChemistry(request: import('@playwright/test').APIRequestContext) {
  const deck = await (await request.post('/api/studio/templates/synthetic-routes')).json();
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: true, mode: 'standalone' } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  return { id: s.id as string, pin: s.pin as string, key: ctl.projectorKey as string };
}

async function open(browser: Browser, s: { id: string; key: string; pin: string }) {
  const dash = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await dash.goto(`/session/${s.id}`);
  const proj = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' })).newPage();
  await proj.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
  await expect(proj.getByTestId('projector')).toBeVisible();
  return { dash, proj };
}

const stage = (p: Page) => p.getByTestId('projector');
/** Molecules that finished drawing. */
const drawn = (scope: ReturnType<Page['locator']>) => scope.locator('.rich-mol[data-state="ok"] svg');

test('reaction schemes, chemical equations and structures render on the projector, light and dark', async ({ browser, request }) => {
  const s = await startChemistry(request);
  const { dash, proj } = await open(browser, s);
  await dash.getByTestId('ctl-primary').click();

  // the intro: a balanced equation with mhchem, typeset (no raw TeX left on screen)
  await expect(stage(proj).locator('.katex').first()).toBeVisible();
  // (KaTeX keeps the TeX source only in hidden MathML for screen readers; the visible fallback is the <code> shown while loading)
  await expect(stage(proj).locator('code[data-math]')).toHaveCount(0);
  await expect(stage(proj)).toContainText('AlCl');

  // the route: four structures, three arrows with their conditions, nothing overlapping
  await dash.getByTestId('flow-item').nth(1).click();
  const scheme = stage(proj).getByTestId('chem-scheme');
  await expect(drawn(scheme)).toHaveCount(4);
  await expect(scheme.locator('.rich-scheme-arrow')).toHaveCount(3);
  await expect(scheme).toContainText('acylation');
  await expect(scheme).toContainText('1-phenylethanol');
  const boxes = await scheme.locator('.rich-scheme-mol, .rich-scheme-arrow').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      expect(overlap, `scheme items ${i} and ${j} overlap`).toBeLessThan(4);
    }
  }
  // one bond length for every molecule: benzene is not blown up to the size of the others
  // (screen pixels per drawing unit, i.e. per bond length, is the same for all of them)
  const scales = await drawn(scheme).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height / Number(e.getAttribute('viewBox')!.split(/\s+/)[3])));
  expect(Math.max(...scales) / Math.min(...scales)).toBeLessThan(1.02);
  // each structure has a text alternative
  await expect(scheme.getByRole('img', { name: 'Structure of benzene' })).toBeAttached();

  // bonds follow the text colour: dark on a light projector, light on a dark one
  const bondLum = () => drawn(scheme).first().evaluate((svg) => {
    const line = svg.querySelector('line, path')!;
    const [r, g, b] = (getComputedStyle(line).stroke.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  });
  expect(await bondLum()).toBeLessThan(0.4);
  await dash.getByTestId('projector-appearance').selectOption('dark');
  await expect(proj.locator('[data-appearance="dark"]').first()).toBeAttached();
  await expect.poll(bondLum, { timeout: 10_000 }).toBeGreaterThan(0.6);

  for (const p of [dash, proj]) await p.context().close();
});

test('structures as quiz answers: large cards on the projector, tappable tiles on a phone, graded on reveal', async ({ browser, request }) => {
  const s = await startChemistry(request);
  const { dash, proj } = await open(browser, s);
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await phone.goto('/join');
  await phone.getByTestId('pin-input').fill(s.pin);
  await phone.getByTestId('pin-submit').click();
  await phone.getByTestId('name-input').fill('Ada');
  await phone.getByTestId('name-submit').click();
  await expect(phone.getByTestId('waiting-lobby')).toBeVisible();

  await dash.getByTestId('ctl-primary').click();
  await dash.getByTestId('flow-item').nth(2).click(); // "Which structure is the product?"
  // the question itself carries a structure and an mhchem arrow
  await expect(drawn(stage(proj).getByTestId('stage-question'))).toHaveCount(1);
  await expect(stage(proj).getByTestId('stage-question').locator('.katex')).toBeVisible();
  // four answer cards in one row, each with a drawing large enough to read across a room
  await expect(drawn(stage(proj))).toHaveCount(5);
  const sizes = await drawn(stage(proj)).evaluateAll((els) => els.slice(1).map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  expect(new Set(sizes.map((r) => Math.round(r.top / 20))).size, 'cards share one row').toBe(1);
  for (const r of sizes) expect(r.width, 'structure width on a 1600 px projector').toBeGreaterThan(110);

  // the phone: four tiles, each a drawn structure with a text alternative; tap the right one
  await expect(drawn(phone.locator('main, body'))).toHaveCount(5);
  await phone.getByRole('button', { name: /SMILES CC\(O\)C1=CC=CC=C1/ }).click();
  await expect(dash.getByTestId('answered')).toContainText('1 of 1 answered');
  await dash.getByTestId('ctl-primary').click(); // close
  await dash.getByTestId('ctl-primary').click(); // reveal
  await expect(phone.getByTestId('quiz-feedback')).toContainText('Correct');
  await expect(stage(proj).getByLabel('Correct answer')).toHaveCount(1);

  for (const p of [dash, proj, phone]) await p.context().close();
});

test('a SMILES that cannot be read shows the text itself, not a broken drawing', async ({ browser, request }) => {
  const imp = await (await request.post('/api/studio/presentations/import', { data: { schemaVersion: 1, title: 'Bad SMILES', slides: [
    { id: 'c', type: 'content', title: 'Typo', body: 'Fine: {{smiles:CCO}} and broken: {{smiles:C1CC(}}' },
  ] } })).json();
  const s0 = await (await request.post(`/api/studio/presentations/${imp.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s0.id}/control`)).json();
  const { dash, proj } = await open(browser, { id: s0.id, key: ctl.projectorKey, pin: s0.pin });
  await dash.getByTestId('ctl-primary').click();
  await expect(stage(proj).locator('.rich-mol[data-state="ok"]')).toHaveCount(1);
  const bad = stage(proj).locator('.rich-mol[data-state="error"]');
  await expect(bad).toHaveCount(1);
  await expect(bad).toContainText('C1CC(');
  for (const p of [dash, proj]) await p.context().close();
});
