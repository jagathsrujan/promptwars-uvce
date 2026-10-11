"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

/**
 * Browser Supabase client (session cookies are shared with the server).
 * Created lazily so it is never instantiated at module scope during builds.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return createBrowserClient<Database>(url, key);
}
