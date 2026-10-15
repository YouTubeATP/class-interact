import { expect, test } from '@playwright/test';
import { confirmStart, joinAsParticipant, openProjector, readPin, waitSaved } from './helpers';

/** A "select all that apply" question: authored in the editor, answered with check boxes, graded with partial credit. */
test('multiple-answer quiz: tick several, lock in, and get graded with partial credit', async ({ browser, page: presenter }) => {
  await presenter.goto('/studio');
  await presenter.getByTestId('new-presentation').click();
  await presenter.getByTestId('prompt-input').fill('Select all');
  await presenter.getByTestId('prompt-submit').click();
  await expect(presenter).toHaveURL(/\/studio\/.+/);

  await presenter.getByTestId('add-slide').click();
  await presenter.getByTestId('add-quiz').click();
  await presenter.getByTestId('quiz-question').fill('Which are fruit?');
  await presenter.getByLabel('Answer type').selectOption('multiple');
  // Option A is already the answer; also mark Option C
  await expect(presenter.getByRole('checkbox', { name: 'Mark option 1 as a correct answer' })).toHaveAttribute('aria-checked', 'true');
  await presenter.getByRole('checkbox', { name: 'Mark option 3 as a correct answer' }).click();
  await expect(presenter.getByRole('checkbox', { name: 'Mark option 3 as a correct answer' })).toHaveAttribute('aria-checked', 'true');
  await waitSaved(presenter);

  await presenter.getByTestId('editor-start').click();
  await confirmStart(presenter, { mode: 'standalone', names: true });
  const pin = await readPin(presenter);
  const projector = await openProjector(browser, presenter);
  const half = await joinAsParticipant(browser, pin, 'Half');
  const full = await joinAsParticipant(browser, pin, 'Full');

  await presenter.getByTestId('ctl-primary').click(); // start
  await expect(projector.getByTestId('stage-multi-hint')).toHaveText('Select all that apply');
  for (const p of [half, full]) await expect(p.page.getByTestId('quiz-multi-hint')).toBeVisible();

  // ticking does not send anything yet: the button counts the ticks and nothing is locked in
  const tick = (p: typeof half, label: string) => p.page.getByRole('checkbox', { name: new RegExp(`${label}$`) }).click();
  await tick(half, 'Option A');
  await expect(half.page.getByTestId('quiz-submit')).toHaveText('Lock in 1 answer');
  await expect(presenter.getByTestId('answered')).toContainText('0 of 2 answered');
  await half.page.getByTestId('quiz-submit').click();
  await expect(half.page.getByTestId('received')).toContainText('locked in');

  await tick(full, 'Option A');
  await tick(full, 'Option C');
  await expect(full.page.getByTestId('quiz-submit')).toHaveText('Lock in 2 answers');
  await full.page.getByTestId('quiz-submit').click();
  await expect(presenter.getByTestId('answered')).toContainText('2 of 2 answered');

  // the answer key is not on the projector before the reveal
  await expect(projector.getByLabel('Correct answer')).toHaveCount(0);

  await presenter.getByTestId('ctl-primary').click(); // close responses
  await presenter.getByTestId('ctl-primary').click(); // reveal
  await expect(projector.getByLabel('Correct answer')).toHaveCount(2);
  await expect(full.page.getByTestId('quiz-feedback')).toContainText('Correct!');
  await expect(half.page.getByTestId('quiz-feedback')).toContainText('Partly right');
  await expect(half.page.getByTestId('quiz-feedback')).toContainText('50%');
  await expect(half.page.getByTestId('quiz-feedback')).toContainText('+500 points');

  for (const p of [half, full]) await p.context.close();
  await projector.context().close();
});
