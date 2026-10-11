import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/auth/brand-mark";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-8">
      <BrandMark subtitle="Sign in to your BankSim account" />
      <div className="mt-7">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        New to BankSim?{" "}
        <Link
          href="/register"
          className="font-semibold text-navy-800 underline-offset-2 hover:text-navy-950 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
