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
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    throw redirect("/login", { headers });
  }

  const role = (data.user.app_metadata as { user_role?: string } | null)?.user_role ?? null;

  return { user: data.user, role };
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
