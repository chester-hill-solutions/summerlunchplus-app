import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, redirect, useLoaderData } from "react-router";
import { useEffect, useRef } from "react";

import type { Route } from "./+types/root";
import { Navbar } from "./components/navbar";
import { enforceOnboardingGuard } from "./lib/auth.server";
import { useRouterInstrumentation } from "./lib/router-instrumentation";
import { createClient } from "./lib/supabase/server";
import { createClient as createBrowserClient } from "./lib/supabase/client";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  const startedAt = Date.now()
  const requestPath = new URL(request.url).pathname

  try {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_OR_ANON_KEY ?? '';

  const url = new URL(request.url);
  const pathname = url.pathname;
  const hasAuthCode = Boolean(url.searchParams.get('code'))
  const hasOtpToken = Boolean(url.searchParams.get('token_hash') && url.searchParams.get('type'))

  if (pathname !== '/auth/confirm' && pathname !== '/update-password' && (hasAuthCode || hasOtpToken)) {
    throw redirect(`/auth/confirm${url.search}`, { status: 302 })
  }

  const allowlist = new Set([
    "/login",
    "/sign-up",
    "/sign-up/terms",
    "/sign-up/invite",
    "/forgot-password",
    "/update-password",
    "/auth/sign-up-details",
    "/auth/waiting-on-guardian",
    "/auth/confirm",
    "/auth/error",
    "/",
  ]);
  const isGlrPath = pathname === '/glr' || pathname.startsWith('/glr/')
  const isMyFormsPath = pathname === "/my-forms" || pathname.startsWith("/my-forms/");

  if (!allowlist.has(pathname) && !isMyFormsPath && !isGlrPath) {
    try {
      await enforceOnboardingGuard(request, { allowMyForms: false });
    } catch (err) {
      throw err;
    }
  }

  const { supabase, headers } = createClient(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  const user = userData?.user ?? null;

  if (userError || !user) {
    return { user: null, role: null, supabaseUrl, supabaseAnonKey };
  }

  const { data: profile } = await supabase
    .from('profile')
    .select('password_set')
    .eq('user_id', user.id)
    .maybeSingle()

  const passwordSetupAllowlist = new Set([
    '/sign-up/invite',
    '/auth/confirm',
    '/auth/error',
    '/logout',
  ])

  if (profile && !profile.password_set && !passwordSetupAllowlist.has(pathname)) {
    throw redirect('/sign-up/invite', { headers })
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { user_role?: string } | null | undefined;
  const role = typeof claims?.user_role === "string" ? claims.user_role : null;

  return { user, role, supabaseUrl, supabaseAnonKey };
  } finally {
    const shouldLog =
      process.env.NODE_ENV !== 'production' ||
      process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

    if (shouldLog) {
      console.info('[router-instrumentation]', {
        event: 'root_loader',
        method: request.method,
        pathname: requestPath,
        durationMs: Date.now() - startedAt,
      })
    }
  }
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
  { rel: "icon", type: "image/png", href: "/favcicon.png" },
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
  const { user, role, supabaseUrl, supabaseAnonKey } = useLoaderData<typeof loader>();
  const hashHandledRef = useRef(false);

  useRouterInstrumentation();

  useEffect(() => {
    if (hashHandledRef.current) return;
    if (typeof window === "undefined") return;
    const { hash } = window.location;
    if (!hash) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");
    const next = new URLSearchParams(window.location.search).get("next");
    const nextPath = next?.startsWith("/") ? next : null;

    if (!access_token || !refresh_token) return;
    hashHandledRef.current = true;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
    supabase.auth
      .signOut({ scope: "local" })
      .then(() => supabase.auth.setSession({ access_token, refresh_token }))
      .then(({ error }) => {
        if (error) {
          console.error("Unable to hydrate session", error.message);
          return;
        }
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState({}, "", cleanUrl);
        const destination =
          nextPath ??
          (type === "invite"
            ? "/sign-up/invite"
            : type === "recovery"
              ? "/update-password"
              : "/login");
        window.location.replace(destination);
      });
  }, [supabaseAnonKey, supabaseUrl]);

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar user={user} role={role} />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
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
        : error.status === 503
          ? "We are having trouble loading your account right now. Please wait a minute and try again."
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
