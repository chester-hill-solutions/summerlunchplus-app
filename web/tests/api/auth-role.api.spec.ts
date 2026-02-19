import { expect, test } from "@playwright/test";

import {
  createAnonClient,
  createServiceRoleClient,
  decodeJwt,
  generateTestUser,
} from "../utils/supabase";

test("sign up issues JWT with user_role and row in user_roles", async () => {
  const supabase = createAnonClient();
  const admin = createServiceRoleClient();
  const { email, password } = generateTestUser();

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  expect(signUpError).toBeNull();

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();
  expect(signInData.session?.access_token).toBeTruthy();

  const accessToken = signInData.session!.access_token!;
  const payload = decodeJwt(accessToken);
  expect(payload.user_role).toBe("unassigned");

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .single();
  expect(roleError).toBeNull();
  expect(roleRow?.role).toBe("unassigned");

  if (admin && signInData.session?.user?.id) {
    await admin.auth.admin.deleteUser(signInData.session.user.id);
  }
});
