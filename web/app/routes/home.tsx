import { redirect, useLoaderData } from "react-router";

import type { Route } from "./+types/home";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Private Home" },
    { name: "description", content: "Private home" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);
  const { data } = await supabase.auth.getSession();

  const session = data.session;

  if (!session?.user) {
    throw redirect("/login", { headers });
  }

  const appMetadataRole = (session.user.app_metadata as { user_role?: string } | null)?.user_role ?? null;

  const tokenRole = (() => {
    const token = session.access_token;
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return typeof payload.user_role === "string" ? payload.user_role : null;
    } catch {
      return null;
    }
  })();

  const role = tokenRole ?? appMetadataRole;

  return { user: session.user, role };
}

export default function Home() {
  const { user, role } = useLoaderData<typeof loader>();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">This is the private home page, you are logged in</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
        <p className="text-muted-foreground">Your role is: {role ?? "unknown"}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild variant="secondary">
          <a href="/logout">Logout</a>
        </Button>
      </div>
    </main>
  );
}
