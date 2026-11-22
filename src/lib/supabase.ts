import { createClient } from '@supabase/supabase-js';

// Browser client: only used for signing in. Data goes through /api.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);
