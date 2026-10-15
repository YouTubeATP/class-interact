import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/** The help pages (participants and presenters) and the live tours that run on the real screens. */

async function inViewport(page: Page, loc: Locator, what: string) {
  const box = await loc.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, `${what} has a box`).not.toBeNull();
  expect(box!.x, `${what} left`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${what} top`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${what} right`).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height, `${what} bottom`).toBeLessThanOrEqual(vp.height + 1);
}

/** Steps through the whole tour with Next, checking every card and spotlight is on screen. Returns the step titles. */
async function walk(page: Page, onStep?: (title: string) => Promise<void>) {
  const titles: string[] = [];
  const tour = page.getByTestId('tour');
  for (let guard = 0; guard < 20; guard++) {
    await expect(tour).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('tour-card')).toHaveCSS('opacity', '1');
    const title = (await page.getByTestId('tour-title').innerText()).trim();
    titles.push(title);
    await inViewport(page, page.getByTestId('tour-card'), `card "${title}"`);
    if (await page.getByTestId('tour-spot').count()) await inViewport(page, page.getByTestId('tour-spot'), `spotlight "${title}"`);
    await onStep?.(title);
    const next = page.getByTestId('tour-next');
    const label = (await next.innerText()).trim();
    await next.click();
    if (label === 'Done') break;
    await expect(page.getByTestId('tour-title')).not.toHaveText(title);
  }
  await expect(tour).toHaveCount(0);
  return titles;
}

async function startFromHelpMenu(page: Page) {
  await page.getByTestId('help-menu').click();
  await page.getByTestId('help-tour').click();
  await expect(page.getByTestId('tour')).toBeVisible();
}

async function importDeck(request: APIRequestContext) {
  const opts = (...t: string[]) => t.map((text, i) => ({ id: `o${i}`, text }));
  const res = await request.post('/api/studio/presentations/import', { data: { schemaVersion: 1, title: 'Tour deck', slides: [
    { id: 'c', type: 'content', title: 'Welcome', body: 'Hello' },
    { id: 'q', type: 'quiz', question: 'Pick one', options: opts('A', 'B', 'C'), correctOptionId: 'o1' },
    { id: 'p', type: 'poll', question: 'Poll?', options: opts('Yes', 'No') },
  ] } });
  return (await res.json()) as { id: string };
}

async function noSideScroll(page: Page) {
  await page.waitForTimeout(300);
  const o = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(o.s).toBeLessThanOrEqual(o.w);
  // the page may not scroll sideways yet still clip its content: nothing may poke out past the screen edge
  const poking = await page.evaluate(() => {
    const vw = window.innerWidth;
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="help-title"], [data-testid="help-section"], [data-testid="help-section"] p, [data-testid="faq"]'))
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').slice(0, 30)}"`);
  });
  expect(poking, 'content runs past the screen edge').toEqual([]);
}

test('help comes in two variants: participants (public) and presenters (Studio), reachable from the footer and each other', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('footer-help').click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByTestId('help-participants')).toBeVisible();
  await expect(page.getByTestId('help-title')).toHaveText('Help for participants');
  await expect(page.getByTestId('help-switch-participants')).toHaveAttribute('aria-current', 'page');
  // plain-language content for people in the room, including what they cannot do
  await expect(page.getByTestId('help-section')).toHaveCount(7);
  await expect(page.getByRole('heading', { name: /What you cannot do/ })).toBeVisible();
  await expect(page.getByTestId('help-participants')).not.toContainText('STUDIO_PASSWORD');

  // an FAQ opens
  const faq = page.getByTestId('faq').first();
  await faq.locator('summary').click();
  await expect(faq).toHaveAttribute('open', '');

  // switch to the presenter guide
  await page.getByTestId('help-switch-presenters').click();
  await expect(page).toHaveURL(/\/studio\/help$/);
  await expect(page.getByTestId('help-presenters')).toBeVisible();
  await expect(page.getByTestId('help-title')).toHaveText('Help for presenters');
  await expect(page.getByTestId('help-switch-presenters')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('help-types').locator('> div')).toHaveCount(7);
  // the table of contents scrolls to a section
  await page.getByTestId('help-toc').getByRole('link', { name: 'Codes and passwords' }).click();
  await expect(page.locator('#codes')).toBeInViewport();
  await expect(page.locator('#codes')).toContainText('Projector code');

  // and back
  await page.getByTestId('help-switch-participants').click();
  await expect(page).toHaveURL(/\/help$/);

  // the Studio's own footer and header lead to the presenter guide
  await page.goto('/studio');
  await page.getByTestId('footer-help').click();
  await expect(page).toHaveURL(/\/studio\/help$/);
  await page.getByTestId('help-menu').click();
  await expect(page.getByTestId('help-centre')).toBeVisible();
  await page.getByTestId('help-participants').click();
  await expect(page).toHaveURL(/\/help$/);

  // the join page points newcomers at the help
  await page.goto('/join');
  await page.getByTestId('join-help').click();
  await expect(page).toHaveURL(/\/help$/);
});

test('the Studio tour is offered once, runs over the real page, and stays dismissed', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByTestId('tour-offer')).toBeVisible();
  await page.getByTestId('tour-offer-start').click();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
  const titles = await walk(page);
  expect(titles[0]).toBe('Welcome to the Presenter Studio');
  expect(titles).toContain('Start here');
  expect(titles).toContain('Run it live');
  expect(titles.at(-1)).toBe('Help is always one tap away');
  // finished: not offered again
  await page.reload();
  await expect(page.getByTestId('new-presentation')).toBeVisible();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
  // but it can always be replayed
  await startFromHelpMenu(page);
  await expect(page.getByTestId('tour-title')).toHaveText('Welcome to the Presenter Studio');
});

test('"Not now" dismisses the offer for good, and Esc and the arrow keys work in a tour', async ({ page }) => {
  await page.goto('/studio');
  await page.getByTestId('tour-offer-dismiss').click();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('new-presentation')).toBeVisible();
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);

  await startFromHelpMenu(page);
  await expect(page.getByTestId('tour-progress')).toContainText('Step 1 of');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tour-progress')).toContainText('Step 2 of');
  await expect(page.getByTestId('tour-spot')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('tour-progress')).toContainText('Step 1 of');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour')).toHaveCount(0);
  // the page underneath is usable again
  await page.getByTestId('new-presentation').click();
  await expect(page.getByTestId('prompt-input')).toBeVisible();
});

test('the participant help can start the joining tour on the join page', async ({ page }) => {
  await page.goto('/help');
  await page.getByTestId('tour-start-join').click();
  await expect(page).toHaveURL(/\/join$/);
  const titles = await walk(page);
  expect(titles).toEqual(['Join in a few taps', 'Type the code', 'Or scan the QR code', 'Then wait for the first question']);
});

for (const device of [
  { name: 'laptop', use: { viewport: { width: 1280, height: 720 } } },
  { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
]) {
  test.describe(device.name, () => {
    test.use(device.use);

    test('the editor tour lights up each part, switching panes on a phone', async ({ page, request }) => {
      const deck = await importDeck(request);
      await page.goto(`/studio/${deck.id}`);
      await expect(page.getByTestId('editor-title')).toHaveText('Tour deck');
      await startFromHelpMenu(page);
      const titles = await walk(page, async (title) => {
        // the thing being explained is really on screen
        const spot = page.getByTestId('tour-spot');
        if (title === 'Your slides') await expect(page.getByTestId('slide-row').first()).toBeInViewport();
        if (title === 'Add a slide') await expect(page.getByTestId('add-slide')).toBeInViewport();
        if (title === 'See what the room sees') await expect(spot).toBeVisible();
      });
      for (const t of ['Your slides', 'Add a slide', 'Edit the selected slide', 'It saves itself', 'See what the room sees', 'Keep a copy', 'Run it live']) expect(titles).toContain(t);
      // the tour changed nothing in the deck
      await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    });

    test('the session tour explains the controls', async ({ page, request }) => {
      const deck = await importDeck(request);
      const s = await (await request.post(`/api/studio/presentations/${deck.id}/sessions`, { data: { collectNames: false, mode: 'standalone' } })).json();
      await page.goto(`/session/${s.id}`);
      await expect(page.getByTestId('ctl-primary')).toBeVisible();
      await startFromHelpMenu(page);
      const titles = await walk(page);
      for (const t of ['Bring people in', 'Put it on the big screen', 'Run the activity', 'Only you see this']) expect(titles).toContain(t);
      // still a live, working session afterwards
      await page.getByTestId('ctl-primary').click();
      await expect(page.getByTestId('controls')).toHaveAttribute('data-phase', /ready|open/);
    });

    test('both help pages fit the screen', async ({ page }) => {
      await page.goto('/help');
      await expect(page.getByTestId('help-title')).toBeVisible();
      await noSideScroll(page);
      await page.goto('/studio/help');
      await expect(page.getByTestId('help-title')).toBeVisible();
      await noSideScroll(page);
    });
  });
}
