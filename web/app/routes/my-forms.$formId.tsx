import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

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

type ActionData = {
  error?: string;
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
  console.log('entering /home/[formID] action')
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
    const key = `q-${q.id}`;
    const rawValue =
      q.kind === "multi_choice"
        ? formData.getAll(key).map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).join(", ")
        : formData.get(key);
    const normalized = typeof rawValue === "string" ? rawValue.trim() : "";
    const payload = q.kind === "single_choice" ? { value: normalized } : { text: normalized };
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
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submitted = Boolean(assignment.submission);
  const isSubmitting =
    navigation.state === "submitting" && navigation.formAction?.includes(assignment.form.id);

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
          <p className="text-sm font-medium text-foreground">
            Status: {submitted ? "Submitted" : "Not submitted"}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/my-forms">Back to list</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{submitted ? "Update your answers" : "Fill out form"}</CardTitle>
          <CardDescription>
            {submitted
              ? "You already submitted this form. You can resubmit to update your responses."
              : "Provide your responses and submit when ready."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="submit_form" />

            {actionData?.error ? (
              <p className="text-sm text-destructive">{actionData.error}</p>
            ) : null}

            {questions.length === 0 ? (
              <p className="text-muted-foreground text-sm">This form has no questions yet.</p>
            ) : (
              <div className="space-y-5">
                {questions.map((q) => {
                  const inputId = `q-${q.id}`;
                  if (q.kind === "single_choice") {
                    return (
                      <div key={q.id} className="space-y-2">
                        <Label htmlFor={inputId}>{q.prompt}</Label>
                        <select
                          id={inputId}
                          name={inputId}
                          className="h-10 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          required
                          defaultValue=""
                          aria-required
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
                      </div>
                    );
                  }

                  if (q.kind === "multi_choice") {
                    return (
                      <div key={q.id} className="space-y-2">
                        <Label>{q.prompt}</Label>
                        <div className="space-y-2 rounded-md border p-3">
                          {(q.options ?? []).map((opt) => {
                            const checkboxId = `${inputId}-${opt}`;
                            return (
                              <label key={opt} className="flex items-center gap-2 text-sm">
                                <input
                                  id={checkboxId}
                                  name={inputId}
                                  type="checkbox"
                                  value={opt}
                                  className="h-4 w-4 rounded border"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (q.kind === "date") {
                    return (
                      <div key={q.id} className="space-y-2">
                        <Label htmlFor={inputId}>{q.prompt}</Label>
                        <Input id={inputId} name={inputId} type="date" required />
                      </div>
                    );
                  }

                  return (
                    <div key={q.id} className="space-y-2">
                      <Label htmlFor={inputId}>{q.prompt}</Label>
                      <Input id={inputId} name={inputId} required />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? "Submitting..." : submitted ? "Resubmit" : "Submit"}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
