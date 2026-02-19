import { redirect, useLoaderData } from "react-router";

import type { Route } from "./+types/home";
import { Button } from "@/components/ui/button";
import { enforceOnboardingGuard } from "@/lib/auth.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Private Home" },
    { name: "description", content: "Private home" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request);
  return { user: auth.user, role: auth.claims.role };
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
