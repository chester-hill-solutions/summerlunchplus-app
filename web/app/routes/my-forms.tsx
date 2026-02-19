import { Link, useLoaderData } from "react-router";

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
};

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

  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");

  const payload: LoaderData = {
    assignments,
    claims: auth.claims as Claims,
  };

  return new Response(JSON.stringify(payload), { headers: responseHeaders });
}

export default function MyFormsPage() {
  const { assignments, claims } = useLoaderData<LoaderData>();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold" role="heading" aria-level={1}>
          Your forms
        </h1>
        <p className="text-muted-foreground text-sm">
          Complete required forms to gain full site access. Status: {claims.onboardingComplete ? "Complete" : "Pending"}
        </p>
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
                            onClick={() =>
                              console.log("[my-forms] click", {
                                assignmentId: assignment.id,
                                formId: assignment.form.id,
                                submitted,
                              })
                            }
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
