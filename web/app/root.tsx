import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

import type { Route } from "./+types/root";
import { Navbar } from "./components/navbar";
import { enforceOnboardingGuard } from "./lib/auth.server";
import { createClient } from "./lib/supabase/server";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const allowlist = new Set([
    "/login",
    "/sign-up",
    "/forgot-password",
    "/auth.confirm",
    "/auth.error",
    "/my-forms",
    "/",
  ]);

  if (!allowlist.has(pathname)) {
    try {
      await enforceOnboardingGuard(request, { allowMyForms: false });
    } catch (err) {
      throw err;
    }
  }

  const { supabase } = createClient(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  const user = userData?.user ?? null;

  if (userError || !user) {
    return { user: null, role: null };
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData.claims as { user_role?: string } | null | undefined;
  const role = typeof claims?.user_role === "string" ? claims.user_role : null;

  return { user, role };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user, role } = useLoaderData<typeof loader>();

  return (
    <>
      <Navbar user={user} role={role} />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
