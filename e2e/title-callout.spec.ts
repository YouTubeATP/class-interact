import { expect, test } from '@playwright/test';
import { waitSaved } from './helpers';

/** Title slides render only a heading and subtitle, so the editor must not offer a callout there. */
test('callouts are unavailable on title slides and available on other layouts', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('new-presentation').click();
  await page.getByTestId('prompt-input').fill('Callout rules');
  await page.getByTestId('prompt-submit').click();
  await expect(page).toHaveURL(/\/studio\/.+/);

  await page.getByTestId('add-slide').click();
  await page.getByTestId('add-content').click();
  const callout = page.getByRole('switch', { name: /Highlight an important note/ });

  // a title and nothing else resolves to the title layout: the callout switch is disabled
  await page.getByTestId('content-title').fill('Welcome');
  await page.getByTestId('content-body').fill('');
  await waitSaved(page);
  await expect(callout).toBeDisabled();
  await expect(page.getByText('Title slides do not show callouts')).toBeVisible();

  // adding body text makes it an ordinary text slide, where callouts work
  await page.getByTestId('content-body').fill('Some body text');
  await expect(callout).toBeEnabled();
  await callout.click();
  await expect(page.getByLabel('Text', { exact: true }).last()).toBeVisible();
});
