"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCardStatusAction } from "@/app/(app)/accounts/[id]/actions";
import type { Card, CardStatus } from "@/lib/types";
import { formatExpiry, formatINR, maskCardNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { IconLock, IconSnowflake, Spinner } from "@/components/icons";

export function CardWidget({ card }: { card: Card }) {
  const [status, setStatus] = useState<CardStatus>(card.status);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    setStatus(card.status);
  }, [card.status]);

  const frozen = status === "FROZEN";

  function toggleFreeze() {
    const next: CardStatus = frozen ? "ACTIVE" : "FROZEN";
    startTransition(async () => {
      const res = await setCardStatusAction({ cardId: card.id, status: next });
      if (!res.ok) {
        toast({ variant: "error", title: "Could not update the card", description: res.error });
        return;
      }
      setStatus(res.status);
      toast(
        res.status === "FROZEN"
          ? {
              variant: "success",
              title: "Card frozen",
              description: "No new card payments will be authorised until you unfreeze it.",
            }
          : {
              variant: "success",
              title: "Card unfrozen",
              description: "The card is active again and ready to use.",
            },
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl p-5 text-white shadow-lg transition",
          frozen
            ? "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 shadow-slate-900/20"
            : "bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 shadow-navy-900/30",
        )}
      >
        <div className="flex items-start justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
            {card.network}
          </span>
          {frozen ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
              <IconSnowflake className="h-3 w-3" />
              Frozen
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
              Active
            </span>
          )}
        </div>

        <p className="mt-6 font-mono text-lg tracking-[0.2em] text-white/95">
          {maskCardNumber(card.last4)}
        </p>

        <div className="mt-6 flex items-end justify-between text-xs">
          <div>
            <p className="text-white/60">Card holder</p>
            <p className="mt-0.5 font-semibold uppercase tracking-wide">{card.holder_name}</p>
          </div>
          <div className="text-right">
            <p className="text-white/60">Expires</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {formatExpiry(card.expiry_month, card.expiry_year)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={frozen ? "amber" : "emerald"}>{frozen ? "Frozen" : "Active"}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Daily limit</dt>
            <dd className="font-semibold tabular-nums text-slate-800">
              {formatINR(card.daily_limit)}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={toggleFreeze}
          disabled={pending}
          className={cn(buttonStyles.secondary, "mt-4 w-full")}
        >
          {pending ? (
            <Spinner className="h-4 w-4" />
          ) : frozen ? (
            <IconLock className="h-4 w-4" />
          ) : (
            <IconSnowflake className="h-4 w-4" />
          )}
          {pending
            ? "Updating…"
            : frozen
              ? "Unfreeze card"
              : "Freeze card"}
        </button>
      </div>
    </div>
  );
}
