import type { Route } from "./+types/_index";
import { redirect } from "react-router";

import { enforceOnboardingGuard } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";

export async function loader({ request }: Route.LoaderArgs) {
  // Try to enforce onboarding guard; if not authenticated fall through to info.
  try {
    const auth = await enforceOnboardingGuard(request);
    throw redirect(auth.claims.role === "unassigned" ? "/my-forms" : "/home", { headers: auth.headers });
  } catch {
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
