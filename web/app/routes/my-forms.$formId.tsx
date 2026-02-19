import { Form, Link, redirect, useLoaderData } from "react-router";

import type { Route } from "./+types/my-forms.$formId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Question = {
  id: string;
  form_id: string;
  prompt: string;
  kind: "text" | "single_choice" | "multi_choice" | "date" | "address";
  position: number;
  options: string[];
};

type LoaderData = {
  assignment: Assignment;
  questions: Question[];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const formId = params.formId;
  if (!formId) {
    throw redirect("/my-forms");
  }

  console.log("[my-forms detail] loader start", { formId, url: request.url });

  const auth = await enforceOnboardingGuard(request, { allowMyForms: true });
  const { supabase, headers } = createClient(request);

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("form_assignment")
    .select("id, status, due_at, form_id, user_id, form:form_id ( id, name, is_required, due_at )")
    .eq("user_id", auth.user.id)
    .eq("form_id", formId)
    .maybeSingle();

  if (assignmentError || !assignmentRow) {
    console.error("[my-forms detail] redirect: missing assignment", {
      formId,
      authUserId: auth.user.id,
      assignmentError,
      assignmentRow,
    });
    throw redirect("/my-forms", { headers });
  }

  console.log("[my-forms detail] assignment found", {
    assignmentId: assignmentRow.id,
    formId: assignmentRow.form_id,
    authUserId: auth.user.id,
  });

  const assignment: Assignment = {
    id: String(assignmentRow.id),
    status: String(assignmentRow.status),
    due_at: assignmentRow.due_at ?? null,
    form: {
      id: String(assignmentRow.form?.id ?? ""),
      name: String(assignmentRow.form?.name ?? ""),
      is_required: Boolean(assignmentRow.form?.is_required),
      due_at: assignmentRow.form?.due_at ?? null,
    },
    submission: null,
  };

  const { data: submission } = await supabase
    .from("form_submission")
    .select("id, form_id, submitted_at")
    .eq("form_id", formId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  assignment.submission = submission ? { ...submission, submitted_at: submission.submitted_at ?? "" } : null;

  const { data: questions, error: questionsError } = await supabase
    .from("form_question")
    .select("id, form_id, prompt, kind, position, options")
    .eq("form_id", formId)
    .order("position", { ascending: true });

  if (questionsError) {
    return new Response("Failed to load questions", { status: 500, headers });
  }

  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  const payload: LoaderData = {
    assignment,
    questions: (questions ?? []).map((q) => ({
      ...q,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
    })),
  };
  console.log(payload)
  return new Response(JSON.stringify(payload), { headers: responseHeaders });
}

export async function action({ request, params }: Route.ActionArgs) {
  console.log('enter forms action')
  const formId = params.formId;
  if (!formId) {
    throw redirect("/my-forms");
  }

  console.log("[my-forms detail] action start", { formId, url: request.url });

  const auth = await enforceOnboardingGuard(request, { allowMyForms: true });
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "submit_form") {
    return new Response(JSON.stringify({ error: "Unknown intent" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { supabase, headers } = createClient(request);

  const { data: assignment } = await supabase
    .from("form_assignment")
    .select("id")
    .eq("form_id", formId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!assignment) {
    console.error("[my-forms detail] action reject: not assigned", {
      formId,
      authUserId: auth.user.id,
      intent,
    });
    return new Response(JSON.stringify({ error: "Not assigned" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[my-forms detail] action submit", {
    formId,
    authUserId: auth.user.id,
    intent,
  });

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

  throw redirect("/my-forms", { headers });
}

export default function MyFormDetail() {
  const { assignment, questions } = useLoaderData<LoaderData>();
  const submitted = Boolean(assignment.submission);
  console.log('form detail')

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Form</p>
          <h1 className="text-2xl font-semibold">{assignment.form.name}</h1>
          <p className="text-muted-foreground text-sm">
            {assignment.form.due_at
              ? `Due ${new Date(assignment.form.due_at).toLocaleDateString()}`
              : "No due date"}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/my-forms">Back to list</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{submitted ? "Submitted" : "Fill out form"}</CardTitle>
          <CardDescription>
            {submitted
              ? "You have already submitted this form. You can resubmit to update your answers."
              : "Provide your responses and submit when ready."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="submit_form" />
            {questions.length === 0 ? (
              <p className="text-muted-foreground text-sm">This form has no questions yet.</p>
            ) : (
              questions.map((q) => (
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
              ))
            )}
            <div className="flex justify-end">
              <Button type="submit">{submitted ? "Resubmit" : "Submit"}</Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
