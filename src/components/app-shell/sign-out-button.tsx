"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { IconSignOut, Spinner } from "@/components/icons";

export function SignOutButton({ className, compact }: { className?: string; compact?: boolean }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setPending(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Even if the call fails, send the user to the login screen.
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      aria-label={compact ? "Sign out" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 disabled:opacity-60",
        className,
      )}
    >
      {pending ? <Spinner className="h-4 w-4" /> : <IconSignOut className="h-4 w-4" />}
      {!compact ? <span>{pending ? "Signing out…" : "Sign out"}</span> : null}
    </button>
  );
}
