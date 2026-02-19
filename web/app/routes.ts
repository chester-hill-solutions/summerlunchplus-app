import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("home", "routes/home.tsx"),
  route("info", "routes/info.tsx"),
  route("forms", "routes/forms.tsx"),
  route("my-forms", "routes/my-forms.tsx"),
  route("my-forms/:formId", "routes/my-forms.$formId.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("sign-up", "routes/auth/sign-up.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("update-password", "routes/auth/update-password.tsx"),
  route("profile", "routes/profile.tsx"),
  route("protected", "routes/protected.tsx"),
  route("auth/confirm", "routes/auth/confirm.tsx"),
  route("auth/error", "routes/auth/error.tsx"),
  route("team", "routes/team.tsx", [
    index("routes/team._index.tsx"),
    route("users", "routes/team.users.tsx"),
    route("class-management", "routes/team.class-management.tsx", [
      route("semesters", "routes/team.class-management.semesters.tsx"),
      route("cohorts", "routes/team.class-management.cohorts.tsx"),
      route("classes", "routes/team.class-management.classes.tsx"),
    ]),
  ]),
  route("team/class-managemtn", "routes/team.class-managemtn.tsx"),
] satisfies RouteConfig;
