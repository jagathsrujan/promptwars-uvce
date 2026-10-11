"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CardStatus } from "@/lib/types";

export type CardActionResult =
  | { ok: true; status: CardStatus }
  | { ok: false; error: string };

export async function setCardStatusAction(input: {
  cardId: string;
  status: CardStatus;
}): Promise<CardActionResult> {
  if (input.status !== "ACTIVE" && input.status !== "FROZEN") {
    return { ok: false, error: "Invalid card status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  // RLS + column-level grants allow a user to change only `status` on their
  // own cards; anything else silently affects zero rows.
  const { data, error } = await supabase
    .from("cards")
    .update({ status: input.status })
    .eq("id", input.cardId)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Could not update the card. Please try again." };
  }
  if (!data) {
    return { ok: false, error: "Card not found." };
  }

  revalidatePath("/", "layout");
  return { ok: true, status: data.status };
}
