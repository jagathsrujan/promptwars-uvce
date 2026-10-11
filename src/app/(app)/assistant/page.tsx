import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { ensureConversation } from "@/lib/assistant/conversations";
import { PageHeader } from "@/components/ui/bits";
import { AssistantPageClient } from "@/components/assistant/assistant-page-client";

export const metadata: Metadata = { title: "Assistant" };

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const conversation = await ensureConversation(supabase, user.id);

  return (
    <div className="animate-rise-in space-y-6">
      <PageHeader
        title="Assistant"
        description="Ask about balances, statements, transfers and cards. Money moves only after you tap Confirm — chat text can never execute anything."
      />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <AssistantPageClient conversationId={conversation.id} messages={conversation.messages} />
      </div>
    </div>
  );
}
