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

  console.log(
    "[my-forms] user",
    auth.user.id,
    "role",
    auth.claims.role,
    "supabase url",
    process.env.VITE_SUPABASE_URL,
  );

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error("[my-forms] session error", sessionError);
  } else {
    console.log("[my-forms] session user", sessionData.session?.user?.id, "has token", Boolean(sessionData.session?.access_token));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("[my-forms] getUser error", userError);
  } else {
    console.log("[my-forms] getUser id", userData.user?.id);
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    console.error("[my-forms] claims error", claimsError);
  } else {
    console.log("[my-forms] claims", claimsData.claims);
  }

  const { count: formCount, error: formCountError } = await supabase
    .from("form")
    .select("id", { count: "exact", head: true });
  if (formCountError) {
    console.error("[my-forms] form count error", formCountError);
  } else {
    console.log("[my-forms] form count (RLS filtered)", formCount);
  }

  const { data: sampleAssignments, error: sampleAssignmentsError } = await supabase
    .from("form_assignment")
    .select("id, form_id, user_id, status")
    .limit(5);
  if (sampleAssignmentsError) {
    console.error("[my-forms] sample assignment error", sampleAssignmentsError);
  } else {
    console.log("[my-forms] sample assignments (no filter)", sampleAssignments);
  }

  const { data: sampleForms, error: sampleFormsError } = await supabase
    .from("form")
    .select("id, name, is_required, due_at")
    .limit(5);
  if (sampleFormsError) {
    console.error("[my-forms] sample forms error", sampleFormsError);
  } else {
    console.log("[my-forms] sample forms", sampleForms);
  }

  const { data: rawAssignments, error: rawAssignmentError } = await supabase
    .from("form_assignment")
    .select("id, form_id, user_id, status, due_at, assigned_at")
    .eq("user_id", auth.user.id);
  if (rawAssignmentError) {
    console.error("[my-forms] raw assignment error", rawAssignmentError);
  } else {
    console.log("[my-forms] raw assignments count", rawAssignments?.length ?? 0);
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("form_assignment")
    .select("id, status, due_at, form_id, user_id")
    .eq("user_id", auth.user.id)
    .order("assigned_at", { ascending: true });
  if (assignmentError) {
    console.error("[my-forms] assignment error", assignmentError);
  }
  const assignmentList = assignmentError ? [] : assignments ?? [];

  const formIds = assignmentList.map((a: any) => a.form_id).filter(Boolean) as string[];
  console.log("[my-forms] assignment rows", assignmentList);
  console.log("[my-forms] supabase user id", auth.user.id);
  console.log("[my-forms] form ids for lookup", formIds);
  if (formIds.length > 0) {
    const { data: canRead, error: canReadError } = await supabase.rpc("assignee_can_read_form", {
      p_form_id: formIds[0],
    });
    if (canReadError) {
      console.error("[my-forms] assignee_can_read_form error", canReadError);
    } else {
      console.log("[my-forms] assignee_can_read_form", canRead);
    }
  }
  let formsById: Record<string, { id: string; name: string; is_required: boolean; due_at: string | null }> = {};
  if (formIds.length > 0) {
    const { data: formRows, error: formError } = await supabase
      .from("form")
      .select("id, name, is_required, due_at")
    if (formError) {
      console.error("[my-forms] form fetch error", formError);
    } else {
      formsById = Object.fromEntries(
        (formRows ?? []).map((f) => [f.id, { id: f.id, name: f.name, is_required: f.is_required, due_at: f.due_at }]),
      );
      console.log("[my-forms] fetched forms", formsById);
    }

    const { data: firstForm, error: firstFormError } = await supabase
      .from("form")
      .select("id, name, is_required, due_at, created_at")
      .eq("id", formIds[0])
      .maybeSingle();
    if (firstFormError) {
      console.error("[my-forms] first form fetch error", firstFormError);
    } else {
      console.log("[my-forms] first form fetch", firstForm);
    }
  }

  console.log("[my-forms] initial assignments", assignmentList.length, assignmentList);
  assignmentList.forEach((a: any) => {
    if (a.user_id !== auth.user.id) {
      console.error("[my-forms] assignment user mismatch", { assignmentUserId: a.user_id, authUserId: auth.user.id });
    }
  });

  const normalizedAssignments: Assignment[] = (assignments ?? []).map((a: any) => {
    const formRaw = formsById[a.form_id as string];
    if (!formRaw) {
      console.error("[my-forms] missing form for assignment", {
        assignmentId: a.id,
        formId: a.form_id,
        formFromJoin: a.form,
        formsByIdKeys: Object.keys(formsById),
      });
    }
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

  const { data: submissions, error: submissionError } = await supabase
    .from("form_submission")
    .select("id, form_id, submitted_at")
    .eq("user_id", auth.user.id);
  if (submissionError) {
    console.error("[my-forms] submission error", submissionError);
  }
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
    // Try RPC sync (security definer) first.
    console.log("[my-forms] no assignments, attempting rpc sync");
    await supabase.rpc("sync_auto_assigned_forms_for_user", { p_user_id: auth.user.id });
    const retryFromRpc = await supabase
      .from("form_assignment")
      .select("id, status, due_at, form_id, form:form_id ( id, name, is_required, due_at )")
      .eq("user_id", auth.user.id)
      .order("assigned_at", { ascending: true });
    if (retryFromRpc.error) {
      console.error("[my-forms] rpc retry error", retryFromRpc.error);
    }
    if (!retryFromRpc.error && (retryFromRpc.data?.length ?? 0) > 0) {
      resultAssignments = (retryFromRpc.data ?? []).map((a: any) => {
        const formRaw = a.form;
        const form: Assignment["form"] = {
          id: String(formRaw?.id ?? ""),
          name: String(formRaw?.name ?? ""),
          is_required: Boolean(formRaw?.is_required),
          due_at: formRaw?.due_at ?? null,
        };
        const submission = submissionList.find((s) => s.form_id === form.id) ?? null;
        return { id: String(a.id), status: String(a.status), due_at: a.due_at ?? null, form, submission };
      });
    }

    if (resultAssignments.length === 0) {
      // Attempt to self-create assignments based on auto_assign.
      const role = auth.claims.role ?? "unassigned";
      console.log("[my-forms] auto-assign pass role", role);
      const { data: autoForms } = await supabase
        .from("form")
        .select("id, name, is_required, due_at, auto_assign");
      const eligible = (autoForms ?? []).filter((f: any) => (f.auto_assign ?? []).includes(role));
      console.log("[my-forms] eligible auto-assign forms", eligible.length);
      if (eligible.length > 0) {
        await Promise.all(
          eligible.map((f: any) => supabase.from("form_assignment").upsert({ form_id: f.id, user_id: auth.user.id })),
        );
        const retryAssignments = await supabase
          .from("form_assignment")
          .select("id, status, due_at, form_id, form:form_id ( id, name, is_required, due_at )")
          .eq("user_id", auth.user.id)
          .order("assigned_at", { ascending: true });
        if (retryAssignments.error) {
          console.error("[my-forms] auto-assign retry error", retryAssignments.error);
        }
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

      if (resultAssignments.length === 0) {
        const { data: onboardingForm } = await supabase
          .from("form")
          .select("id, name, is_required, due_at")
          .eq("name", "Onboarding Survey")
          .maybeSingle();
        console.log("[my-forms] onboarding fallback found", Boolean(onboardingForm?.id));
        if (onboardingForm?.id) {
          await supabase
            .from("form_assignment")
            .upsert({ form_id: onboardingForm.id, user_id: auth.user.id, status: "pending" });
          resultAssignments = [
            {
              id: onboardingForm.id,
              status: "pending",
              due_at: onboardingForm.due_at ?? null,
              form: {
                id: onboardingForm.id,
                name: onboardingForm.name,
                is_required: onboardingForm.is_required,
                due_at: onboardingForm.due_at ?? null,
              },
              submission: null,
            },
          ];
        }
      }
    }
  }

  const payload: LoaderData = {
    assignments: resultAssignments,
    claims: auth.claims as Claims,
  };
  console.log("[my-forms] final assignments", resultAssignments.length);
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
                            <Link to={`/my-forms/${assignment.form.id}`}>
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
