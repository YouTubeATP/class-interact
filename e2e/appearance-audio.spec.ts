import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { joinAsParticipant } from './helpers';

const opts = (...t: string[]) => t.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));

async function session(request: APIRequestContext, slides: unknown[], data: Record<string, unknown> = {}) {
  const deck = await (await request.post('/api/studio/presentations/import', { data: { schemaVersion: 1, title: 'Look and sound', slides } })).json();
  const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: true, mode: 'standalone', ...data } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  return { id: s.id as string, pin: s.pin as string, key: ctl.projectorKey as string, deckId: deck.id as string };
}

/** Records the theme at the moment <body> is created: if it is already right, nothing ever painted in the wrong one. */
async function themeAtFirstPaint(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      if (document.body) {
        (window as any).__firstTheme = document.documentElement.getAttribute('data-theme');
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
}
const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const firstTheme = (page: Page) => page.evaluate(() => (window as any).__firstTheme as string | null);
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('dark mode: follows the system by default, persists without a flash, and presenter and participant choices are separate', async ({ browser }, info) => {
  // System default, in a dark OS
  const darkOs = await browser.newContext({ colorScheme: 'dark' });
  const d = await darkOs.newPage();
  await d.goto('/studio');
  await expect.poll(() => theme(d)).toBe('dark');
  await darkOs.close();

  // a light OS; the presenter picks dark in Settings
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await themeAtFirstPaint(page);
  await page.goto('/settings');
  expect(await theme(page)).toBe('light');
  const lightBg = await bodyBg(page);
  await info.attach('settings-light', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByTestId('appearance-dark').click();
  await expect.poll(() => theme(page)).toBe('dark');
  await page.reload();
  expect(await firstTheme(page)).toBe('dark'); // applied before the first paint
  expect(await bodyBg(page)).not.toBe(lightBg);
  await info.attach('settings-dark', { body: await page.screenshot(), contentType: 'image/png' });

  // the studio library and the join page in the same browser
  await page.goto('/studio');
  expect(await firstTheme(page)).toBe('dark');
  await info.attach('library-dark', { body: await page.screenshot(), contentType: 'image/png' });
  await page.goto('/join');
  expect(await firstTheme(page)).toBe('light'); // participants have their own choice (still System, light OS)
  await info.attach('join-light', { body: await page.screenshot(), contentType: 'image/png' });

  // the participant chooses dark on the join page; the presenter then switches back to light
  const toggle = page.getByTestId('appearance-menu');
  for (let i = 0; i < 3 && (await toggle.getAttribute('data-pref')) !== 'dark'; i++) await toggle.click();
  await expect(toggle).toHaveAttribute('data-pref', 'dark');
  await expect.poll(() => theme(page)).toBe('dark');
  await info.attach('join-dark', { body: await page.screenshot(), contentType: 'image/png' });
  await page.goto('/settings');
  await page.getByTestId('appearance-light').click();
  await page.goto('/join');
  expect(await firstTheme(page)).toBe('dark');
  await ctx.close();
});

test('the projector ignores its computer’s dark mode; the presenter chooses, and the QR stays black on white', async ({ browser, request }, info) => {
  const s = await session(request, [{ id: 'c', type: 'content', title: 'Hello' }]);
  const proj = await (await browser.newContext({ colorScheme: 'dark', viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' })).newPage();
  await proj.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
  const stage = proj.locator('[data-testid="projector"] [data-appearance]').first();
  await expect(stage).toHaveAttribute('data-appearance', 'light');
  await info.attach('projector-light', { body: await proj.screenshot(), contentType: 'image/png' });

  const dash = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await dash.goto(`/session/${s.id}`);
  await dash.getByTestId('projector-appearance').selectOption('dark');
  await expect(stage).toHaveAttribute('data-appearance', 'dark');
  const fill = await proj.getByTestId('join-poster').getByTestId('qr-code').evaluate((el) => getComputedStyle(el.querySelector('rect')!).fill);
  expect(fill).toBe('rgb(255, 255, 255)');
  // the PIN stays readable on the (always light) ticket
  await expect(proj.getByTestId('join-poster').getByTestId('ticket-pin')).toBeVisible();
  await info.attach('projector-dark', { body: await proj.screenshot(), contentType: 'image/png' });
  for (const p of [proj, dash]) await p.context().close();
});

test('sound: the projector asks for a click, plays accepted changes once, never replays on reload, and the presenter controls the room', async ({ browser, request }) => {
  const s = await session(request, [{ id: 'p', type: 'poll', question: 'Ready?', options: opts('Yes', 'No') }, { id: 'c', type: 'content', title: 'Bye' }]);
  const proj = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await proj.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
  const audioState = () => proj.evaluate(() => (window as any).__ciAudio.state());
  const played = () => proj.evaluate(() => ((window as any).__ciAudio.log as { id: string; kind: string }[]).filter((e) => e.kind === 'sfx').map((e) => e.id));

  // autoplay: nothing can play until someone clicks
  await expect(proj.getByTestId('enable-sound')).toBeVisible();
  expect(await audioState()).toBe('blocked');
  await proj.getByTestId('enable-sound').click();
  await expect.poll(audioState).toBe('running');
  await expect(proj.getByTestId('enable-sound')).toHaveCount(0);

  const dash = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await dash.goto(`/session/${s.id}`);
  // "Subtle" (the default) keeps to essential cues: a join is a flourish, so it stays silent
  const phone = await joinAsParticipant(browser, s.pin, 'Ada');
  await expect(proj.getByTestId('projector')).toContainText('Ada');
  await proj.waitForTimeout(700);
  expect(await played()).not.toContain('joined');
  // at "Playful" the room hears people arrive
  await dash.getByTestId('projector-sound').selectOption('playful');
  await expect.poll(() => proj.evaluate(() => (window as any).__ciAudio.settings().level)).toBe('playful');
  const second = await joinAsParticipant(browser, s.pin, 'Alan');
  await expect.poll(played).toContain('joined');
  await second.context.close();

  await dash.getByTestId('ctl-primary').click();
  await expect.poll(played).toContain('sessionStart');
  await proj.waitForTimeout(800);
  expect((await played()).filter((x) => x === 'sessionStart')).toHaveLength(1);

  // a reload (or a late projector) starts silent: no history is replayed
  await proj.reload();
  await expect(proj.getByTestId('projector')).toBeVisible();
  await proj.waitForTimeout(1500);
  expect(await played()).toEqual([]);

  // the presenter turns the room's sound off from the dashboard
  await dash.getByTestId('projector-mute').click();
  await expect.poll(() => proj.evaluate(() => (window as any).__ciAudio.settings().level)).toBe('off');

  // phones: quiet by default, a mute that persists, and a session-wide switch
  const phoneSettings = () => phone.page.evaluate(() => (window as any).__ciAudio.settings());
  expect((await phoneSettings()).musicEnabled).toBe(false);
  await phone.page.getByTestId('mute-toggle').click();
  await expect(phone.page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  await phone.page.reload();
  await expect(phone.page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await phone.page.evaluate(() => localStorage.getItem('ci:sound:studio'))).toBeNull(); // presenter settings untouched
  await dash.getByTestId('phone-sounds').click();
  await expect(dash.getByTestId('phone-sounds')).not.toBeChecked(); // applied by the server
  await expect(phone.page.getByTestId('mute-toggle')).toHaveCount(0);

  for (const p of [proj, dash, phone.page]) await p.context().close();
});

test('rehearsal with simulated participants, kept out of the class record', async ({ browser, request }) => {
  const s = await session(request, [{ id: 'p', type: 'poll', question: 'Ready?', options: opts('Yes', 'No') }]);
  const r = await (await request.post(`/api/studio/presentations/${s.deckId}/rehearse`, { data: { participants: 6 } })).json();
  const dash = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await dash.goto(`/session/${r.id}`);
  await expect(dash.getByTestId('rehearsal-bar')).toBeVisible();
  await expect(dash.getByTestId('controls')).toContainText('6 online');
  await dash.getByTestId('ctl-primary').click();
  // simulated people answer on their own
  await expect(dash.getByTestId('answered')).toContainText(/[1-6] of 6 answered/, { timeout: 20_000 });
  const list = await (await request.get('/api/studio/sessions')).json();
  const mine = (Array.isArray(list) ? list : list.sessions ?? []).find((x: { id: string }) => x.id === r.id);
  expect(mine?.rehearsal).toBe(true);
  await dash.context().close();
});

test('self-paced: people work through at their own speed and the presenter sees progress', async ({ browser, request }) => {
  const s = await session(request, [
    { id: 'q1', type: 'quiz', question: '2 + 2?', options: opts('3', '4'), correctOptionId: 'b' },
    { id: 'q2', type: 'poll', question: 'Was that easy?', options: opts('Yes', 'No') },
  ], { mode: 'selfpaced' });
  const dash = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await dash.goto(`/session/${s.id}`);
  await dash.getByTestId('sp-open').click();
  // joining a self-paced session lands on the first question rather than a waiting room
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto('/join');
  await page.getByTestId('pin-input').fill(s.pin);
  await page.getByTestId('pin-submit').click();
  await page.getByTestId('name-input').fill('Ada');
  await page.getByTestId('name-submit').click();
  await expect(page.getByTestId('selfpaced')).toBeVisible();
  await expect(page.getByTestId('selfpaced-progress')).toHaveText('0 of 2 answered');
  await page.getByRole('button', { name: /4$/ }).click(); // one tap answers a single-choice question
  await expect(page.getByTestId('selfpaced-progress')).toHaveText('1 of 2 answered');
  await page.getByTestId('sp-next').click();
  await page.getByRole('radio', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('selfpaced-progress')).toHaveText('2 of 2 answered');
  await page.getByTestId('sp-next').click();
  await expect(page.getByTestId('selfpaced-done')).toBeVisible();
  await expect(dash.getByTestId('sp-people')).toContainText('Ada');
  for (const x of [dash, page]) await x.context().close();
});
