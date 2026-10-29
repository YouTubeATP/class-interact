import jsQR from 'jsqr';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

async function startSession(request: APIRequestContext) {
  const decks = await (await request.get('/api/studio/presentations')).json();
  const deck = decks.find((d: { title: string }) => d.title.startsWith('Workshop'));
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: true, mode: 'standalone' } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  return { id: s.id as string, pin: s.pin as string, key: ctl.projectorKey as string };
}

/**
 * Screenshot the QR exactly as the projector draws it and decode it like a phone camera would. The browser turns the
 * PNG into pixels (scaled down to keep it quick), jsQR reads them here.
 */
async function decodeQr(page: Page, qr: Locator): Promise<string | null> {
  const png = (await qr.screenshot()).toString('base64');
  // a blank page: the app's own Content-Security-Policy (rightly) refuses data: fetches
  const scratch = await page.context().newPage();
  const { w, h, data } = await scratch.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 640 / bmp.width);
    const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
  }, png);
  await scratch.close();
  return jsQR(Uint8ClampedArray.from(data), w, h)?.data ?? null;
}

/** The decoded code must be the participant join link for this session, never the projector's private link. */
function expectJoinLink(decoded: string | null, s: { pin: string; key: string }) {
  expect(decoded).not.toBeNull();
  expect(decoded).toContain(s.pin);
  expect(decoded).not.toContain(s.key);
  expect(decoded).not.toContain('/project/');
  expect(new URL(decoded!).pathname).toMatch(/^\/(join|j)\b/);
}

const VIEWPORTS = [
  { name: '720p', width: 1280, height: 720 },
  { name: '1080p', width: 1920, height: 1080 },
  { name: '4K', width: 3840, height: 2160 },
  { name: '4:3 projector', width: 1024, height: 768 },
  { name: 'windowed', width: 1180, height: 940 },
];

for (const vp of VIEWPORTS) {
  test(`lobby QR is large, fully visible and scannable at ${vp.name}`, async ({ browser, request }) => {
    const s = await startSession(request);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
    const qr = page.getByTestId('join-poster').getByTestId('qr-code');
    await expect(qr).toBeVisible();
    // the QR snaps to whole device pixels once its box is measured (slower on a 4K canvas)
    await expect.poll(async () => { const b = (await qr.boundingBox())!; return Math.abs(b.width - b.height); }).toBeLessThan(1);

    // The stage is 16:9 and letterboxed, so size is relative to the stage width, not the window.
    const stageW = Math.min(vp.width, (vp.height * 16) / 9);
    const box = (await qr.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(stageW * 0.2);
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
    if (vp.name === '1080p') expect(box.width).toBeGreaterThanOrEqual(380);
    // entirely on screen
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    // modules land on whole device pixels: sharp, not blurred
    const modules = await qr.evaluate((el) => Number(el.getAttribute('viewBox')!.split(' ')[2]));
    expect((box.width / modules) % 1).toBeLessThan(0.01);

    await expect(page.getByTestId('join-poster').getByTestId('ticket-pin')).toHaveAttribute('data-pin', s.pin);
    const pinBox = (await page.getByTestId('join-poster').getByTestId('ticket-pin').boundingBox())!;
    expect(pinBox.height).toBeGreaterThanOrEqual(stageW * 0.03);

    expectJoinLink(await decodeQr(page, qr), s);
    await ctx.close();
  });
}

for (const appearance of ['light', 'dark'] as const) {
  test(`"Show join QR" overlays any screen and scans (${appearance} projector)`, async ({ browser, request }) => {
    const s = await startSession(request);
    const dash = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await dash.goto(`/session/${s.id}`);
    await dash.getByTestId('projector-appearance').selectOption(appearance);
    await dash.getByTestId('ctl-primary').click(); // leave the lobby: the first slide is on screen

    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
    await expect(page.getByTestId('projector')).toBeVisible();
    await expect(page.getByTestId('join-poster')).toHaveCount(0);
    await expect(page.locator(`[data-appearance="${appearance}"]`).first()).toBeAttached();
    await page.waitForTimeout(1000); // the lobby's exit transition finishes
    // what is on the stage, minus the transient "Press F for full screen" hint
    const stageText = async () => (await page.getByTestId('projector').innerText()).replace(/Press F for full screen/, '').trim();
    const before = await stageText();

    await dash.getByTestId('show-join-qr').click();
    const overlay = page.getByTestId('join-overlay');
    await expect(overlay).toBeVisible();
    await page.waitForTimeout(500);
    const qr = overlay.getByTestId('qr-code');
    const box = (await qr.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(1920 * 0.35);
    expect(box.y + box.height).toBeLessThanOrEqual(1080);
    await expect(overlay.getByTestId('overlay-pin')).toContainText(s.pin.slice(0, 3));
    // always dark modules on white, whatever the projector theme
    const corner = await qr.evaluate((el) => getComputedStyle(el.querySelector('rect')!).fill);
    expect(corner).toBe('rgb(255, 255, 255)');
    expectJoinLink(await decodeQr(page, qr), s);

    // hiding it leaves the activity exactly as it was
    await dash.getByTestId('show-join-qr').click();
    await expect(overlay).toHaveCount(0);
    await expect.poll(stageText).toBe(before);
    await ctx.close();
    await dash.context().close();
  });
}
