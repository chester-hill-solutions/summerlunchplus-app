import { redirect } from "react-router";

import { adminClient } from "@/lib/supabase/adminClient";
import { getMaskedEmailHint } from "@/lib/email-domain";
import { getSignUpDetailsStatus } from "@/lib/onboarding.server";
import { isRoleAtLeast, rolesUpTo } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const ONBOARDING_GUARD_TIMEOUT_MS = Number.parseInt(process.env.ONBOARDING_GUARD_TIMEOUT_MS ?? '15000', 10)
const onboardingGuardTimeoutMs = Number.isFinite(ONBOARDING_GUARD_TIMEOUT_MS) ? ONBOARDING_GUARD_TIMEOUT_MS : 15000
const ONBOARDING_STATUS_CACHE_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 5000
const AUTH_PERMISSION_DRIFT_ALERT_TIMEOUT_MS = 2000
const authPermissionDriftWebhookUrl = (process.env.AUTH_PERMISSION_DRIFT_WEBHOOK_URL ?? '').trim()
const authPermissionDriftEnabled =
  (process.env.AUTH_PERMISSION_DRIFT_ENABLED ?? 'false') === 'true'

const shouldLogAuthInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const onboardingStatusCache = new Map<
  string,
  {
    expiresAt: number
    promise: ReturnType<typeof getSignUpDetailsStatus>
  }
>()

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label}: timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function getOnboardingMode() {
  const mode = process.env.ONBOARDING_MODE;
  return mode === "permission" ? "permission" : "role";
}

const sortedPermissions = (permissions: string[]) => [...permissions].sort()

const emitPermissionDriftAlert = async ({
  emailHint,
  role,
  jwtPermissions,
  rolePermissions,
}: {
  emailHint: string | null
  role: string
  jwtPermissions: string[]
  rolePermissions: string[]
}) => {
  const payload = {
    event: 'auth_permission_drift',
    emailHint,
    role,
    jwtPermissions,
    rolePermissions,
    occurredAt: new Date().toISOString(),
  }

  console.error('[auth] permission drift detected', payload)

  if (!authPermissionDriftWebhookUrl) return

  try {
    await withTimeout(
      fetch(authPermissionDriftWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(() => undefined),
      AUTH_PERMISSION_DRIFT_ALERT_TIMEOUT_MS,
      'auth_permission_drift_alert'
    )
  } catch (error) {
    console.error('[auth] permission drift alert webhook failed', {
      emailHint,
      role,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const getCachedSignUpDetailsStatus = (
  supabase: ReturnType<typeof createClient>['supabase'],
  userId: string,
  role: string
) => {
  if (ONBOARDING_STATUS_CACHE_TTL_MS <= 0) {
    return withTimeout(
      getSignUpDetailsStatus(supabase, userId, role),
      onboardingGuardTimeoutMs,
      'onboarding_guard'
    )
  }

  const key = `${userId}:${role}`
  const now = Date.now()
  const cached = onboardingStatusCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = withTimeout(
    getSignUpDetailsStatus(supabase, userId, role),
    onboardingGuardTimeoutMs,
    'onboarding_guard'
  ).catch(error => {
    onboardingStatusCache.delete(key)
    throw error
  })

  onboardingStatusCache.set(key, {
    expiresAt: now + ONBOARDING_STATUS_CACHE_TTL_MS,
    promise,
  })

  return promise
}

export async function requireAuth(request: Request) {
  const { supabase, headers } = createClient(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  const emailHint = getMaskedEmailHint(user?.email)

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
  let rolePermissions: string[] = []
  const roleScope = rolesUpTo(role);
  if (roleScope.length) {
    const { data: permissionRows, error: permissionsError } = await adminClient
      .from("role_permission")
      .select("permission")
      .in("role", roleScope);
    if (!permissionsError && permissionRows) {
      rolePermissions = Array.from(new Set(permissionRows.map((row) => row.permission)));
      permissions = rolePermissions;
    }
  }

  if (rolePermissions.length && authPermissionDriftEnabled) {
    const sortedJwtPermissions = sortedPermissions(claimPermissions)
    const sortedRolePermissions = sortedPermissions(rolePermissions)
    const driftDetected =
      sortedJwtPermissions.length !== sortedRolePermissions.length ||
      sortedJwtPermissions.some((permission, index) => permission !== sortedRolePermissions[index])

    if (driftDetected) {
      void emitPermissionDriftAlert({
        emailHint,
        role,
        jwtPermissions: sortedJwtPermissions,
        rolePermissions: sortedRolePermissions,
      })
    }
  }

  const onboardingComplete = Boolean(claims?.onboarding_complete);

  return {
    user,
    headers,
    emailHint,
    claims: { role, permissions, onboardingComplete },
  };
}

export async function enforceOnboardingGuard(request: Request, opts?: { allowMyForms?: boolean }) {
  const startedAt = Date.now()
  const auth = await requireAuth(request);
  if (isRoleAtLeast(auth.claims.role, "staff")) {
    if (shouldLogAuthInstrumentation) {
      console.info('[auth-instrumentation]', {
        event: 'onboarding_guard_bypass_staff',
        emailHint: getMaskedEmailHint(auth.user.email),
        role: auth.claims.role,
        durationMs: Date.now() - startedAt,
      })
    }
    return { ...auth, shouldRedirectToForms: false };
  }

  const { supabase } = createClient(request);
  let signUpStatus
  try {
    signUpStatus = await getCachedSignUpDetailsStatus(supabase, auth.user.id, auth.claims.role)
  } catch (error) {
    console.error('[auth] onboarding guard lookup failed', {
      emailHint: getMaskedEmailHint(auth.user.email),
      role: auth.claims.role,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new Response('Account loading is taking longer than expected. Please try again in a minute.', {
      status: 503,
      headers: auth.headers,
    })
  }
  if (!signUpStatus.isComplete) {
    if (!signUpStatus.profileId) {
      throw redirect("/sign-up", { headers: auth.headers });
    }
    if (signUpStatus.role === "student" && signUpStatus.waitingOnGuardians) {
      throw redirect(`/auth/waiting-on-guardian?pid=${signUpStatus.profileId}`, {
        headers: auth.headers,
      });
    }
    const roleParam = signUpStatus.role ?? auth.claims.role ?? "unassigned";
    throw redirect(`/auth/sign-up-details?role=${roleParam}&pid=${signUpStatus.profileId}`, {
      headers: auth.headers,
    });
  }

  const mode = getOnboardingMode();
  const effectiveRole = signUpStatus.role ?? auth.claims.role;
  const isUnassigned = effectiveRole === "unassigned";
  const hasSiteRead = auth.claims.permissions.includes("site.read");
  const needsOnboarding = isUnassigned;
  const permissionBlocked = isUnassigned && mode === "permission" && !hasSiteRead;

  const shouldRedirectToForms = needsOnboarding || permissionBlocked;

  if (shouldRedirectToForms && !opts?.allowMyForms) {
    console.warn("[auth] onboarding redirect", {
      mode,
      allowMyForms: Boolean(opts?.allowMyForms),
      role: auth.claims.role,
      effectiveRole,
      signUpStatusRole: signUpStatus.role,
      permissions: auth.claims.permissions,
      onboardingComplete: auth.claims.onboardingComplete,
      permissionBlocked,
      needsOnboarding,
    });
    throw redirect("/my-forms", { headers: auth.headers });
  }

  if (shouldLogAuthInstrumentation) {
    console.info('[auth-instrumentation]', {
      event: 'onboarding_guard_complete',
      emailHint: getMaskedEmailHint(auth.user.email),
      role: auth.claims.role,
      durationMs: Date.now() - startedAt,
      shouldRedirectToForms,
    })
  }

  return { ...auth, shouldRedirectToForms };
}
