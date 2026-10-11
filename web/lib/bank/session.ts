import { randomUUID } from "node:crypto";

export const SESSION_COOKIE = "banksim_session";

export const SESSION_TTL_MS = 30 * 60_000;

export interface DemoUser {
  customerId: string;
  name: string;
  password: string;
}

export interface Session {
  token: string;
  customerId: string;
  name: string;
  createdAt: number;
  lastSeen: number;
}

export const DEMO_USERS: Record<string, DemoUser> = {
  demo: { customerId: "CUS-1001", name: "Aarav Sharma", password: "demo" },
};

interface SessionStore {
  __banksimSessions?: Map<string, Session>;
}

const store = globalThis as unknown as SessionStore;

function sessions(): Map<string, Session> {
  if (!store.__banksimSessions) store.__banksimSessions = new Map();
  return store.__banksimSessions;
}

export function createSession(user: DemoUser): Session {
  const session: Session = {
    token: randomUUID(),
    customerId: user.customerId,
    name: user.name,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  sessions().set(session.token, session);
  return session;
}

export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
  const map = sessions();
  const session = map.get(token);
  if (!session) return null;
  if (Date.now() - session.lastSeen > SESSION_TTL_MS) {
    map.delete(token);
    return null;
  }
  session.lastSeen = Date.now();
  return session;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions().delete(token);
}

export function resetSessions(): void {
  sessions().clear();
}
