import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Offline Field Mode: when offline, reads the locally cached session
 * (no network call). When online, validates via getUser() as normal.
 */
export async function getEffectiveUser(supabase: SupabaseClient) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}
