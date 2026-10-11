import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export function missingEnvMessage(): string {
  return [
    "Supabase is not configured.",
    "Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY from your Supabase project settings,",
    "then restart the dev server. See README.md for the full setup.",
  ].join(" ");
}

/**
 * Request-scoped Supabase client for Server Components and Server Actions.
 * Reads/writes the session cookies via next/headers.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(missingEnvMessage());
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — session refresh is handled by
          // middleware, so this can be safely ignored.
        }
      },
    },
  });
}

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
