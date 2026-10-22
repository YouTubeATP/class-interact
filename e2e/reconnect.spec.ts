import { expect, test, type WebSocketRoute } from '@playwright/test';

/**
 * A phone that loses its connection for a moment (the server restarting, a lift, a locked screen) must not lose the
 * student's answer. The test really cuts the phone's WebSocket and refuses new connections until it says otherwise.
 */
test('an answer tapped while the phone is reconnecting is held and sent as soon as it is back', async ({ browser, request }) => {
  const opts = (...t: string[]) => t.map((text, i) => ({ id: `o${i}`, text }));
  const deck = await (await request.post('/api/studio/presentations/import', { data: { schemaVersion: 1, title: 'Reconnect deck', slides: [
    { id: 'q', type: 'quiz', question: 'Which one is right?', options: opts('Alpha', 'Beta', 'Gamma'), correctOptionId: 'o1', timeLimitSec: 120 },
  ] } })).json();
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  let blocked = false;
  let live: WebSocketRoute | null = null;
  await phone.routeWebSocket(/socket\.io/, (ws) => {
    if (blocked) { void ws.close(); return; }
    live = ws;
    ws.connectToServer();
  });
  await phone.route(/socket\.io\/\?/, (r) => (blocked ? r.abort() : r.continue())); // the polling fallback too

  await phone.goto(`/join/${s.pin}`);
  await expect(phone.getByTestId('waiting-lobby')).toBeVisible();
  const presenter = await browser.newPage();
  await presenter.goto(`/session/${s.id}`);
  await presenter.getByTestId('ctl-primary').click();
  await expect(phone.getByText('Which one is right?')).toBeVisible();

  // the connection drops and the phone notices...
  blocked = true;
  await live!.close();
  await expect(phone.getByText(/Connection lost/)).toBeVisible();
  // ...and the student taps an answer during the gap
  await phone.getByText('Beta').click();
  await phone.waitForTimeout(1500);
  await expect(phone.getByText('Answer locked in')).toHaveCount(0);
  blocked = false;

  // back online: the held answer goes through without another tap, and the presenter counts it
  await expect(phone.getByText('Answer locked in')).toBeVisible({ timeout: 25_000 });
  await expect(presenter.getByTestId('answered')).toContainText('1 of 1', { timeout: 10_000 });
  // and no stale "offline" message is left on the phone
  await expect(phone.getByText('You are offline')).toHaveCount(0);
  await context.close();
});
