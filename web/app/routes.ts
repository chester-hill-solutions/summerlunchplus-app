import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("home", "routes/home.tsx"),
  route("info", "routes/info.tsx"),
  route("forms", "routes/forms.tsx"),
  route("enroll", "routes/enroll.tsx"),
  route("my-forms", "routes/my-forms.tsx"),
  route("my-forms/:formId", "routes/my-forms.$formId.tsx"),
  route("login", "routes/auth/login.tsx"),
  route(
    "sign-up",
    "routes/sign-up/layout.tsx",
    [
      index("routes/sign-up/index.tsx"),
      route("invite", "routes/sign-up/invite.tsx"),
    ]
  ),
  // Two-stage signup details step (must register to avoid 404)
  route("auth/sign-up-details", "routes/auth/sign-up-details.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("update-password", "routes/auth/update-password.tsx"),
  route("profile", "routes/profile.tsx"),
  route("protected", "routes/protected.tsx"),
  route("auth/confirm", "routes/auth/confirm.tsx"),
  route("auth/error", "routes/auth/error.tsx"),
  route("manage", "routes/team/team.tsx", [
    index("routes/team/index.tsx"),
    route("participants", "routes/team/participants.tsx"),
    route("team", "routes/team/team-members.tsx"),
    route("person-guardian-child", "routes/team/person-guardian-child.tsx"),
    route("workshop", "routes/team/workshop.tsx"),
    route("class", "routes/team/class.tsx"),
    route("class-attendance", "routes/team/class-attendance.tsx"),
    route("workshop-enrollment", "routes/team/workshop-enrollment.tsx"),
    route("form", "routes/team/form.tsx"),
    route("form-question", "routes/team/form-question.tsx"),
    route("form-question-map", "routes/team/form-question-map.tsx"),
    route("form-assignment", "routes/team/form-assignment.tsx"),
    route("form-submission", "routes/team/form-submission.tsx"),
    route("form-answer", "routes/team/form-answer.tsx"),
    route("role-permission", "routes/team/role-permission.tsx"),
    route("user-roles", "routes/team/user-roles.tsx"),
    route("invites", "routes/team/invites.tsx"),
    route("semester", "routes/team/semester.tsx"),
  ]),
] satisfies RouteConfig;
