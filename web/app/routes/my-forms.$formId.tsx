import { Form, Link, redirect, useActionData, useLoaderData, useNavigation, useRouteLoaderData } from "react-router";
import { useEffect } from "react";

import type { Route } from "./+types/my-forms.$formId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import FormQuestion, { type FormQuestionData } from "@/components/forms/form-question";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enforceOnboardingGuard } from "@/lib/auth.server";
import { extractRequestMetadata } from "@/lib/request-metadata.server";
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

type Question = FormQuestionData & {
  form_id: string;
};

type LoaderData = {
  assignment: Assignment;
  questions: Question[];
};

type ActionData = {
  error?: string;
};

type RootLoaderData = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const formId = params.formId;
  if (!formId) {
    throw redirect("/my-forms");
  }

  const auth = await enforceOnboardingGuard(request, { allowMyForms: true });
  const { supabase, headers } = createClient(request);

  const { data: profile } = await supabase
    .from("profile")
    .select("id")
    .eq("user_id", auth.user.id)
    .single();
  if (!profile?.id) {
    throw redirect("/my-forms", { headers });
  }

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

  const formMeta = Array.isArray(assignmentRow.form) ? assignmentRow.form[0] ?? null : assignmentRow.form;
  const assignment: Assignment = {
    id: String(assignmentRow.id),
    status: String(assignmentRow.status),
    due_at: assignmentRow.due_at ?? null,
    form: {
      id: String(formMeta?.id ?? ""),
      name: String(formMeta?.name ?? ""),
      is_required: Boolean(formMeta?.is_required),
      due_at: formMeta?.due_at ?? null,
    },
    submission: null,
  };

  const { data: submission } = await supabase
    .from("form_submission")
    .select("id, form_id, submitted_at")
    .eq("form_id", formId)
    .eq("profile_id", profile.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assignment.submission = submission ? { ...submission, submitted_at: submission.submitted_at ?? "" } : null;

  const { data: questions, error: questionsError } = await supabase
    .from("form_question_map")
    .select("form_id, question_code, position, prompt_override, options_override, form_question ( prompt, type, options )")
    .eq("form_id", formId)
    .order("position", { ascending: true });

  if (questionsError) {
    return new Response("Failed to load questions", { status: 500, headers });
  }

  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  const payload: LoaderData = {
    assignment,
    questions: (questions ?? []).map((q) => {
      const base = Array.isArray(q.form_question) ? q.form_question[0] : q.form_question;
      return {
        form_id: String(q.form_id),
        question_code: String(q.question_code ?? ""),
        prompt: q.prompt_override ?? base?.prompt ?? "",
        type: base?.type ?? "text",
        options: Array.isArray(q.options_override ?? base?.options) ? (q.options_override ?? base?.options) : [],
      };
    }),
  };
  return new Response(JSON.stringify(payload), { headers: responseHeaders });
}

export async function action({ request, params }: Route.ActionArgs) {
  const formId = params.formId;
  if (!formId) {
    throw redirect("/my-forms");
  }

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

  const { data: profile } = await supabase
    .from("profile")
    .select("id")
    .eq("user_id", auth.user.id)
    .single();
  if (!profile?.id) {
    return new Response(JSON.stringify({ error: "Profile not found" }), {
      status: 404,
      headers,
    });
  }

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

  const { data: questions, error: questionsError } = await supabase
    .from("form_question_map")
    .select("question_code, form_question ( type )")
    .eq("form_id", formId);

  if (questionsError) {
    return new Response(JSON.stringify({ error: "Failed to load questions" }), {
      status: 500,
      headers,
    });
  }

  const requestMetadata = extractRequestMetadata(request);
  const { data: submissionRows, error: submissionError } = await supabase
    .from("form_submission")
    .insert({
      form_id: formId,
      profile_id: profile.id,
      user_id: auth.user.id,
      ip_address: requestMetadata.ipAddress,
      forwarded_for: requestMetadata.forwardedFor,
      user_agent: requestMetadata.userAgent,
      accept_language: requestMetadata.acceptLanguage,
      referer: requestMetadata.referer,
      origin: requestMetadata.origin,
      metadata: { source: "my_forms" },
    })
    .select("id")
    .single();

  if (submissionError || !submissionRows) {
    return new Response(JSON.stringify({ error: "Failed to save submission" }), {
      status: 500,
      headers,
    });
  }

  const answers = (questions ?? []).map((q) => {
    const base = Array.isArray(q.form_question) ? q.form_question[0] : q.form_question;
    const type = base?.type ?? "text";
    const key = `q-${q.question_code}`;
    const rawValue =
      type === "multi_choice"
        ? formData.getAll(key).map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).join(", ")
        : formData.get(key);
    const normalized = typeof rawValue === "string" ? rawValue.trim() : "";
    const payload = type === "single_choice" ? { value: normalized } : { text: normalized };
    return { submission_id: submissionRows.id, question_code: q.question_code, value: payload };
  });

  if (answers.length > 0) {
    const { error: answersError } = await supabase
      .from("form_answer")
      .upsert(answers, { onConflict: "submission_id,question_code" });

    if (answersError) {
      return new Response(JSON.stringify({ error: "Failed to save answers" }), {
        status: 500,
        headers,
      });
    }
  }

  await supabase.auth.refreshSession();

  throw redirect("/my-forms", { headers });
}

export default function MyFormDetail() {
  const { assignment, questions } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const submitted = Boolean(assignment.submission);
  const isSubmitting =
    navigation.state === "submitting" && navigation.formAction?.includes(assignment.form.id);

  // Client-side session refresh after a successful submit/resubmit so JWT claims update.
  useEffect(() => {
    const didSubmitSuccessfully = navigation.state === "idle" && !actionData?.error && submitted;
    if (!didSubmitSuccessfully) return;

    import("@/lib/supabase/client").then(async ({ createClient }) => {
      const supabaseClient = createClient(rootData?.supabaseUrl, rootData?.supabaseAnonKey);
      await supabaseClient.auth.refreshSession();
    });
  }, [actionData?.error, navigation.state, rootData?.supabaseAnonKey, rootData?.supabaseUrl, submitted]);

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-10">
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
                {questions.map((q) => (
                  <FormQuestion key={q.question_code} question={q} required />
                ))}
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
