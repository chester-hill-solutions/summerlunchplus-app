import { redirect, useFetcher, useLoaderData } from "react-router";

import type { Route } from "./+types/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enforceOnboardingGuard } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";

type FormRow = {
  id: string;
  name: string;
  is_required: boolean;
  due_at: string | null;
  auto_assign: string[];
  form_assignment?: { count: number | null }[];
  form_submission?: { count: number | null }[];
};

type LoaderData = {
  forms: FormRow[];
};

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request);
  const isAdmin = auth.claims.role === "admin" || auth.claims.role === "manager";
  if (!isAdmin) {
    throw redirect("/home", { headers: auth.headers });
  }

  const { supabase, headers } = createClient(request);
  const { data, error } = await supabase
    .from("form")
    .select("id, name, is_required, due_at, auto_assign, form_assignment(count), form_submission(count)")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Response("Failed to load forms", { status: 500, headers });
  }

  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  const payload: LoaderData = { forms: (data ?? []) as FormRow[] };
  return new Response(JSON.stringify(payload), { headers: responseHeaders });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await enforceOnboardingGuard(request);
  const isAdmin = auth.claims.role === "admin" || auth.claims.role === "manager";
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent !== "create_form") {
    return new Response(JSON.stringify({ error: "Unknown intent" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = formData.get("name");
  const dueAt = formData.get("due_at");
  const isRequired = formData.get("is_required") === "on";
  const autoAssign = formData.getAll("auto_assign") as string[];

  if (typeof name !== "string" || name.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { supabase, headers } = createClient(request);

  const { error } = await supabase.from("form").insert({
    name: name.trim(),
    is_required: isRequired,
    due_at: typeof dueAt === "string" && dueAt.length > 0 ? new Date(dueAt).toISOString() : null,
    auto_assign: autoAssign,
  });

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to create form" }), {
      status: 500,
      headers,
    });
  }

  throw redirect("/forms", { headers });
}

const ALL_ROLES: { value: string; label: string }[] = [
  { value: "unassigned", label: "Unassigned" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "instructor", label: "Instructor" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];

function CreateFormCard() {
  const fetcher = useFetcher();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a form</CardTitle>
        <CardDescription>Define a new form shell. Questions can be added later via SQL or follow-up UI.</CardDescription>
      </CardHeader>
      <CardContent>
        <fetcher.Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="create_form" />
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="due_at">Due date (optional)</Label>
            <Input id="due_at" name="due_at" type="date" />
          </div>
          <div className="flex items-center gap-2">
            <input id="is_required" name="is_required" type="checkbox" defaultChecked className="h-4 w-4" />
            <Label htmlFor="is_required">Required</Label>
          </div>
          <div className="space-y-2">
            <Label>Auto-assign to roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((role) => (
                <label key={role.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="auto_assign" value={role.value} className="h-4 w-4" />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={fetcher.state !== "idle"}>
            {fetcher.state === "submitting" ? "Creating..." : "Create"}
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function FormRowCard({ form }: { form: FormRow }) {
  const assignments = form.form_assignment?.[0]?.count ?? 0;
  const submissions = form.form_submission?.[0]?.count ?? 0;
  const pending = Math.max(assignments - submissions, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{form.name}</span>
          <span className="text-sm font-normal text-muted-foreground">{form.is_required ? "Required" : "Optional"}</span>
        </CardTitle>
        <CardDescription>
          {assignments} assigned · {submissions} submitted · {pending} pending
          {form.due_at ? ` · Due ${new Date(form.due_at).toLocaleDateString()}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div>Auto-assign: {form.auto_assign.length ? form.auto_assign.join(", ") : "None"}</div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" asChild>
            <a href="#">Edit (todo)</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="#">View results (todo)</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FormsPage() {
  const { forms } = useLoaderData<LoaderData>();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Forms admin</h1>
        <p className="text-muted-foreground text-sm">Create, manage, and review forms.</p>
      </div>
      <CreateFormCard />
      <div className="grid grid-cols-1 gap-4">
        {forms.length === 0 ? (
          <p className="text-muted-foreground">No forms yet.</p>
        ) : (
          forms.map((form: FormRow) => <FormRowCard key={form.id} form={form} />)
        )}
      </div>
    </main>
  );
}
