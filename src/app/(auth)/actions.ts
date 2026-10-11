"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Your email has not been confirmed yet. In Supabase, disable email confirmation for demos (see README) or confirm the address from your inbox.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts right now. Please wait a moment and try again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password") && (m.includes("least") || m.includes("length"))) {
    return "Please choose a longer password (at least 8 characters).";
  }
  if (m.includes("unable to validate email")) {
    return "That email address doesn't look valid. Please check it.";
  }
  return message;
}

function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/dashboard";
}

export async function signInAction(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<{ error: string } | void> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { error: "Enter your email and password to sign in." };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { error: "That email address doesn't look valid. Please check it." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(input.next));
}

export async function signUpAction(input: {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<{ error: string } | { info: string } | void> {
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();

  if (fullName.length < 2) {
    return { error: "Enter your full name (at least 2 characters)." };
  }
  if (fullName.length > 60) {
    return { error: "That name is too long (60 characters max)." };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { error: "That email address doesn't look valid. Please check it." };
  }
  if (phone && !/^[+]?[0-9 ()-]{7,16}$/.test(phone)) {
    return { error: "That phone number doesn't look valid." };
  }
  if (input.password.length < 8) {
    return { error: "Choose a password with at least 8 characters." };
  }
  if (input.password !== input.confirmPassword) {
    return { error: "The passwords don't match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        full_name: fullName,
        phone: phone || null,
      },
    },
  });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  if (!data.session) {
    return {
      info: "Almost there — we sent a confirmation link to your email. Confirm it, then sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
