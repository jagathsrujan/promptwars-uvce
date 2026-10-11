"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function updateProfileAction(input: {
  fullName: string;
  phone: string;
}): Promise<SettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();

  if (fullName.length < 2 || fullName.length > 60) {
    return { ok: false, error: "Enter your full name (2–60 characters)." };
  }
  if (phone && !/^[+]?[0-9 ()-]{7,16}$/.test(phone)) {
    return { ok: false, error: "That phone number doesn't look valid." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "Could not save your profile. Please try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<SettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  if (!input.currentPassword) {
    return { ok: false, error: "Enter your current password." };
  }
  if (input.newPassword.length < 8) {
    return { ok: false, error: "Choose a new password with at least 8 characters." };
  }
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "The new passwords don't match." };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "The new password must be different from the current one." };
  }

  // Verify the current password before changing anything.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.currentPassword,
  });
  if (verifyError) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    const m = updateError.message.toLowerCase();
    if (m.includes("different") || m.includes("same")) {
      return { ok: false, error: "The new password must be different from the current one." };
    }
    if (m.includes("least") || m.includes("length")) {
      return { ok: false, error: "Choose a new password with at least 8 characters." };
    }
    return { ok: false, error: "Could not update your password. Please try again." };
  }

  return { ok: true };
}
