import { expect, test } from "@playwright/test";

import { createServiceRoleClient, generateTestUser } from "../utils/supabase";

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
  const service = createServiceRoleClient();
  if (service) {
    let userId: string | null = null;
    for (let i = 0; i < 5; i++) {
      const { data: userRow } = await service.auth.admin.getUserByEmail(email);
      if (userRow?.user?.id) {
        userId = userRow.user.id;
        break;
      }
      await new Promise((res) => setTimeout(res, 300));
    }
    const { data: formRow } = await service.from("form").select("id").eq("name", "Onboarding Survey").maybeSingle();
    if (formRow?.id && userId) {
      const { error: assignError } = await service
        .from("form_assignment")
        .upsert({ form_id: formRow.id, user_id: userId });
      if (assignError) {
        throw new Error(`Failed to seed assignment: ${assignError.message}`);
      }
    }
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
