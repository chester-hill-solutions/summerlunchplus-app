import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
const webServer = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      command: 'npm run dev -- --port 5173',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    }

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer,
})
