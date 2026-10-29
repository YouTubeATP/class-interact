import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { joinAsParticipant } from './helpers';

const opts = (...t: string[]) => t.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));

async function deck(request: APIRequestContext, title: string, slides: unknown[]) {
  const res = await request.post('/api/studio/presentations/import', { data: { schemaVersion: 1, title, slides } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).id as string;
}

async function start(request: APIRequestContext, deckId: string, data: Record<string, unknown> = {}) {
  const s = await (await request.post(`/api/studio/presentations/${deckId}/sessions`, { data: { collectNames: true, mode: 'standalone', ...data } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  return { id: s.id as string, pin: s.pin as string, key: ctl.projectorKey as string };
}

async function dashboard(browser: Browser, id: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`/session/${id}`);
  await expect(page.getByTestId('controls')).toBeVisible();
  return page;
}

async function projector(browser: Browser, s: { id: string; key: string }): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' })).newPage();
  await page.goto(`/project/${s.id}?k=${encodeURIComponent(s.key)}`);
  await expect(page.getByTestId('projector')).toBeVisible();
  return page;
}

test('audience Q&A: ask anonymously, upvote once, moderate, put on screen, answer; premoderation; pulse', async ({ browser, request }) => {
  const s = await start(request, await deck(request, 'Q&A deck', [{ id: 'intro', type: 'content', title: 'Recursion' }, { id: 'p', type: 'poll', question: 'Ready?', options: opts('Yes', 'No') }]));
  const dash = await dashboard(browser, s.id);
  const proj = await projector(browser, s);
  const ada = await joinAsParticipant(browser, s.pin, 'Ada');
  const alan = await joinAsParticipant(browser, s.pin, 'Alan');

  // ask, during the lobby (Q&A works on every screen)
  await ada.page.getByTestId('qa-open').click();
  await ada.page.getByTestId('qa-input').fill('Can you explain the base case again?');
  await ada.page.getByTestId('qa-anonymous').check();
  await ada.page.getByTestId('qa-send').click();
  await expect(ada.page.getByTestId('qa-item')).toHaveCount(1);
  await expect(ada.page.getByTestId('qa-item')).toContainText('You');
  await expect(ada.page.getByTestId('qa-vote')).toBeDisabled(); // never on your own question

  await dash.getByTestId('tab-qa').click();
  const row = dash.getByTestId('qa-row').filter({ hasText: 'base case' });
  await expect(row).toContainText('Anonymous');
  await expect(row).not.toContainText('Ada');

  // one vote per person: a second click takes the vote back
  await alan.page.getByTestId('qa-open').click();
  await expect(alan.page.getByTestId('qa-item')).toContainText('Anonymous');
  await alan.page.getByTestId('qa-vote').click();
  await expect(row).toContainText('1');
  await alan.page.getByTestId('qa-vote').click();
  await expect(row.locator('.tabular').first()).toHaveText('0');
  await alan.page.getByTestId('qa-vote').click();
  await expect(row.locator('.tabular').first()).toHaveText('1');

  // on the projector, then answered
  await row.getByTestId('qa-highlight').click();
  await expect(proj.getByTestId('stage-highlight')).toContainText('Can you explain the base case again?');
  await row.getByTestId('qa-answer').click();
  await expect(ada.page.getByTestId('qa-item')).toContainText('Answered');
  // answered questions move to their own list, where they can still be taken off the screen
  await dash.getByRole('tab', { name: 'Answered' }).click();
  await row.getByTestId('qa-highlight').click();
  await expect(proj.getByTestId('stage-highlight')).toHaveCount(0);

  // premoderation: Alan's question waits; nobody else sees it until approved
  await dash.getByTestId('tab-qa').click();
  await dash.getByRole('tab', { name: /^Open/ }).click();
  await dash.getByTestId('qa-premoderate').click();
  await expect(dash.getByTestId('qa-premoderate')).toBeChecked(); // applied by the server
  await alan.page.getByTestId('qa-input').fill('Is this on the exam?');
  await alan.page.getByTestId('qa-send').click();
  await expect(alan.page.getByTestId('qa-item').filter({ hasText: 'exam' })).toContainText('Waiting for approval');
  const pending = dash.getByTestId('qa-row').filter({ hasText: 'exam' });
  await expect(pending).toHaveAttribute('data-status', 'pending');
  await expect(ada.page.getByTestId('qa-item').filter({ hasText: 'exam' })).toHaveCount(0);
  await pending.getByTestId('qa-approve').click();
  await expect(ada.page.getByTestId('qa-item').filter({ hasText: 'exam' })).toBeVisible();
  // hide removes it from everyone's list, but the presenter keeps it
  await dash.getByTestId('qa-row').filter({ hasText: 'exam' }).getByTestId('qa-hide').click();
  await expect(ada.page.getByTestId('qa-item').filter({ hasText: 'exam' })).toHaveCount(0);

  // the understanding pulse: anonymous counts for the presenter only
  await ada.page.keyboard.press('Escape');
  await alan.page.keyboard.press('Escape');
  await ada.page.getByTestId('pulse-lost').click();
  await alan.page.getByTestId('pulse-got').click();
  await expect(ada.page.getByTestId('pulse-lost')).toHaveAttribute('aria-checked', 'true');
  await dash.getByTestId('tab-pulse').click();
  await expect(dash.getByTestId('pulse-panel')).toContainText('2 of 2 people');
  await expect(dash.getByTestId('pulse-panel')).not.toContainText('Ada');
  await expect(proj.getByTestId('projector')).not.toContainText('Lost');

  for (const p of [ada, alan]) await p.context.close();
  await dash.context().close();
  await proj.context().close();
});

test('access links: a moderator cannot change the screen, a co-presenter can, and revoking cuts them off', async ({ browser, request }) => {
  const s = await start(request, await deck(request, 'Roles deck', [{ id: 'a', type: 'content', title: 'One' }, { id: 'b', type: 'content', title: 'Two' }]));
  const dash = await dashboard(browser, s.id);
  await dash.getByTestId('tab-access').click();

  const link = async (role: 'moderator' | 'copresenter') => {
    await dash.getByTestId(`grant-role-${role}`).click();
    await dash.getByTestId('grant-create').click();
    const url = (await dash.getByTestId('grant-url').textContent())!;
    expect(url).toContain('#g=');
    expect(url).not.toContain(s.key);
    return url;
  };
  const phone = async (url: string) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(url);
    await expect(page.getByTestId('remote')).toBeVisible();
    return page;
  };

  const mod = await phone(await link('moderator'));
  await expect(mod.getByTestId('remote')).toContainText('Moderator');
  await expect(mod.getByTestId('ctl-primary')).toHaveCount(0);
  await expect(mod.getByTestId('screen-controls')).toHaveCount(0);
  await expect(mod.getByTestId('tab-qa')).toBeVisible();
  await expect(mod.getByTestId('tab-access')).toHaveCount(0);

  const co = await phone(await link('copresenter'));
  await expect(co.getByTestId('remote')).toContainText('Co-presenter');
  await co.getByTestId('ctl-primary').click(); // start: everyone follows
  await expect(dash.getByTestId('controls')).not.toContainText('Start');
  await expect(co.getByTestId('show-join-qr')).toBeVisible();
  await expect(co.getByTestId('tab-access')).toHaveCount(0);

  // revoke the moderator: their remote stops at once
  await dash.getByTestId('grant-row').filter({ hasText: 'Moderator' }).getByTestId('grant-revoke').click();
  await expect(mod.getByText('This access link was revoked')).toBeVisible();
  // and the link no longer opens anything
  const again = await (await browser.newContext()).newPage();
  await again.goto(mod.url());
  await expect(again.getByText(/not valid|revoked|Could not open/i).first()).toBeVisible();

  for (const p of [mod, co, again, dash]) await p.context().close();
});

test('typed and numeric answers, teacher review of near misses, then a practice round and before/after compare', async ({ browser, request }) => {
  const s = await start(request, await deck(request, 'Typed deck', [
    { id: 't', type: 'quiz', kind: 'text', question: 'Which keyword starts a loop over a list?', acceptedAnswers: ['for'], options: [] },
    { id: 'n', type: 'quiz', kind: 'numeric', question: 'What is 7 × 6?', numeric: { value: 42, unit: 'cm' }, options: [] },
  ]));
  const dash = await dashboard(browser, s.id);
  const ada = await joinAsParticipant(browser, s.pin, 'Ada');
  const alan = await joinAsParticipant(browser, s.pin, 'Alan');

  await dash.getByTestId('ctl-primary').click(); // open the typed question
  await ada.page.getByTestId('typed-input').fill('  FOR ');
  await ada.page.getByTestId('quiz-submit').click();
  await alan.page.getByTestId('typed-input').fill('while');
  await alan.page.getByTestId('quiz-submit').click();
  await expect(dash.getByTestId('answered')).toContainText('2 of 2 answered');
  await dash.getByTestId('ctl-primary').click(); // close
  await dash.getByTestId('ctl-primary').click(); // reveal
  await expect(ada.page.getByTestId('quiz-feedback')).toContainText('Correct');
  await expect(alan.page.getByTestId('quiz-feedback')).not.toContainText('Correct!');

  // a second round, for practice: earlier points stay, the new answers are kept apart
  await dash.getByTestId('ctl-run-again').click();
  await dash.getByTestId('run-scoring-practice').click();
  await dash.getByTestId('run-again-confirm').click();
  await expect(dash.getByTestId('run-badge')).toContainText('2');
  await expect(alan.page.getByTestId('typed-input')).toHaveValue('');
  await alan.page.getByTestId('typed-input').fill('for');
  await alan.page.getByTestId('quiz-submit').click();
  await ada.page.getByTestId('typed-input').fill('for');
  await ada.page.getByTestId('quiz-submit').click();
  await expect(dash.getByTestId('answered')).toContainText('2 of 2 answered');
  await dash.getByTestId('ctl-primary').click();
  await dash.getByTestId('ctl-primary').click();
  await dash.getByTestId('tab-compare').click();
  await expect(dash.getByTestId('compare-delta')).toContainText('50');

  // numeric, with a near miss going to review
  await dash.getByTestId('ctl-primary').click(); // next slide
  await expect(dash.getByTestId('controls')).toContainText('What is 7 × 6?').catch(() => {});
  if (/open responses/i.test((await dash.getByTestId('ctl-primary').textContent()) ?? '')) await dash.getByTestId('ctl-primary').click();
  await expect(ada.page.getByText('cm', { exact: true })).toBeVisible();
  await ada.page.getByTestId('typed-input').fill('42');
  await ada.page.getByTestId('quiz-submit').click();
  await alan.page.getByTestId('typed-input').fill('41.8');
  await alan.page.getByTestId('quiz-submit').click();
  await expect(dash.getByTestId('answered')).toContainText('2 of 2 answered');
  await dash.getByTestId('tab-review').click();
  const item = dash.getByTestId('review-item').filter({ hasText: '41.8' });
  await expect(item).toBeVisible();
  await item.getByTestId('review-accept').click();
  await dash.getByTestId('ctl-primary').click();
  await dash.getByTestId('ctl-primary').click();
  await expect(alan.page.getByTestId('quiz-feedback')).toContainText('Correct');

  for (const p of [ada, alan]) await p.context.close();
  await dash.context().close();
});

test('a break pauses everyone without touching the activity, and analytics and the CSV export reflect the session', async ({ browser, request }) => {
  const s = await start(request, await deck(request, 'Break deck', [
    { id: 'q', type: 'quiz', question: 'Capital of France?', options: [{ id: 'a', text: 'Paris' }, { id: 'b', text: 'Lyon', misconception: 'Biggest city is the capital' }], correctOptionId: 'a', concepts: ['Geography'] },
  ]));
  const dash = await dashboard(browser, s.id);
  const proj = await projector(browser, s);
  const ada = await joinAsParticipant(browser, s.pin, 'Ada');
  await dash.getByTestId('ctl-primary').click();
  await ada.page.getByRole('button', { name: /Lyon$/ }).click();
  await expect(dash.getByTestId('answered')).toContainText('1 of 1 answered');

  await dash.getByTestId('open-break').click();
  await dash.getByTestId('break-minutes').fill('5');
  await dash.getByTestId('break-start').click();
  await expect(ada.page.getByTestId('participant-break')).toContainText('Break');
  await expect(proj.getByTestId('projector')).toContainText('Break');
  await dash.getByTestId('end-break').click();
  await expect(ada.page.getByTestId('participant-break')).toHaveCount(0);
  await expect(dash.getByTestId('answered')).toContainText('1 of 1 answered'); // the activity is untouched

  const a = await (await request.get(`/api/studio/sessions/${s.id}/analytics`)).json();
  const stat = a.analytics.questions[0];
  expect(stat).toMatchObject({ respondents: 1, correctRate: 0, concepts: ['Geography'] });
  expect(a.analytics.misconceptions[0]).toMatchObject({ misconception: 'Biggest city is the capital', count: 1 });
  const csv = await (await request.get(`/api/studio/sessions/${s.id}/export.csv`)).text();
  expect(csv.split('\n')[0]).toContain('run');
  expect(csv).toContain('Lyon');

  for (const p of [ada.page, dash, proj]) await p.context().close();
});
