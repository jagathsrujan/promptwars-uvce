"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  changePasswordAction,
  updateProfileAction,
} from "@/app/(app)/settings/actions";
import type { Profile } from "@/lib/types";
import { formatISTDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ErrorAlert, Field, inputClass } from "@/components/ui/form";
import { buttonStyles } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { IconLock, IconSignOut, Spinner } from "@/components/icons";

export function SettingsClient({
  profile,
  email,
}: {
  profile: Profile;
  email: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePending, startProfile] = useTransition();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordPending, startPassword] = useTransition();

  function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    startProfile(async () => {
      const res = await updateProfileAction({ fullName, phone });
      if (!res.ok) {
        setProfileError(res.error);
        toast({ variant: "error", title: "Could not save profile", description: res.error });
        return;
      }
      toast({ variant: "success", title: "Profile updated", description: "Your details were saved." });
      router.refresh();
    });
  }

  function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    startPassword(async () => {
      const res = await changePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (!res.ok) {
        setPasswordError(res.error);
        toast({ variant: "error", title: "Could not change password", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: "Password changed",
        description: "Use your new password the next time you sign in.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleProfile}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        noValidate
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">Profile</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Your name appears on transfers, cards and notifications.
          </p>
        </div>
        {profileError ? <ErrorAlert message={profileError} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="settingsName">
            <input
              id="settingsName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone" htmlFor="settingsPhone">
            <input
              id="settingsPhone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98450 12345"
              className={inputClass}
            />
          </Field>
          <Field label="Email" htmlFor="settingsEmail" hint="Email changes aren't supported in the simulator.">
            <input id="settingsEmail" type="email" value={email} disabled className={inputClass} />
          </Field>
          <Field label="Customer since" htmlFor="settingsSince">
            <input
              id="settingsSince"
              type="text"
              value={formatISTDate(profile.created_at)}
              disabled
              className={inputClass}
            />
          </Field>
        </div>

        <button type="submit" disabled={profilePending} className={cn(buttonStyles.primary, "w-full sm:w-auto")}>
          {profilePending ? <Spinner className="h-4 w-4" /> : null}
          {profilePending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <form
        onSubmit={handlePassword}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        noValidate
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
            <IconLock className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Change password</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              We verify your current password before changing it.
            </p>
          </div>
        </div>
        {passwordError ? <ErrorAlert message={passwordError} /> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password" htmlFor="currentPassword">
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmNewPassword">
            <input
              id="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <button type="submit" disabled={passwordPending} className={cn(buttonStyles.primary, "w-full sm:w-auto")}>
          {passwordPending ? <Spinner className="h-4 w-4" /> : null}
          {passwordPending ? "Updating…" : "Change password"}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <IconSignOut className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Sign out</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              End this session on this device. Your data stays safe.
            </p>
          </div>
        </div>
        <SignOutButton className="border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" />
      </div>
    </div>
  );
}
