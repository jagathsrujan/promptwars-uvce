import { createQuote, getBalance, getHistory } from "./ledger";

export interface ToolResult {
  ok: boolean;
  tool: string;
  result: unknown;
  error?: string;
}

const SCREENS = ["dashboard", "transfer", "history"];

export function executeTool(
  name: string,
  args: Record<string, unknown>,
  opts: { requireOtp?: boolean } = {},
): ToolResult {
  switch (name) {
    case "get_balance":
      return { ok: true, tool: name, result: getBalance() };

    case "get_history":
      return { ok: true, tool: name, result: getHistory() };

    case "start_transfer": {
      const to = String(args.to ?? "").trim();
      const amount = Number(args.amount ?? 0);
      const memo = String(args.memo ?? "");
      if (!to) return { ok: false, tool: name, result: null, error: "no payee provided" };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, tool: name, result: null, error: "invalid amount" };
      }
      const quote = createQuote({ to, amount, memo, requiresOtp: Boolean(opts.requireOtp) });
      return {
        ok: true,
        tool: name,
        result: {
          quote,
          note: quote.requiresOtp
            ? "Customer must confirm with a one-time code to execute."
            : "Customer must confirm to execute.",
        },
      };
    }

    case "navigate": {
      const screen = String(args.screen ?? "");
      if (!SCREENS.includes(screen)) {
        return { ok: false, tool: name, result: null, error: "unknown screen" };
      }
      return { ok: true, tool: name, result: { screen } };
    }

    default:
      return { ok: false, tool: name, result: null, error: `unknown tool "${name}"` };
  }
}
