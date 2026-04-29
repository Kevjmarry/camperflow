import { SupabaseClient } from "@supabase/supabase-js";

export async function getEffectiveUser(supabase: SupabaseClient) {
  console.log('[GEU v2] enter');
  const { data: { session } } = await supabase.auth.getSession();
  console.log('[GEU v2] getSession:', session ? 'HAS_SESSION' : 'NO_SESSION');
  if (!session) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  console.log('[GEU v2] getUser user:', user ? 'HAS_USER' : 'NULL', '| error:', error ? error.message : 'none');
  if (user) return user;

  // getUser() failed (network unreachable) — session.user is the offline fallback
  const fallback = error ? session.user : null;
  console.log('[GEU v2] returning fallback:', fallback ? 'session.user' : 'null');
  return fallback;
}
