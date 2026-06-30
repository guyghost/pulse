import { test as base, expect } from '@playwright/test';
import { ensureFeedVisible } from './helpers';

type FeedFixtures = {
  feedReady: void;
};

export const test = base.extend<FeedFixtures>({
  feedReady: [
    async ({ page }, use) => {
      await ensureFeedVisible(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
