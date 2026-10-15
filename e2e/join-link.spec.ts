import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

async function startSession(request: APIRequestContext, collectNames: boolean) {
  const decks = await (await request.get('/api/studio/presentations')).json();
  const deck = decks.find((d: { title: string }) => d.title.startsWith('Workshop'));
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames, mode: 'standalone' } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  return { id: s.id as string, pin: s.pin as string, key: ctl.projectorKey as string };
}

async function projectorQr(browser: Browser, s: { id: string; key: string }) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
  const link = await page.locator('.ticket svg[role="img"]').first().getAttribute('data-value');
  return { page, context, link: link! };
}

const phone = (browser: Browser) => browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('scanning the projector QR code takes a phone straight into the session', async ({ request, browser, baseURL }) => {
  const s = await startSession(request, false);
  const screen = await projectorQr(browser, s);

  // What the QR code contains is a plain link to this server that carries the session code. (In development
  // the host is this machine's LAN address so phones on the same Wi-Fi can reach it, hence path + port.)
  const url = new URL(screen.link);
  expect(url.pathname).toBe(`/join/${s.pin}`);
  expect(url.port).toBe(new URL(baseURL!).port);

  // The native camera app just opens that link. No typing, no taps: the phone is in the session.
  // (Opened via the test's base URL so the check does not depend on routing to this machine's LAN address.)
  const link = `${baseURL}${url.pathname}`;
  const context = await phone(browser);
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByTestId('waiting-lobby')).toBeVisible();
  await expect(page).toHaveURL(/\/play\/.+/);
  await expect(screen.page.getByTestId('lobby-count')).toContainText('1 person joined');

  // They arrived with a friendly generated name and can make it their own.
  const generated = (await page.getByTestId('participant-name').innerText()).trim();
  expect(generated).toMatch(/^\w+ \w+$/);
  await page.getByTestId('participant-name').click();
  await page.getByTestId('rename-input').fill('Ada');
  await page.getByTestId('rename-submit').click();
  await expect(page.getByTestId('participant-name')).toContainText('Ada');
  await expect(screen.page.getByText('Ada', { exact: true })).toBeVisible();

  // Scanning again on the same phone resumes the same participant instead of adding a second one.
  await page.goto(link);
  await expect(page.getByTestId('waiting-lobby')).toBeVisible();
  await expect(page.getByTestId('participant-name')).toContainText('Ada');
  await expect(screen.page.getByTestId('lobby-count')).toContainText('1 person joined');

  await context.close();
  await screen.context.close();
});

test('when names are required, the scan link opens the name step with your last name ready to confirm', async ({ request, browser }) => {
  const first = await startSession(request, true);
  const second = await startSession(request, true);

  const context = await phone(browser);
  const page = await context.newPage();
  await page.goto(`/join/${first.pin}`);
  await page.getByTestId('name-input').fill('Grace');
  await page.getByTestId('name-submit').click();
  await expect(page.getByTestId('waiting-lobby')).toBeVisible();

  // A different session on the same phone: one tap, because the name is remembered.
  await page.goto(`/join/${second.pin}`);
  await expect(page.getByTestId('name-input')).toHaveValue('Grace');
  await page.getByTestId('name-submit').click();
  await expect(page.getByTestId('waiting-lobby')).toBeVisible();
  await expect(page.getByTestId('participant-name')).toContainText('Grace');
  await context.close();
});
