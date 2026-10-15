import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Participant {
  page: Page;
  context: BrowserContext;
  name: string;
}

/** A phone-sized browser that joins with the PIN, exactly like a real participant. */
export async function joinAsParticipant(browser: Browser, pin: string, name: string): Promise<Participant> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/join');
  await page.getByTestId('pin-input').fill(pin);
  await page.getByTestId('pin-submit').click();
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('name-submit').click();
  await expect(page.getByTestId('waiting-lobby')).toBeVisible();
  return { page, context, name };
}

export async function readPin(dashboard: Page): Promise<string> {
  const pin = await dashboard.getByTestId('join-card').getByTestId('ticket-pin').getAttribute('data-pin');
  expect(pin).toMatch(/^\d{6}$/);
  return pin!;
}

export async function openProjector(browser: Browser, dashboard: Page): Promise<Page> {
  const href = await dashboard.getByTestId('open-projector').getAttribute('href');
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.goto(href!);
  await expect(page.getByTestId('projector')).toBeVisible();
  return page;
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
}
