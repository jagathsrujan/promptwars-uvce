import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconAlert, IconInfo, Spinner } from "@/components/icons";

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorAlert({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700",
        className,
      )}
    >
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-snug">{message}</span>
    </div>
  );
}

export function InfoAlert({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800",
        className,
      )}
    >
      <IconInfo className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-snug">{message}</span>
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  pendingText,
  disabled,
}: {
  pending: boolean;
  children: ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending ? <Spinner className="h-4 w-4" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
