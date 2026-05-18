import { SupabaseClient } from "@supabase/supabase-js";

export async function getEffectiveUser(supabase: SupabaseClient) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;

  // getUser() failed (network unreachable) — session.user is the offline fallback
  return error ? session.user : null;
}
