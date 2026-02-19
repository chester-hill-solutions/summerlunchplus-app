import { Link, useLoaderData } from "react-router";

import type { Route } from "./+types/my-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Assigned forms</CardTitle>
            <CardDescription>Forms currently assigned to you.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No forms assigned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Title</th>
                    <th className="py-2 pr-4 font-medium">Due date</th>
                    <th className="py-2 pr-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => {
                    const submitted = Boolean(assignment.submission);
                    const due = assignment.form.due_at
                      ? new Date(assignment.form.due_at).toLocaleDateString()
                      : "No due date";
                    return (
                      <tr key={assignment.id} className="border-b last:border-b-0">
                        <td className="py-3 pr-4 align-middle">{assignment.form.name}</td>
                        <td className="py-3 pr-4 align-middle text-muted-foreground">{due}</td>
                        <td className="py-3 pr-0 align-middle text-right">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
