"use client";

import { useState, useTransition, type FormEvent } from "react";
import { signUpAction } from "@/app/(auth)/actions";
import {
  ErrorAlert,
  Field,
  InfoAlert,
  inputClass,
  SubmitButton,
} from "@/components/ui/form";
import { IconEye, IconEyeOff } from "@/components/icons";

export function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== confirmPassword) {
      setError("The passwords don't match.");
      return;
    }

    startTransition(async () => {
      const result = await signUpAction({
        fullName,
        phone,
        email,
        password,
        confirmPassword,
      });
      if (result && "error" in result) {
        setError(result.error);
      } else if (result && "info" in result) {
        setInfo(result.info);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error ? <ErrorAlert message={error} /> : null}
      {info ? <InfoAlert message={info} /> : null}

      <Field label="Full name" htmlFor="fullName">
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Asha Menon"
          className={inputClass}
        />
      </Field>

      <Field label="Phone (optional)" htmlFor="phone">
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 98450 12345"
          className={inputClass}
        />
      </Field>

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

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
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

      <Field label="Confirm password" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          className={inputClass}
        />
      </Field>

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
        Your BankSim account is created instantly: a CHECKING account with a
        unique 11-digit number, a VISA card, and your welcome notification.
      </p>

      <SubmitButton pending={pending} pendingText="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  );
}
