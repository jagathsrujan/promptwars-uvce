"use client";

import { useState, useTransition, type FormEvent } from "react";
import { signInAction } from "@/app/(auth)/actions";
import { ErrorAlert, Field, inputClass, SubmitButton } from "@/components/ui/form";
import { IconEye, IconEyeOff, IconLock } from "@/components/icons";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/constants";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signInAction({ email, password, next });
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? <ErrorAlert message={error} /> : null}

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
            >
              {showPassword ? <IconEyeOff className="h-4.5 w-4.5" /> : <IconEye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </Field>

        <SubmitButton pending={pending} pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      <div className="rounded-xl border border-navy-100 bg-navy-50/60 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy-700">
          <IconLock className="h-3.5 w-3.5" />
          Demo credentials
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Tap a demo customer to fill the form. Password for all three:{" "}
          <span className="font-mono font-semibold text-navy-800">{DEMO_PASSWORD}</span>
        </p>
        <div className="mt-3 space-y-1.5">
          {DEMO_USERS.map((user) => (
            <button
              key={user.email}
              type="button"
              onClick={() => fillDemo(user.email)}
              className="flex w-full items-center justify-between rounded-lg border border-navy-100 bg-white px-3 py-2 text-left text-xs transition hover:border-navy-300 hover:bg-navy-50"
            >
              <span className="font-medium text-slate-800">{user.name}</span>
              <span className="font-mono text-slate-500">{user.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
