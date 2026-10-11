import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/auth/brand-mark";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-8">
      <BrandMark subtitle="Open your BankSim account in seconds" />
      <div className="mt-7">
        <RegisterForm />
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-navy-800 underline-offset-2 hover:text-navy-950 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
