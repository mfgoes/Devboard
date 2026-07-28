import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// OAuth sign-in redirects the browser immediately without a preceding network
// call, so a paused/unreachable Supabase project would otherwise fail silently
// after navigation. Ping the health endpoint first so we can show an in-app error.
export async function checkSupabaseReachable(timeoutMs = 6000): Promise<boolean> {
  if (!supabaseConfigured || !supabaseUrl) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
