import { expect, test } from '@playwright/test';
import { joinAsParticipant, openProjector, readPin } from './helpers';

test.describe('MSG: The Secret Ingredient? (seeded through the JSON import pipeline)', () => {
  test('is in the library, previewable, and runs as a live session with observers welcome', async ({ browser, page: presenter }) => {
    await presenter.goto('/studio');
    const card = presenter.getByTestId('deck-card').filter({ hasText: 'MSG: The Secret Ingredient?' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('23 slides');
    await card.getByTestId('edit-presentation').click();
    await expect(presenter.getByTestId('slide-row')).toHaveCount(23);

    // Preview uses the real projector renderer, with a content slide containing the structure image
    await presenter.getByTestId('slide-select').nth(14).click();
    await expect(presenter.getByTestId('preview-stage').getByText('What is MSG?')).toBeVisible();
    await expect(presenter.getByTestId('preview-stage').getByRole('img', { name: /Structural sketch of glutamate/ })).toBeVisible();

    // Start it from the library
    await presenter.goto('/studio');
    await presenter.getByTestId('deck-card').filter({ hasText: 'MSG: The Secret Ingredient?' }).getByTestId('start-session').click();
    await presenter.getByTestId('start-session-confirm').click();
    await expect(presenter).toHaveURL(/\/session\/.+/);
    const pin = await readPin(presenter);
    const projector = await openProjector(browser, presenter);
    const ada = await joinAsParticipant(browser, pin, 'Ada');

    // Standalone: Start → title slide (nothing to submit), → prediction word cloud
    await presenter.getByTestId('ctl-primary').click();
    await expect(projector.getByRole('heading', { name: 'MSG: The Secret Ingredient?' })).toBeVisible();
    await expect(ada.page.getByTestId('participant-content')).toBeVisible();
    await presenter.getByTestId('ctl-primary').click();
    await expect(ada.page.getByTestId('participant-question')).toHaveText('What do you expect MSG to change?');

    // Jump to the precautions slide: observing is an explicit, equal option, and tasting is never required
    await presenter.getByTestId('flow-item').nth(4).click();
    await expect(projector.getByText('Tasting is voluntary')).toBeVisible();
    await expect(projector.getByText('Take the observer role.')).toBeVisible();
    await expect(projector.getByText('You never have to taste to take part.')).toBeVisible();

    // The "how will you take part" poll lets an observer answer without tasting, anonymously
    await presenter.getByTestId('flow-item').nth(5).click();
    await expect(ada.page.getByTestId('participant-poll')).toBeVisible();
    await ada.page.getByRole('radio', { name: /observe quietly/ }).click();
    await ada.page.getByRole('button', { name: 'Submit' }).click();
    await expect(ada.page.getByTestId('received')).toBeVisible();

    // Subjective impressions vs objective claims
    await presenter.getByTestId('flow-item').nth(15).click();
    await expect(projector.getByText('does not prove that MSG makes food taste better for everyone', { exact: false })).toBeVisible();

    await ada.context.close();
    await projector.context().close();
  });
});
