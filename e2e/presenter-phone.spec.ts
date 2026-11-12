import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two presenters share one deck. Each opens the presenter phone (one by scanning the Presenter QR, one by typing the
 * presenter code), picks their name, and gets buzzed before and at their turn. Only the person presenting moves
 * slides with one tap; anyone else's button turns into "Confirm next?" in place.
 */

const content = (id: string, title: string, presenter: string, cues: string[]) => ({ id, type: 'content', title, notes: `PRIVATE-${id}`, presenter, cues });
const deck = {
  schemaVersion: 1,
  title: 'Soil group talk',
  slides: [
    content('s1', 'Welcome', 'Priya', ['Hook: muddy boots']),
    content('s2', 'Why soil', 'Priya', ['Erosion data']),
    content('s3', 'Field trip', 'Sam', ['Photos', 'Worm count']),
    content('s4', 'Thanks', 'Sam', ['Questions?']),
  ],
};

/** A phone that records every vibration instead of buzzing. */
async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    (window as any).__buzz = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: number | number[]) => { (window as any).__buzz.push(Array.isArray(p) ? p : [p]); return true; } });
  });
  return ctx.newPage();
}
const buzzes = (p: Page) => p.evaluate(() => (window as any).__buzz as number[][]);

test('presenter phones: QR or code, turns, cues and confirm-to-move', async ({ browser, request, page: dash }) => {
  const imp = await (await request.post('/api/studio/presentations/import', { data: deck })).json();
  const s = await (await request.post(`/api/studio/presentations/${imp.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();

  await dash.goto(`/session/${s.id}`);
  await dash.getByTestId('tab-presenters').click();
  const qr = dash.getByTestId('presenter-phones').getByTestId('qr-code');
  await expect(qr).toBeVisible();
  const code = (await dash.getByTestId('speaker-code').getAttribute('data-code'))!;
  expect(code).toMatch(/^\d{6}$/);

  // Priya scans the QR (qr.spec.ts checks that drawn codes decode; here, follow the link it encodes)
  const scanned = (await qr.getAttribute('data-value'))!;
  expect(scanned).toContain(`/speak/${s.id}#g=`);
  const priya = await phone(browser);
  await priya.goto(new URL(scanned).pathname + new URL(scanned).hash);
  await expect(priya.getByTestId('speaker-pick')).toHaveText(['Priya', 'Sam']);
  await priya.getByTestId('speaker-pick').filter({ hasText: 'Priya' }).click();

  // Sam types the presenter code on the ordinary join page
  const sam = await phone(browser);
  await sam.goto('/');
  await sam.getByTestId('pin-input').fill(code);
  await sam.getByTestId('pin-submit').click();
  await expect(sam).toHaveURL(/\/speak\//);
  await sam.getByTestId('speaker-pick').filter({ hasText: 'Sam' }).click();

  // before the start: rehearsal run of show, only your own cues, and Priya is up first
  await expect(priya.getByTestId('speaker-status')).toHaveText('You’re up first');
  await expect(priya.getByTestId('speaker-outline')).toContainText('Hook: muddy boots');
  await expect(priya.getByTestId('speaker-outline')).not.toContainText('Worm count');
  await expect(dash.getByTestId('speaker-row')).toHaveCount(2);

  // the host starts; phones cannot
  await expect(priya.getByTestId('speaker-next')).toBeDisabled();
  await dash.getByTestId('ctl-primary').click();

  await expect(priya.getByTestId('speaker-status')).toHaveText('Your turn');
  await expect(priya.getByTestId('speaker-cues')).toContainText('Hook: muddy boots');
  await expect(sam.getByTestId('speaker-cues')).toHaveCount(0);
  await expect(sam.getByTestId('speaker-up-next')).toContainText('Why soil');
  // nothing private on a phone
  for (const p of [priya, sam]) await expect(p.locator('body')).not.toContainText('PRIVATE-');

  // the cue card fades when left alone, and a tap brings it back
  await expect(priya.getByTestId('speaker-cues')).toHaveAttribute('data-lit', 'false', { timeout: 8000 });
  await priya.getByTestId('speaker-cues').click();
  await expect(priya.getByTestId('speaker-cues')).toHaveAttribute('data-lit', 'true');

  // Priya (on turn) moves with one tap; Sam is now one slide away and gets the "get ready" buzz
  await priya.getByTestId('speaker-next').click();
  await expect(priya.getByTestId('speaker-position')).toHaveText('2/4');
  await expect(sam.getByTestId('speaker-status')).toHaveText('Get ready: you’re next');
  await expect.poll(() => buzzes(sam)).toContainEqual([80, 120, 80]);

  // Sam (not on turn) presses Next: it buzzes, turns into "Confirm next?" in place (no dialog), and only the second tap moves
  await sam.getByTestId('speaker-next').click();
  await expect(sam.getByTestId('speaker-next')).toHaveText('Confirm next?');
  await expect(sam.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => buzzes(sam)).toContainEqual([30, 60, 30]);
  await expect(sam.getByTestId('speaker-position')).toHaveText('2/4');
  await sam.getByTestId('speaker-next').click();
  await expect(sam.getByTestId('speaker-position')).toHaveText('3/4');

  // the handover: Sam's long "your turn" buzz, Priya's short "handed over" tick
  await expect(sam.getByTestId('speaker-status')).toHaveText('Your turn');
  await expect.poll(() => buzzes(sam)).toContainEqual([400]);
  await expect.poll(() => buzzes(priya)).toContainEqual([40]);
  await expect(priya.getByTestId('speaker-waiting')).toContainText('No more turns for you');

  // resetting the QR (and code) disconnects every phone
  await dash.getByTestId('tab-presenters').click();
  await dash.getByTestId('speaker-reset').click();
  await expect(priya.getByText('The presenter QR was reset')).toBeVisible();
  await expect(dash.getByTestId('speaker-code')).not.toHaveAttribute('data-code', code);

  await priya.context().close();
  await sam.context().close();
});
