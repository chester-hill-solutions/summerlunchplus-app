import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client with service-role key for admin operations
export const adminClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
