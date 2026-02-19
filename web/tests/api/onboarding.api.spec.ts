import { expect, test } from "@playwright/test";

import {
  createAnonClient,
  createServiceRoleClient,
  decodeJwt,
  generateTestUser,
} from "../utils/supabase";

test("onboarding form assigns unassigned users and promotes after submission", async () => {
  const supabase = createAnonClient();
  const admin = createServiceRoleClient();
  const { email, password } = generateTestUser();

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  expect(signUpError).toBeNull();

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();
  const userId = signInData.session?.user.id;
  expect(userId).toBeTruthy();

  const { data: assignment, error: assignmentError } = await supabase
    .from("form_assignment")
    .select("form_id")
    .single();
  expect(assignmentError).toBeNull();
  expect(assignment?.form_id).toBeTruthy();

  const { data: questions, error: questionsError } = await supabase
    .from("form_question")
    .select("id, kind, position")
    .eq("form_id", assignment!.form_id)
    .order("position", { ascending: true });
  expect(questionsError).toBeNull();
  expect(questions?.length).toBeGreaterThanOrEqual(2);

  const { data: submission, error: submissionError } = await supabase
    .from("form_submission")
    .insert({ form_id: assignment!.form_id, user_id: userId })
    .select("id")
    .single();
  expect(submissionError).toBeNull();
  expect(submission?.id).toBeTruthy();

  const answers = (questions ?? []).map((question, index) => ({
    submission_id: submission!.id,
    question_id: question.id,
    value:
      question.kind === "single_choice"
        ? { value: "yes" }
        : { text: `answer-${index + 1}` },
  }));

  const { error: answersError } = await supabase.from("form_answer").insert(answers);
  expect(answersError).toBeNull();

  const { data: refreshData, error: refreshError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  expect(refreshError).toBeNull();
  const refreshedToken = refreshData.session?.access_token;
  expect(refreshedToken).toBeTruthy();

  const payload = decodeJwt(refreshedToken!);
  expect(payload.user_role).toBe("student");
  expect(payload.permissions).toContain("site.read");
  expect(payload.onboarding_complete).toBe(true);

  if (admin && userId) {
    await admin.auth.admin.deleteUser(userId);
  }
});
