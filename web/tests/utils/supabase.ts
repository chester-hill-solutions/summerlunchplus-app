import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name} env for tests`);
  }
  return value;
}

export const supabaseUrl = requireEnv("VITE_SUPABASE_URL", url);
export const supabaseAnonKey = requireEnv("VITE_SUPABASE_ANON_KEY", anonKey);

export function createAnonClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export function createServiceRoleClient(): SupabaseClient | null {
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export function generateTestUser() {
  const now = Date.now();
  const rand = Math.random().toString(16).slice(2, 8);
  return {
    email: `testuser+${now}-${rand}@example.com`,
    password: "P@ssw0rd!test",
  };
}

export function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return {};
  }
}
