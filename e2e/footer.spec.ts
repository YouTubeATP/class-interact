import { expect, test } from '@playwright/test';

test('the credit line is on the home page and the Studio library, not on the projector or phone screens', async ({ page, request, browser }) => {
  for (const path of ['/', '/studio']) {
    await page.goto(path);
    const footer = page.getByTestId('site-footer');
    await expect(footer).toContainText('Built with');
    const link = footer.getByRole('link', { name: 'AnsonWPH' });
    await expect(link).toHaveAttribute('href', 'https://ansonwph.me');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  }

  // an audience screen has nothing but the activity on it
  const decks = await (await request.get('/api/studio/presentations')).json();
  const s = await (await request.post(`/api/studio/presentations/${decks[0].id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();
  const ctl = await (await request.get(`/api/studio/sessions/${s.id}/control`)).json();
  const projector = await browser.newPage();
  await projector.goto(`/project/${s.id}?k=${encodeURIComponent(ctl.projectorKey)}`);
  await expect(projector.getByTestId('projector')).toBeVisible();
  await expect(projector.getByTestId('site-footer')).toHaveCount(0);
  const phone = await browser.newPage();
  await phone.goto(`/join/${s.pin}`);
  await expect(phone.getByTestId('waiting-lobby')).toBeVisible();
  await expect(phone.getByTestId('site-footer')).toHaveCount(0);
});
