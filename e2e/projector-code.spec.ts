import { expect, test } from '@playwright/test';
import { readPin } from './helpers';

/** Presenter controls from a laptop; a school computer types the projector code on the normal join page and becomes the projector. */
test('typing the projector code on another computer opens the projector', async ({ browser, request, page: dash }) => {
  const decks = await (await request.get('/api/studio/presentations')).json();
  const deck = decks.find((d: { title: string }) => d.title.startsWith('Workshop'));
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();

  await dash.goto(`/session/${s.id}`);
  const pin = await readPin(dash);
  const code = (await dash.getByTestId('projector-code').getAttribute('data-code'))!;
  expect(code).toMatch(/^\d{6}$/);
  expect(code).not.toBe(pin);

  // a different computer: no link, no key, just the code
  const school = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const screen = await school.newPage();
  await screen.goto('/');
  await screen.getByTestId('pin-input').fill('000000');
  await screen.getByTestId('pin-submit').click();
  await expect(screen.getByRole('alert')).toContainText('No live session');
  await screen.getByTestId('pin-input').fill(code);
  await screen.getByTestId('pin-submit').click();
  await expect(screen).toHaveURL(/\/project\//);
  await expect(screen.getByTestId('lobby-heading')).toHaveText('Join this session');
  await expect(screen.getByTestId('ticket-pin')).toHaveAttribute('data-pin', pin);

  // the join PIN still joins as a participant, not as a projector
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  await p.goto('/');
  await p.getByTestId('pin-input').fill(pin);
  await p.getByTestId('pin-submit').click();
  await expect(p).toHaveURL(/\/play\//);

  await school.close();
  await phone.close();
});
