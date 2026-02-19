import { Link, redirect, useFetcher, useLoaderData } from "react-router";

import type { Route } from "./+types/my-forms";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { enforceOnboardingGuard } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";

type Assignment = {
  id: string;
  status: string;
  due_at: string | null;
  form: {
    id: string;
    name: string;
    is_required: boolean;
    due_at: string | null;
  };
  submission: {
    id: string;
    form_id: string;
    submitted_at: string;
  } | null;
};

type Claims = {
  role: string | null;
  permissions: string[];
  onboardingComplete: boolean;
};

type LoaderData = {
  assignments: Assignment[];
  claims: Claims;
  hasIncompleteRequired: boolean;
};

type ActionData = { error?: string };

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request, { allowMyForms: true });
  const { supabase, headers } = createClient(request);

  const { data: assignmentsData } = await supabase
    .from("form_assignment")
    .select("id, status, due_at, form:form_id ( id, name, is_required, due_at )")
    .eq("user_id", auth.user.id)
    .order("assigned_at", { ascending: true });

  const assignmentsRaw = assignmentsData ?? [];

  const { data: submissionsData } = await supabase
    .from("form_submission")
    .select("id, form_id, submitted_at")
    .eq("user_id", auth.user.id);
  const submissions = submissionsData ?? [];

  const assignments: Assignment[] = assignmentsRaw.map((a: any) => {
    const formRaw = a.form;
    const submission = submissions.find((s) => s.form_id === formRaw?.id) ?? null;
    return {
      id: String(a.id),
      status: String(a.status),
      due_at: a.due_at ?? null,
      form: {
        id: String(formRaw?.id ?? ""),
        name: String(formRaw?.name ?? ""),
        is_required: Boolean(formRaw?.is_required),
        due_at: formRaw?.due_at ?? null,
      },
      submission: submission
        ? {
            id: String(submission.id),
            form_id: String(submission.form_id),
            submitted_at: String(submission.submitted_at ?? ""),
          }
        : null,
    };
  });

  const hasIncompleteRequired = assignments.some((a) => a.form.is_required && !a.submission);

  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");

  const payload: LoaderData = {
    assignments,
    claims: auth.claims as Claims,
    hasIncompleteRequired,
  };

  return new Response(JSON.stringify(payload), { headers: responseHeaders });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent !== "promote") {
    return new Response(JSON.stringify({ error: "Unknown intent" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { supabase, headers } = createClient(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;

  const { data: hasCompleted, error: requiredError } = await supabase.rpc(
    "has_completed_required_forms",
    { p_user_id: userId }
  );

  if (requiredError) {
    return new Response(JSON.stringify({ error: "Failed to check completion" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (hasCompleted) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

    throw redirect("/", { headers });
  }

  return new Response(JSON.stringify({ error: "Please finish all required forms first." }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export default function MyFormsPage() {
  const { assignments, claims, hasIncompleteRequired } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold" role="heading" aria-level={1}>
          Your forms
        </h1>
        <p className="text-muted-foreground text-sm">
          Complete required forms to gain full site access. Status: {hasIncompleteRequired ? "Pending" : "Complete"}
        </p>
        {claims.role === "unassigned" ? (
          <fetcher.Form method="post" className="flex items-center gap-3">
            <input type="hidden" name="intent" value="promote" />
            <Button type="submit" variant="default">
              Access Home Page
            </Button>
            {fetcher.data?.error ? (
              <p className="text-sm text-destructive">{fetcher.data.error}</p>
            ) : null}
          </fetcher.Form>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Assigned forms</h2>
          <p className="text-muted-foreground text-sm">Forms currently assigned to you.</p>
        </div>

        {assignments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No forms assigned.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">Title</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => {
                  const submitted = Boolean(assignment.submission);
                  const due = assignment.form.due_at
                    ? new Date(assignment.form.due_at).toLocaleDateString()
                    : "No due date";
                  return (
                    <TableRow key={assignment.id}>
                      <TableCell className="pr-4 font-medium">{assignment.form.name}</TableCell>
                      <TableCell className="text-muted-foreground">{due}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant={submitted ? "secondary" : "default"} size="sm">
                          <Link
                            to={`/my-forms/${assignment.form.id}`}
                          >
                            {submitted ? "View" : "Fill Out"}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}
