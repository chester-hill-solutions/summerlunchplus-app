/// <reference types="vite/client" />

type OnboardingMode = 'role' | 'permission';

interface ImportMetaEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_OR_ANON_KEY?: string;
  readonly ONBOARDING_MODE?: OnboardingMode;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
