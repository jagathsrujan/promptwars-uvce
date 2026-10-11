"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NotificationActionResult = { ok: true } | { ok: false; error: string };

export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return { ok: false, error: "Could not update your notifications. Please try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setNotificationReadAction(input: {
  id: string;
  isRead: boolean;
}): Promise<NotificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: input.isRead })
    .eq("id", input.id)
    .select("id");

  if (error) {
    return { ok: false, error: "Could not update the notification. Please try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Notification not found." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
