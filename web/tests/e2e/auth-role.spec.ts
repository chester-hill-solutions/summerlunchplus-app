import { expect, test } from "@playwright/test";

import { generateTestUser } from "../utils/supabase";

test("signs up then shows role on home", async ({ page }) => {
  const { email, password } = generateTestUser();

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Repeat Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page.getByText("Thank you for signing up!")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(/Your role is:/)).toBeVisible();
  await expect(page.getByText(/Your role is: unassigned/i)).toBeVisible();
});
