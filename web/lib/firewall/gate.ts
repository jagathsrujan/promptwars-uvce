import type { Verdict } from "./types";

export const AGENT_ACTIONS = ["navigate", "get_balance", "get_history", "start_transfer"] as const;

export type AgentAction = (typeof AGENT_ACTIONS)[number];

export interface GateResult {
  allowed: boolean;
  reason?: string;
  requireConfirm: boolean;
  requireOtp: boolean;
}

export function gateAction(verdict: Verdict, actionName: string): GateResult {
  if (verdict.zone === "block") {
    return {
      allowed: false,
      reason: `Blocked by firewall (${verdict.threat_category}, risk ${verdict.risk_score})`,
      requireConfirm: false,
      requireOtp: false,
    };
  }

  if (!(AGENT_ACTIONS as readonly string[]).includes(actionName)) {
    return {
      allowed: false,
      reason: `Unknown action "${actionName}" rejected by gate`,
      requireConfirm: false,
      requireOtp: false,
    };
  }

  if (actionName === "start_transfer") {
    return { allowed: true, requireConfirm: true, requireOtp: verdict.zone === "verify" };
  }

  return { allowed: true, requireConfirm: false, requireOtp: false };
}
