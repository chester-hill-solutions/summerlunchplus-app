import { redirect, useFetcher, useLoaderData } from "react-router";

import type { Route } from "./+types/my-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enforceOnboardingGuard } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
  questions: Question[];
  claims: Claims;
};

type Question = {
  id: string;
  form_id: string;
  prompt: string;
  kind: "text" | "single_choice" | "multi_choice" | "date" | "address";
  position: number;
  options: string[];
};

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request, { allowMyForms: true });
  const { supabase, headers } = createClient(request);

  const { data: assignments, error: assignmentError } = await supabase
    .from("form_assignment")
    .select("id, status, due_at, form:form_id!inner ( id, name, is_required, due_at )")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });
  const assignmentList = assignmentError ? [] : assignments ?? [];

  const normalizedAssignments: Assignment[] = (assignments ?? []).map((a: any) => {
    const formRaw = a.form;
    const form: Assignment["form"] = {
      id: String(formRaw?.id ?? ""),
      name: String(formRaw?.name ?? ""),
      is_required: Boolean(formRaw?.is_required),
      due_at: formRaw?.due_at ?? null,
    };
    return {
      id: String(a.id),
      status: String(a.status),
      due_at: a.due_at ?? null,
      form,
      submission: null,
    };
  });

  const formIds = normalizedAssignments.map((a) => a.form.id).filter(Boolean) as string[];
  const { data: questions, error: questionsError } = await supabase
    .from("form_question")
    .select("id, form_id, prompt, kind, position, options")
    .in("form_id", formIds)
    .order("position", { ascending: true });
  const questionList = questionsError ? [] : questions ?? [];

  const { data: submissions, error: submissionError } = await supabase
    .from("form_submission")
    .select("id, form_id, submitted_at")
    .eq("user_id", auth.user.id);
  const submissionList = submissionError ? [] : submissions ?? [];

  const assignmentsWithSubmission: Assignment[] = normalizedAssignments.map((a) => {
    const submission = submissionList.find((s) => s.form_id === a.form.id) ?? null;
    return { ...a, submission };
  });

  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  let resultAssignments = assignmentsWithSubmission;
  // If no assignments, attempt to sync and refetch once.
  if (resultAssignments.length === 0) {
    // Attempt to self-create assignments based on auto_assign.
    const role = auth.claims.role ?? "unassigned";
    const { data: autoForms } = await supabase
      .from("form")
      .select("id, name, is_required, due_at, auto_assign");
    const eligible = (autoForms ?? []).filter((f: any) => (f.auto_assign ?? []).includes(role));
    if (eligible.length > 0) {
      await Promise.all(
        eligible.map((f: any) =>
          supabase.from("form_assignment").upsert({ form_id: f.id, user_id: auth.user.id })
        )
      );
      const retryAssignments = await supabase
        .from("form_assignment")
        .select("id, status, due_at, form:form_id!inner ( id, name, is_required, due_at )")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: true });
      if (!retryAssignments.error) {
        const normalizedRetry: Assignment[] = (retryAssignments.data ?? []).map((a: any) => {
          const formRaw = a.form;
          const form: Assignment["form"] = {
            id: String(formRaw?.id ?? ""),
            name: String(formRaw?.name ?? ""),
            is_required: Boolean(formRaw?.is_required),
            due_at: formRaw?.due_at ?? null,
          };
          const submission = submissionList.find((s) => s.form_id === form.id) ?? null;
          return {
            id: String(a.id),
            status: String(a.status),
            due_at: a.due_at ?? null,
            form,
            submission,
          };
        });
        resultAssignments = normalizedRetry;
      }
    }
  }

  const payload: LoaderData = {
    assignments: resultAssignments,
    questions: questionList as Question[],
    claims: auth.claims as Claims,
  };
  return new Response(JSON.stringify(payload), { headers: responseHeaders });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await enforceOnboardingGuard(request, { allowMyForms: true });
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "submit_form") {
    return new Response(JSON.stringify({ error: "Unknown intent" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formId = formData.get("form_id");
  if (typeof formId !== "string" || formId.length === 0) {
    return new Response(JSON.stringify({ error: "Missing form_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { supabase, headers } = createClient(request);

  // Ensure assignment exists for this user.
  const { data: assignment } = await supabase
    .from("form_assignment")
    .select("id")
    .eq("form_id", formId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!assignment) {
    return new Response(JSON.stringify({ error: "Not assigned" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch questions to determine payload shape.
  const { data: questions, error: questionsError } = await supabase
    .from("form_question")
    .select("id, kind")
    .eq("form_id", formId);

  if (questionsError) {
    return new Response(JSON.stringify({ error: "Failed to load questions" }), {
      status: 500,
      headers,
    });
  }

  // Upsert submission.
  const { data: submissionRows, error: submissionError } = await supabase
    .from("form_submission")
    .upsert({ form_id: formId, user_id: auth.user.id })
    .select("id")
    .maybeSingle();

  if (submissionError || !submissionRows) {
    return new Response(JSON.stringify({ error: "Failed to save submission" }), {
      status: 500,
      headers,
    });
  }

  const answers = (questions ?? []).map((q) => {
    const value = formData.get(`q-${q.id}`);
    const raw = typeof value === "string" ? value.trim() : "";
    const payload = q.kind === "single_choice" ? { value: raw } : { text: raw };
    return { submission_id: submissionRows.id, question_id: q.id, value: payload };
  });

  if (answers.length > 0) {
    const { error: answersError } = await supabase
      .from("form_answer")
      .upsert(answers, { onConflict: "submission_id,question_id" });

    if (answersError) {
      return new Response(JSON.stringify({ error: "Failed to save answers" }), {
        status: 500,
        headers,
      });
    }
  }

  // Reload to reflect completion; guard will allow navigation elsewhere once claims refresh.
  throw redirect("/my-forms", { headers });
}

function FormCard({ assignment, questions }: { assignment: Assignment; questions: Question[] }) {
  const fetcher = useFetcher();
  const submitted = Boolean(assignment.submission);

  return (
    <Card key={assignment.id} className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-lg">
          <span>{assignment.form.name}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {assignment.form.is_required ? "Required" : "Optional"}
          </span>
        </CardTitle>
        <CardDescription>
          {submitted ? "Submitted" : "Pending"}
          {assignment.form.due_at && ` · Due ${new Date(assignment.form.due_at).toLocaleDateString()}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {submitted ? (
          <p className="text-sm text-muted-foreground">You have already submitted this form.</p>
        ) : (
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="submit_form" />
            <input type="hidden" name="form_id" value={assignment.form.id} />
            {questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <Label htmlFor={`q-${q.id}`}>{q.prompt}</Label>
                {q.kind === "single_choice" ? (
                  <select
                    id={`q-${q.id}`}
                    name={`q-${q.id}`}
                    className="h-10 w-full rounded-md border px-3 text-sm shadow-sm"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select an option
                    </option>
                    {(q.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input id={`q-${q.id}`} name={`q-${q.id}`} required />
                )}
              </div>
            ))}
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state === "submitting" ? "Submitting..." : "Submit"}
            </Button>
          </fetcher.Form>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyFormsPage() {
  const { assignments, questions, claims } = useLoaderData<LoaderData>();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold" role="heading" aria-level={1}>
          Your forms
        </h1>
        <p className="text-muted-foreground text-sm">
          Complete required forms to gain full site access. Status: {claims.onboardingComplete ? "Complete" : "Pending"}
        </p>
      </div>
      {assignments.length === 0 ? (
        <p className="text-muted-foreground">No forms assigned.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {assignments.map((assignment) => (
            <FormCard
              key={assignment.id}
              assignment={assignment}
              questions={questions.filter((q) => q.form_id === assignment.form.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
