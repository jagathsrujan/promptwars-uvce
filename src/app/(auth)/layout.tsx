import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 left-1/2 h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-navy-100/70 blur-3xl" />
        <div className="absolute -bottom-48 right-[-10rem] h-[26rem] w-[36rem] rounded-full bg-emerald-100/50 blur-3xl" />
      </div>
      <div className="animate-rise-in relative w-full max-w-md">{children}</div>
    </div>
  );
}
