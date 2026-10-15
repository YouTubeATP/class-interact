import { expect, test } from '@playwright/test';
import { joinAsParticipant, openProjector, readPin, waitSaved } from './helpers';

/**
 * The core workflow, end to end, with real browsers and no mocks:
 * author a quiz + word cloud in the editor, run a live session with a projector and two phones,
 * refresh a phone mid-session, end the session and read the saved results.
 */
test('author → live session → quiz → word cloud → refresh → end → results', async ({ browser, page: presenter }) => {
  // 1. Presenter builds a presentation in the studio -----------------------------------
  await presenter.goto('/studio');
  await presenter.getByTestId('new-presentation').click();
  await presenter.getByTestId('prompt-input').fill('E2E Demo');
  await presenter.getByTestId('prompt-submit').click();
  await expect(presenter).toHaveURL(/\/studio\/.+/);

  await presenter.getByTestId('add-slide').click();
  await presenter.getByTestId('add-quiz').click();
  await presenter.getByTestId('quiz-question').fill('Which option is the answer?');
  await presenter.getByLabel('Mark option 2 as the correct answer').click(); // "Option B"

  await presenter.getByTestId('add-slide').click();
  await presenter.getByTestId('add-wordcloud').click();
  await presenter.getByTestId('wordcloud-question').fill('Describe today in one word');
  await waitSaved(presenter);
  await expect(presenter.getByTestId('slide-row')).toHaveCount(2);

  // 2. Start a session; a projector and two phones join with the single PIN -------------
  await presenter.getByTestId('editor-start').click();
  await presenter.getByTestId('mode-standalone').click();
  await presenter.getByTestId('start-session-confirm').click();
  await expect(presenter).toHaveURL(/\/session\/.+/);
  const pin = await readPin(presenter);

  const projector = await openProjector(browser, presenter);
  await expect(projector.getByTestId('lobby-heading')).toHaveText('Join this session');
  await expect(projector.getByTestId('ticket-pin')).toHaveAttribute('data-pin', pin);

  const ada = await joinAsParticipant(browser, pin, 'Ada');
  const bo = await joinAsParticipant(browser, pin, 'Bo');
  await expect(projector.getByTestId('lobby-count')).toContainText('2 people joined');
  await expect(presenter.getByTestId('participant-count')).toHaveText('2');

  // a duplicate name is refused politely
  const dup = await browser.newContext();
  const dupPage = await dup.newPage();
  await dupPage.goto(`/join/${pin}`);
  await dupPage.getByTestId('name-input').fill('ada');
  await dupPage.getByTestId('name-submit').click();
  await expect(dupPage.getByRole('alert')).toContainText('already taken');
  await dup.close();

  // 3. Presenter starts: the quiz opens everywhere without anyone touching a phone --------
  await presenter.getByTestId('ctl-primary').click(); // Start presentation
  await expect(projector.getByTestId('stage-question')).toHaveText('Which option is the answer?');
  await expect(projector.getByTestId('stage-phase')).toHaveText('Responses open');
  await expect(ada.page.getByTestId('participant-quiz')).toBeVisible();
  await expect(bo.page.getByTestId('participant-quiz')).toBeVisible();

  // 4. Participants answer; Ada is right, Bo is wrong ---------------------------------------
  const option = (p: typeof ada, text: string) => p.page.getByTestId('participant-quiz').getByRole('button').filter({ hasText: text });
  await option(ada, 'Option B').click();
  await option(bo, 'Option C').click();
  await expect(ada.page.getByTestId('received')).toContainText('locked in');
  await expect(presenter.getByTestId('answered')).toContainText('2 of 2 answered');
  await expect(projector.getByTestId('stage-responses')).toHaveAttribute('data-value', '2');
  // the answer is not leaked before the reveal
  await expect(projector.getByLabel('Correct answer')).toHaveCount(0);
  await expect(ada.page.getByTestId('quiz-feedback')).toHaveCount(0);

  // 5. Presenter reveals; results + the correct answer appear, phones get individual feedback ---
  await presenter.getByTestId('ctl-primary').click(); // Close responses
  await expect(projector.getByTestId('stage-phase')).toHaveText('Responses closed');
  await presenter.getByTestId('ctl-primary').click(); // Reveal answer
  await expect(projector.getByLabel('Correct answer')).toBeVisible();
  await expect(ada.page.getByTestId('quiz-feedback')).toContainText('Correct!');
  await expect(bo.page.getByTestId('quiz-feedback')).toContainText('Not this time');

  // 6. Advance to the word cloud: every screen transitions on its own -----------------------
  await presenter.getByTestId('ctl-primary').click(); // Next
  await expect(projector.getByTestId('stage-question')).toHaveText('Describe today in one word');
  await expect(ada.page.getByTestId('participant-wordcloud')).toBeVisible();
  await expect(bo.page.getByTestId('participant-wordcloud')).toBeVisible();

  // 7. Participants submit text; Savoury / savoury! group into one term -------------------------
  await ada.page.getByTestId('text-input').fill('Savoury');
  await ada.page.getByTestId('text-submit').click();
  await bo.page.getByTestId('text-input').fill('savoury!');
  await bo.page.getByTestId('text-submit').click();
  await bo.page.getByTestId('text-input').fill('Umami');
  await bo.page.getByTestId('text-submit').click();
  await expect(ada.page.getByTestId('my-response')).toHaveText(/Savoury/);

  // 8. The projector shows the aggregated cloud --------------------------------------------------
  await expect(projector.getByTestId('stage-responses')).toHaveAttribute('data-value', '3');
  const cloud = projector.getByRole('img', { name: /^Word cloud:/ });
  await expect(cloud).toHaveAttribute('aria-label', /Savoury/i);
  await expect(cloud.getByText(/savoury/i)).toHaveCount(1); // grouped, not repeated
  await expect(cloud.getByText('Umami')).toBeVisible();

  // 9. A participant refreshes and is back in the same session, with their answer intact ------------
  await ada.page.reload();
  await expect(ada.page.getByTestId('participant-wordcloud')).toBeVisible();
  await expect(ada.page.getByTestId('participant-session-title')).toHaveText('E2E Demo');
  await expect(ada.page.getByTestId('my-response')).toHaveText(/Savoury/);
  await expect(presenter.getByTestId('participant-count')).toHaveText('2'); // not counted twice
  // and she can still use the session after the reconnect
  await ada.page.getByTestId('text-input').fill('calm');
  await ada.page.getByTestId('text-submit').click();
  await expect(projector.getByTestId('stage-responses')).toHaveAttribute('data-value', '4');

  // 10. End the session: everyone sees the closing screen, results stay available ---------------------
  await presenter.getByTestId('end-session').click();
  await presenter.getByTestId('confirm-submit').click();
  await expect(presenter.getByTestId('ended-banner')).toBeVisible();
  await expect(projector.getByTestId('ended-heading')).toHaveText('That’s a wrap');
  await expect(ada.page.getByTestId('participant-ended')).toBeVisible();

  await presenter.getByRole('link', { name: 'View results' }).click();
  await expect(presenter.getByTestId('results-title')).toHaveText('E2E Demo');
  await expect(presenter.getByTestId('result-card')).toHaveCount(2);
  await expect(presenter.getByTestId('stat-responses')).toHaveText('6');
  await expect(presenter.getByTestId('result-card').nth(1).getByText(/savoury/i)).toBeVisible();

  const download = presenter.waitForEvent('download');
  await presenter.getByTestId('export-csv').click();
  const csv = await (await import('node:fs/promises')).readFile(await (await download).path(), 'utf8');
  expect(csv).toContain('slide_number,slide_type');
  expect(csv).toMatch(/Ada,.*Option B,yes,/);
  expect(csv).toMatch(/Bo,.*Option C,no,/);
  expect(csv).toContain('savoury!');

  // results survive a reload (they are persisted, not held in memory)
  await presenter.reload();
  await expect(presenter.getByTestId('result-card')).toHaveCount(2);

  for (const p of [ada, bo]) await p.context.close();
  await projector.context().close();
});
