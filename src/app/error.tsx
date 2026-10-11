"use client";

import { IconAlert, IconRefresh } from "@/components/icons";
import { buttonStyles } from "@/components/ui/bits";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <IconAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
        <button type="button" onClick={reset} className={`${buttonStyles.primary} mt-6 w-full`}>
          <IconRefresh className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
