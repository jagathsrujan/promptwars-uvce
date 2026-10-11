import { createQuote, findAccount, getBalance, getHistory } from "./ledger";

export interface ToolResult {
  ok: boolean;
  tool: string;
  result: unknown;
  error?: string;
}

export interface ToolSession {
  customerId: string;
}

const SCREENS = ["dashboard", "transfer", "history"];

const AUTHZ_DENIED = "authorization denied: account does not belong to the session customer";

export function executeTool(
  name: string,
  args: Record<string, unknown>,
  opts: { requireOtp?: boolean; session: ToolSession },
): ToolResult {
  switch (name) {
    case "get_balance": {
      const account = typeof args.account === "string" ? args.account.trim() : "";
      if (account && !findAccount(account, opts.session.customerId)) {
        return { ok: false, tool: name, result: null, error: AUTHZ_DENIED };
      }
      return { ok: true, tool: name, result: getBalance(opts.session.customerId) };
    }

    case "get_history": {
      const account = typeof args.account === "string" ? args.account.trim() : "";
      if (account && !findAccount(account, opts.session.customerId)) {
        return { ok: false, tool: name, result: null, error: AUTHZ_DENIED };
      }
      return { ok: true, tool: name, result: getHistory(opts.session.customerId) };
    }

    case "start_transfer": {
      const to = String(args.to ?? "").trim();
      const amount = Number(args.amount ?? 0);
      const memo = String(args.memo ?? "");
      if (!to) return { ok: false, tool: name, result: null, error: "no payee provided" };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, tool: name, result: null, error: "invalid amount" };
      }
      const quote = createQuote({
        customerId: opts.session.customerId,
        to,
        amount,
        memo,
        requiresOtp: Boolean(opts.requireOtp),
      });
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
