// ============================================================================
// Supabase client
// ----------------------------------------------------------------------------
// Creates the single Supabase client used across the app. The Supabase JS
// library is loaded from a CDN <script> tag in the HTML (UMD build), which
// exposes the global `window.supabase`. We wrap it here so every other module
// can `import { sb } from './supabase.js'`.
// ============================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (!window.supabase) {
  // The CDN script must be included BEFORE the module scripts in the HTML.
  throw new Error(
    "Supabase library not found. Make sure the supabase-js CDN <script> tag " +
      "is included before the module scripts."
  );
}

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Return the currently logged-in user, or null. */
export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}
