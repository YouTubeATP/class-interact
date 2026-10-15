import { expect, test, type Page } from '@playwright/test';
import { waitSaved } from './helpers';

/**
 * The AI assistant in the editor, against a scripted stand-in for the model (scripts/fake-llm.mjs).
 * No real service is ever called from tests.
 */
async function newDeck(page: Page, title: string) {
  await page.goto('/studio');
  await page.getByTestId('new-presentation').click();
  await page.getByTestId('prompt-input').fill(title);
  await page.getByTestId('prompt-submit').click();
  await expect(page).toHaveURL(/\/studio\/.+/);
}

async function ask(page: Page, text: string) {
  await page.getByTestId('ai-input').fill(text);
  await page.getByTestId('ai-send').click();
}

test('the assistant builds slides in the live editor, retries after a rejected call, and can be undone', async ({ page }) => {
  await newDeck(page, 'AI deck');
  await expect(page.getByTestId('slide-row')).toHaveCount(0);

  await page.getByTestId('ai-open').click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await expect(page.getByTestId('ai-welcome')).toBeVisible();

  // a request: the model calls a tool, the browser runs it, the model sees the result and answers
  await ask(page, 'Create a quiz about planets');
  await expect(page.getByTestId('ai-user-message')).toContainText('Create a quiz about planets');
  await expect(page.getByTestId('ai-tool').first()).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('ai-assistant-message').last()).toContainText('All done');
  await expect(page.getByTestId('slide-row')).toHaveCount(2);
  await expect(page.getByTestId('editor-title')).toHaveText('AI deck');
  // the change went through the normal editor path: it validates and autosaves
  await waitSaved(page);
  // and it is really in the editor, not just in the chat
  await page.getByTestId('slide-select').nth(1).click();
  await expect(page.getByTestId('quiz-question')).toHaveValue('Which planet is closest to the Sun?');

  // undo puts the deck back as it was before the assistant touched it
  await page.getByTestId('ai-undo').click();
  await expect(page.getByTestId('slide-row')).toHaveCount(0);
  await waitSaved(page);
  await expect(page.getByTestId('ai-undo')).toHaveCount(0);

  // a bad call is rejected with the validator's message; the model fixes it itself
  await ask(page, 'Create an invalid quiz please');
  await expect(page.getByTestId('ai-tool').filter({ hasText: 'Could not add those slides' })).toBeVisible();
  await expect(page.getByTestId('slide-row')).toHaveCount(1);
  await expect(page.getByTestId('ai-assistant-message').last()).toContainText('All done');
  await waitSaved(page);

  // a new chat clears the conversation but keeps the deck
  await page.getByTestId('ai-new-chat').click();
  await expect(page.getByTestId('ai-welcome')).toBeVisible();
  await expect(page.getByTestId('slide-row')).toHaveCount(1);

  await page.getByTestId('ai-close').click();
  await expect(page.getByTestId('ai-panel')).toHaveCount(0);
});

test('a failing model shows a plain message and leaves the deck alone', async ({ page }) => {
  await newDeck(page, 'AI errors');
  await page.getByTestId('ai-open').click();
  await ask(page, 'this is BROKEN');
  await expect(page.getByTestId('ai-error')).toContainText('The AI service had a problem');
  await expect(page.getByTestId('ai-error')).not.toContainText('secret-internal-detail');
  await expect(page.getByTestId('slide-row')).toHaveCount(0);
  // and the assistant is usable again afterwards
  await ask(page, 'Create a quiz about planets');
  await expect(page.getByTestId('slide-row')).toHaveCount(2);
});

test('the assistant ships separately: the chat code is not loaded until it is opened', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', (r) => { if (r.request().resourceType() === 'script') scripts.push(r.url()); });
  await newDeck(page, 'Lazy');
  await expect(page.getByTestId('ai-open')).toBeVisible();
  const before = scripts.length;
  await page.getByTestId('ai-open').click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  expect(scripts.length).toBeGreaterThan(before);
  // the join page (what every phone loads) never pulls it in
  const phoneScripts: string[] = [];
  const phone = await page.context().newPage();
  phone.on('response', (r) => { if (r.request().resourceType() === 'script') phoneScripts.push(r.url()); });
  await phone.goto('/join');
  await expect(phone.getByTestId('pin-input')).toBeVisible();
  await phone.waitForLoadState('networkidle');
  expect(phoneScripts.some((u) => /AiAssistant/.test(u))).toBe(false);
});
