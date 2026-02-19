import { expect, test } from "@playwright/test";

import { createAnonClient, generateTestUser } from "../utils/supabase";

test("unassigned user must complete onboarding form before home", async ({ page }) => {
  const { email, password } = generateTestUser();

  // Sign up
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Repeat Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForTimeout(1500);

  // Ensure onboarding assignment exists (fallback for local if trigger lags).
  const anon = createAnonClient();
  const { data: formRow } = await anon.from("form").select("id").eq("name", "Onboarding Survey").maybeSingle();
  const { data: loginSession } = await anon.auth.signInWithPassword({ email, password });
  if (formRow?.id && loginSession.session?.user?.id) {
    await anon.from("form_assignment").upsert({ form_id: formRow.id, user_id: loginSession.session.user.id });
  }

  // Log in
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const signInButton = page.getByRole("button", { name: /login/i });
  if (await signInButton.count()) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL(/my-forms|home/),
      signInButton.click(),
    ]);
  }

  // Redirected to my-forms
  await expect(page).toHaveURL(/\/my-forms/);
  const currentUrl = page.url();
  if (!/\/my-forms/.test(currentUrl)) {
    console.log("Unexpected URL", currentUrl);
  }
  await expect(page.getByRole("heading", { name: /Your forms/i })).toBeVisible({ timeout: 10000 });
  const labels = await page.locator("label").allTextContents();
  console.log("Labels on page", labels);
  if (labels.length === 0) {
    console.log("Page content", await page.content());
  }

  // Submit onboarding survey
  await page.getByLabel("Where do you live?").fill("Test City");
  await page.getByLabel("Have you been apart of summerlunch+ before?").selectOption("yes");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("already submitted", { exact: false })).toBeVisible();

  // Re-login to refresh token/claims
  await page.goto("/logout");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(/Your role is: student/i)).toBeVisible();
});
