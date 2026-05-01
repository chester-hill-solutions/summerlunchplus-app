import { createBrowserClient } from '@supabase/ssr'

export function createClient(supabaseUrl?: string, supabaseAnonKey?: string) {
  const url = supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL
  const anonKey = supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_OR_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase public config in browser runtime')
  }

  return createBrowserClient(url, anonKey)
}
