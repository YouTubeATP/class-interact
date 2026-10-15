import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

async function startSession(request: import('@playwright/test').APIRequestContext) {
  const decks = await (await request.get('/api/studio/presentations')).json();
  const deck = decks.find((d: { title: string }) => d.title.startsWith('Workshop'));
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: true, mode: 'standalone' } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  return { id: s.id as string, pin: s.pin as string, key: ctl.projectorKey as string };
}

test('the join page has a Scan QR code button that reads the projector QR with the camera', async ({ request, browser, baseURL }) => {
  const s = await startSession(request);

  // Capture the *real* QR code from the projector, and play it back as a fake camera feed.
  const screen = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const projector = await screen.newPage();
  await projector.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
  const qr = projector.locator('.ticket svg[role="img"]').first();
  await expect(qr).toBeVisible();
  await projector.waitForTimeout(1200); // let the entrance animation settle
  const jpeg = await qr.screenshot({ type: 'jpeg', quality: 100 });
  await screen.close();
  const feed = join(mkdtempSync(join(tmpdir(), 'ci-cam-')), 'qr.mjpeg');
  writeFileSync(feed, Buffer.concat(Array.from({ length: 60 }, () => jpeg)));

  const phoneBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${feed}`] });
  try {
    const phone = await phoneBrowser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['camera'] });
    const page = await phone.newPage();
    await page.goto('/join');
    await expect(page.getByTestId('scan-open')).toBeVisible();
    await page.getByTestId('scan-open').click();
    await expect(page.getByTestId('scan-overlay')).toBeVisible();

    // The code is recognised and the join flow continues by itself, exactly like opening the QR link.
    await expect(page.getByTestId('name-input')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('scan-overlay')).toHaveCount(0);
    await page.getByTestId('name-input').fill('Scanner');
    await page.getByTestId('name-submit').click();
    await expect(page.getByTestId('waiting-lobby')).toBeVisible();
    await expect(page.getByTestId('participant-session-title')).toHaveText('Workshop activity kit');
  } finally {
    await phoneBrowser.close();
  }
});

test('without a usable camera the scanner explains why and falls back to typing the code', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/join');
  await page.getByTestId('scan-open').click();
  await expect(page.getByTestId('scan-problem')).toBeVisible();
  await expect(page.getByTestId('scan-problem')).toContainText(/camera/i);
  await page.getByRole('button', { name: 'Type the code instead' }).click();
  await expect(page.getByTestId('scan-overlay')).toHaveCount(0);
  await expect(page.getByTestId('pin-input')).toBeVisible();
  await context.close();
});
