// /api/chat/conversation — conversation bootstrap for the slide-in panel.
//
// GET  → the most recent conversation + its messages (or null), so the panel
//        can resume where the user left off.
// POST → start a fresh conversation (the "New conversation" button).

import { createClient } from "@/lib/supabase/server";
import { createConversation, getLatestConversation } from "@/lib/assistant/conversations";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const latest = await getLatestConversation(supabase, user.id);
  if (!latest) {
    return Response.json({ conversation: null, messages: [] });
  }
  return Response.json({
    conversation: { id: latest.id, title: latest.title },
    messages: latest.messages,
  });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const id = await createConversation(supabase, user.id);
  return Response.json({ conversationId: id });
}
