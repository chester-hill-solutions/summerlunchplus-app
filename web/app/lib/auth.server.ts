import { redirect } from "react-router";

import { adminClient } from "@/lib/supabase/adminClient";
import { getSignUpDetailsStatus } from "@/lib/onboarding.server";
import { isRoleAtLeast, rolesUpTo } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

function getOnboardingMode() {
  const mode = process.env.ONBOARDING_MODE;
  return mode === "permission" ? "permission" : "role";
}

export async function requireAuth(request: Request) {
  const { supabase, headers } = createClient(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    throw redirect("/login", { headers });
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as
    | { user_role?: string; permissions?: string[]; onboarding_complete?: boolean }
    | null
    | undefined;
  const role = typeof claims?.user_role === "string" ? claims.user_role : "unassigned";
  const claimPermissions = Array.isArray(claims?.permissions)
    ? claims.permissions.filter((p): p is string => typeof p === "string")
    : [];

  let permissions = claimPermissions;
  const roleScope = rolesUpTo(role);
  if (roleScope.length) {
    const { data: permissionRows, error: permissionsError } = await adminClient
      .from("role_permission")
      .select("permission")
      .in("role", roleScope);
    if (!permissionsError && permissionRows) {
      permissions = Array.from(new Set(permissionRows.map((row) => row.permission)));
    }
  }
  const onboardingComplete = Boolean(claims?.onboarding_complete);

  return {
    user,
    headers,
    claims: { role, permissions, onboardingComplete },
  };
}

export async function enforceOnboardingGuard(request: Request, opts?: { allowMyForms?: boolean }) {
  const auth = await requireAuth(request);
  if (isRoleAtLeast(auth.claims.role, "staff")) {
    return { ...auth, shouldRedirectToForms: false };
  }

  const { supabase } = createClient(request);
  const signUpStatus = await getSignUpDetailsStatus(supabase, auth.user.id, auth.claims.role);
  if (!signUpStatus.isComplete) {
    if (!signUpStatus.profileId) {
      throw redirect("/sign-up", { headers: auth.headers });
    }
    const roleParam = signUpStatus.role ?? auth.claims.role ?? "unassigned";
    throw redirect(`/auth/sign-up-details?role=${roleParam}&pid=${signUpStatus.profileId}`, {
      headers: auth.headers,
    });
  }

  const mode = getOnboardingMode();
  const isUnassigned = auth.claims.role === "unassigned";
  const hasSiteRead = auth.claims.permissions.includes("site.read");
  const needsOnboarding = isUnassigned;
  const permissionBlocked = isUnassigned && mode === "permission" && !hasSiteRead;

  const shouldRedirectToForms = needsOnboarding || permissionBlocked;

  if (shouldRedirectToForms && !opts?.allowMyForms) {
    console.warn("[auth] onboarding redirect", {
      mode,
      allowMyForms: Boolean(opts?.allowMyForms),
      role: auth.claims.role,
      permissions: auth.claims.permissions,
      onboardingComplete: auth.claims.onboardingComplete,
      permissionBlocked,
      needsOnboarding,
    });
    throw redirect("/my-forms", { headers: auth.headers });
  }

  return { ...auth, shouldRedirectToForms };
}
