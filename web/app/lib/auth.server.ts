import { redirect } from "react-router";

import { createClient } from "@/lib/supabase/server";

type Claims = {
  role: string | null;
  permissions: string[];
  onboardingComplete: boolean;
};

function decodeToken(accessToken: string | null): Partial<Claims> {
  if (!accessToken) return {};
  const parts = accessToken.split(".");
  if (parts.length < 2) return {};
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.filter((p: unknown) => typeof p === "string")
      : [];
    return {
      role: typeof payload.user_role === "string" ? payload.user_role : null,
      permissions,
      onboardingComplete: Boolean(payload.onboarding_complete),
    };
  } catch {
    return {};
  }
}

function getOnboardingMode() {
  const mode = process.env.ONBOARDING_MODE;
  return mode === "permission" ? "permission" : "role";
}

export async function requireAuth(request: Request) {
  const { supabase, headers } = createClient(request);
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = userData.user;

  if (!user) {
    throw redirect("/login", { headers });
  }

  const token = sessionData.session?.access_token ?? null;
  const tokenClaims = decodeToken(token);
  const appMetaRole = (user.app_metadata as { user_role?: string } | null)?.user_role ?? null;
  const role = tokenClaims.role ?? appMetaRole;
  const permissions = tokenClaims.permissions ?? [];
  const onboardingComplete = tokenClaims.onboardingComplete ?? false;

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
    throw redirect("/my-forms", { headers: auth.headers });
  }

  return { ...auth, shouldRedirectToForms };
}
