import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ENV } from './env';

let client: SupabaseClient | undefined;

export const getSupabaseAdmin = () => {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase storage is not configured');
  }
  client ??= createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
};
