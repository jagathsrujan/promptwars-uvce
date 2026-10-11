"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  IconBank,
  IconBell,
  IconDashboard,
  IconMenu,
  IconSettings,
  IconSparkles,
  IconStatement,
  IconTransfer,
  IconUsers,
  IconX,
} from "@/components/icons";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/assistant", label: "Assistant", Icon: IconSparkles },
  { href: "/transfer", label: "Transfer", Icon: IconTransfer },
  { href: "/transactions", label: "Transactions", Icon: IconStatement },
  { href: "/beneficiaries", label: "Beneficiaries", Icon: IconUsers },
  { href: "/notifications", label: "Notifications", Icon: IconBell },
  { href: "/settings", label: "Settings", Icon: IconSettings },
] as const;

export function AppShell({
  user,
  unreadCount,
  children,
}: {
  user: { name: string; email: string };
  unreadCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-navy-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon className={cn("h-5 w-5", active ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
              <span className="flex-1">{label}</span>
              {label === "Notifications" && unreadCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                    active ? "bg-white/20 text-white" : "bg-red-100 text-red-700",
                  )}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  function UserCard() {
    return (
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">
            {initials || "BS"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <SignOutButton className="mt-1 w-full justify-start" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-white">
            <IconBank className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">BankSim</span>
        </div>
        <NavLinks />
        <UserCard />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white">
            <IconBank className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900">BankSim</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        >
          <IconMenu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile slide-over */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="animate-rise-in absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white">
                  <IconBank className="h-4 w-4" />
                </div>
                <span className="text-base font-semibold tracking-tight text-slate-900">BankSim</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <UserCard />
          </div>
        </div>
      ) : null}

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Assistant — floating launcher + slide-in panel */}
      <button
        type="button"
        onClick={() => setAssistantOpen(true)}
        aria-label="Open BankSim Assistant"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-navy-900 py-3.5 pl-4 pr-5 text-sm font-semibold text-white shadow-lg shadow-navy-900/25 transition hover:bg-navy-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 sm:bottom-6 sm:right-6"
      >
        <IconSparkles className="h-5 w-5" />
        <span className="hidden sm:inline">Assistant</span>
      </button>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
