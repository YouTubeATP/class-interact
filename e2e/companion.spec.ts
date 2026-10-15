import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { confirmStart, joinAsParticipant, openProjector, readPin } from './helpers';

const DECK = {
  schemaVersion: 1,
  title: 'Companion kit',
  theme: { palette: 'mint' },
  slides: [
    { type: 'wordcloud', question: 'One word for how you feel', maxSubmissions: 1 },
    { type: 'poll', question: 'Ready for the next part?', options: [{ text: 'Yes' }, { text: 'Almost' }] },
    {
      type: 'survey',
      title: 'Two quick questions',
      questions: [
        { id: 'rate', kind: 'rating', question: 'How was it?', min: 1, max: 5, required: true },
        { id: 'note', kind: 'text', question: 'Anything to add?' },
      ],
    },
  ],
};

test('import JSON → Companion session: launch any activity, standby between, results retained, no re-scan', async ({ browser, page: presenter }) => {
  // Invalid JSON is explained, not swallowed -------------------------------------------------
  await presenter.goto('/studio');
  await presenter.getByTestId('import-open').click();
  await presenter.getByTestId('import-json').fill(JSON.stringify({ schemaVersion: 1, title: 'Bad', slides: [{ type: 'quiz', question: 'Q', options: [{ text: 'only one' }], correctOptionId: 'zzz', timelimit: 5 }] }));
  await presenter.getByTestId('import-submit').click();
  const issues = presenter.getByTestId('issue-list');
  await expect(issues).toContainText('slides[0].options');
  await expect(issues).toContainText('Did you mean "timeLimitSec"?');

  // ...and a valid document imports with defaults filled in ---------------------------------------
  await presenter.getByTestId('import-json').fill(JSON.stringify(DECK));
  await presenter.getByTestId('import-submit').click();
  await expect(presenter).toHaveURL(/\/studio\/.+/);
  await expect(presenter.getByTestId('slide-row')).toHaveCount(3);
  await presenter.getByTestId('tab-json').click();
  await expect(presenter.getByTestId('json-text')).toHaveValue(/"schemaVersion": 1/);
  await expect(presenter.getByTestId('json-text')).toHaveValue(/"id": "slide-1"/); // ids were generated

  // Start in Companion mode -----------------------------------------------------------------------------
  await presenter.getByTestId('editor-start').click();
  await confirmStart(presenter, { mode: 'companion', names: true });
  await expect(presenter).toHaveURL(/\/session\/.+/);
  await expect(presenter.getByTestId('activity-launcher')).toBeVisible();
  await expect(presenter.getByTestId('ctl-next')).toHaveCount(0); // no rigid sequence in Companion
  const pin = await readPin(presenter);
  const projector = await openProjector(browser, presenter);
  const ada = await joinAsParticipant(browser, pin, 'Ada');
  const bo = await joinAsParticipant(browser, pin, 'Bo');

  // Launch the *third* activity directly, first --------------------------------------------------------
  await presenter.getByTestId('launch-card').nth(2).getByRole('button', { name: 'Launch' }).click();
  await expect(ada.page.getByTestId('participant-survey')).toBeVisible();
  await expect(projector.getByTestId('stage-question')).toHaveText('Two quick questions');
  await ada.page.getByRole('radio', { name: '4' }).click();
  await ada.page.getByTestId('survey-submit').click();
  await expect(ada.page.getByTestId('received')).toContainText('Survey submitted');

  // The presenter goes to Canva / PowerPoint: everyone sits on standby, nobody rejoins ------------------
  await presenter.getByTestId('standby').click();
  await expect(projector.getByTestId('lobby-heading')).toHaveText('Back in a moment');
  await expect(ada.page.getByTestId('waiting-standby')).toBeVisible();
  await expect(bo.page.getByTestId('waiting-standby')).toBeVisible();

  // ...then launches a different activity; the same connections pick it up -------------------------------
  await presenter.getByTestId('launch-card').nth(0).getByRole('button', { name: 'Launch' }).click();
  await expect(ada.page.getByTestId('participant-wordcloud')).toBeVisible();
  await expect(bo.page.getByTestId('participant-wordcloud')).toBeVisible();
  await bo.page.getByTestId('text-input').fill('curious');
  await bo.page.getByTestId('text-submit').click();
  await expect(projector.getByTestId('stage-responses')).toHaveAttribute('data-value', '1');

  // Back to the survey: its results are still there, without reopening it ---------------------------------
  await presenter.getByTestId('launch-card').nth(2).getByRole('button', { name: /Show results/ }).click();
  await expect(projector.getByTestId('stage-question')).toHaveText('Two quick questions');
  await expect(projector.getByTestId('stage-phase')).toHaveText('Finished');
  await expect(projector.getByText('average from 1 response')).toBeVisible();
  // the free-text answers stay presenter-only
  await expect(projector.getByText('shown only to the presenter')).toBeVisible();

  // The presenter can flip to Standalone controls mid-session ----------------------------------------------
  await presenter.getByTestId('mode-switch-standalone').click();
  await expect(presenter.getByTestId('lesson-flow')).toBeVisible();

  for (const p of [ada, bo]) await p.context.close();
  await projector.context().close();
});

test('library: export a presentation as JSON and import it again unchanged', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByTestId('deck-card').first()).toBeVisible();
  const card = page.getByTestId('deck-card').filter({ hasText: 'Workshop activity kit' }).first();
  await card.getByRole('button', { name: /More actions/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export JSON' }).click();
  const path = await (await download).path();
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported).toMatchObject({ format: 'classinteract.presentation', schemaVersion: 1, title: 'Workshop activity kit' });
  expect(exported.slides).toHaveLength(6);

  await page.getByTestId('import-open').click();
  await page.getByTestId('import-file').setInputFiles(path);
  await page.getByTestId('import-submit').click();
  await expect(page).toHaveURL(/\/studio\/.+/);
  await expect(page.getByTestId('slide-row')).toHaveCount(6);
  // the re-imported deck exports to identical JSON
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const second = JSON.parse(await readFile(await (await secondDownload).path(), 'utf8'));
  expect(second).toEqual(exported);
});
