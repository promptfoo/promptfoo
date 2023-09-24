import invariant from 'tiny-invariant';
import { createClient } from '@supabase/supabase-js';

invariant(process.env.NEXT_PUBLIC_SUPABASE_URL, 'Missing env var: NEXT_PUBLIC_SUPABASE_URL');
invariant(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  'Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY',
);

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
