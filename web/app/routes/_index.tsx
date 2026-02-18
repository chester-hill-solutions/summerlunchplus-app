import type { Route } from "./+types/_index";
import { redirect } from "react-router";

import { getServerClient } from "@/server";

export async function loader({ request }: Route.LoaderArgs) {
  const { client, headers } = getServerClient(request);
  const { data } = await client.auth.getUser();

  if (data.user) {
    throw redirect("/home", { headers });
  }

  throw redirect("/info", { headers });
}

export default function Index() {
  return null;
}
