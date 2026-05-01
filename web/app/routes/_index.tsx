import type { Route } from "./+types/_index";
import { redirect } from "react-router";

import { enforceOnboardingGuard } from "@/lib/auth.server";
import { isRoleAtLeast } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export async function loader({ request }: Route.LoaderArgs) {
  // Try to enforce onboarding guard; if not authenticated fall through to info.
  try {
    const auth = await enforceOnboardingGuard(request);
    const destination =
      auth.claims.role === "unassigned"
        ? "/my-forms"
        : isRoleAtLeast(auth.claims.role, "instructor")
          ? "/manage"
          : "/home";
    throw redirect(destination, { headers: auth.headers });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    // not authenticated, fall back to legacy flow
  }

  const { supabase, headers } = createClient(request);
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    throw redirect("/home", { headers });
  }

  throw redirect("/info", { headers });
}

export default function Index() {
  return null;
}
