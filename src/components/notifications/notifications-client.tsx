"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  setNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import type { Notification } from "@/lib/types";
import { formatISTLong } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EmptyState, buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { IconBell, Spinner } from "@/components/icons";

type Filter = "all" | "unread";

export function NotificationsClient({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();

  const [optimisticRead, setOptimisticRead] = useOptimistic(
    new Set(notifications.filter((n) => n.is_read).map((n) => n.id)),
    (state, id: string) => new Set(state).add(id),
  );

  const unreadCount = notifications.filter((n) => !optimisticRead.has(n.id)).length;
  const visible = notifications.filter(
    (n) => filter === "all" || !optimisticRead.has(n.id),
  );

  function markAll() {
    startTransition(async () => {
      for (const n of notifications) {
        if (!optimisticRead.has(n.id)) setOptimisticRead(n.id);
      }
      const res = await markAllNotificationsReadAction();
      if (!res.ok) {
        toast({ variant: "error", title: "Could not mark all as read", description: res.error });
        return;
      }
      toast({ variant: "success", title: "All notifications marked as read" });
      router.refresh();
    });
  }

  function toggleRead(notification: Notification) {
    const nextRead = !optimisticRead.has(notification.id);
    startTransition(async () => {
      if (nextRead) setOptimisticRead(notification.id);
      const res = await setNotificationReadAction({ id: notification.id, isRead: nextRead });
      if (!res.ok) {
        toast({ variant: "error", title: "Could not update notification", description: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-medium shadow-sm" role="group" aria-label="Filter notifications">
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={cn(
              "rounded-lg px-3.5 py-1.5 transition",
              filter === "all" ? "bg-navy-900 text-white" : "text-slate-600 hover:text-slate-900",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            aria-pressed={filter === "unread"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition",
              filter === "unread" ? "bg-navy-900 text-white" : "text-slate-600 hover:text-slate-900",
            )}
          >
            Unread
            {unreadCount > 0 ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  filter === "unread" ? "bg-white/20 text-white" : "bg-red-100 text-red-700",
                )}
              >
                {unreadCount}
              </span>
            ) : null}
          </button>
        </div>

        <button
          type="button"
          onClick={markAll}
          disabled={pending || unreadCount === 0}
          className={buttonStyles.secondary}
        >
          {pending ? <Spinner className="h-4 w-4" /> : null}
          {pending ? "Updating…" : "Mark all as read"}
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconBell className="h-5 w-5" />}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          description={
            filter === "unread"
              ? "You're all caught up. New alerts about transfers, deposits and security will land here."
              : "Transfer receipts, deposit confirmations and security alerts will appear here."
          }
          action={
            filter === "unread" && notifications.length > 0 ? (
              <button type="button" onClick={() => setFilter("all")} className={buttonStyles.secondary}>
                View all notifications
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visible.map((n) => {
            const unread = !optimisticRead.has(n.id);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => toggleRead(n)}
                  aria-label={unread ? `Mark "${n.title}" as read` : `Mark "${n.title}" as unread`}
                  className={cn(
                    "flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5",
                    unread ? "bg-navy-50/40" : "bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      unread ? "bg-navy-100 text-navy-800" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    <IconBell className="h-4 w-4" />
                    {unread ? (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className={cn("text-sm", unread ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                        {n.title}
                      </span>
                      <span className="text-xs text-slate-400">{formatISTLong(n.created_at)}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                      {n.body}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
