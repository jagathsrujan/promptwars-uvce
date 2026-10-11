"use client";

import { useState } from "react";
import { maskAccountNumber } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { IconCopy, IconEye, IconEyeOff } from "@/components/icons";

export function RevealNumber({ accountNumber }: { accountNumber: string }) {
  const [revealed, setRevealed] = useState(false);
  const { toast } = useToast();

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(accountNumber);
      toast({ variant: "success", title: "Account number copied" });
    } catch {
      toast({
        variant: "error",
        title: "Couldn't copy",
        description: "Clipboard access is blocked in this browser.",
      });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm tracking-widest text-slate-800">
        {revealed ? accountNumber : maskAccountNumber(accountNumber)}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? "Hide account number" : "Reveal account number"}
        aria-pressed={revealed}
        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
      >
        {revealed ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
      </button>
      {revealed ? (
        <button
          type="button"
          onClick={copyNumber}
          aria-label="Copy account number"
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
        >
          <IconCopy className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
