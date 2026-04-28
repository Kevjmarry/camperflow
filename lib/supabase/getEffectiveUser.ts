import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Offline Field Mode: tries getUser() (live JWT validation) first.
 * If the network is unavailable and getUser returns no user, falls back
 * to the locally stored session so staff pages stay usable in the field.
 * Online behaviour is unchanged.
 */
export async function getEffectiveUser(supabase: SupabaseClient) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
  } catch {
    // getUser() rejects when offline; fall through to session fallback below
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  }
  return null;
}
