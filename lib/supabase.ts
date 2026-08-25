import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Throwing at module scope took down every route that imported this file,
 * including ones that don't need auth. Callers check `isSupabaseConfigured`
 * (or a null return) and degrade instead.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl) return null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : supabase;
}
