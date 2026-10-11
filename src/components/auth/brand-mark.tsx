import { IconBank } from "@/components/icons";

export function BrandMark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-lg shadow-navy-900/20">
        <IconBank className="h-6 w-6" />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tracking-tight text-slate-900">BankSim</span>
      </div>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}
