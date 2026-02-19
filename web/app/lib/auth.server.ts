import { redirect } from "react-router";

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
  const claims = claimsData.claims as
    | { user_role?: string; permissions?: string[]; onboarding_complete?: boolean }
    | null
    | undefined;
  const role = typeof claims?.user_role === "string" ? claims.user_role : "unassigned";
  const permissions = Array.isArray(claims?.permissions)
    ? claims.permissions.filter((p): p is string => typeof p === "string")
    : [];
  const onboardingComplete = Boolean(claims?.onboarding_complete);

  return {
    user,
    headers,
    claims: { role, permissions, onboardingComplete },
  };
}

export async function enforceOnboardingGuard(request: Request, opts?: { allowMyForms?: boolean }) {
  const auth = await requireAuth(request);
  const mode = getOnboardingMode();
  const isUnassigned = auth.claims.role === "unassigned";
  const hasSiteRead = auth.claims.permissions.includes("site.read");
  const needsOnboarding = isUnassigned || auth.claims.onboardingComplete === false;
  const permissionBlocked = mode === "permission" && !hasSiteRead;

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
