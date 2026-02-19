import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("home", "routes/home.tsx"),
  route("info", "routes/info.tsx"),
  route("forms", "routes/forms.tsx"),
  route("my-forms", "routes/my-forms.tsx"),
  route("my-forms/:formId", "routes/my-forms.$formId.tsx"),
  route("login", "routes/login.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("logout", "routes/logout.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("update-password", "routes/update-password.tsx"),
  route("profile", "routes/profile.tsx"),
  route("protected", "routes/protected.tsx"),
  route("auth/confirm", "routes/auth.confirm.tsx"),
  route("auth/error", "routes/auth.error.tsx"),
] satisfies RouteConfig;
