import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

type SessionCtx = QueryCtx | MutationCtx | ActionCtx;

export type SessionClaims = {
  user: {
    id: string;
    email: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  role: "employee" | "customer_user";
  customerIds: string[];
  tokenIdentifier: string;
};

const SESSION_CLAIM_KEY = "https://cal-portal/session";

async function readIdentity(ctx: SessionCtx): Promise<SessionClaims | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const raw = identity[SESSION_CLAIM_KEY];
  if (!raw || typeof raw !== "object") return null;

  const maybe = raw as {
    user?: {
      id?: unknown;
      email?: unknown;
      username?: unknown;
      name?: unknown;
      avatarUrl?: unknown;
    };
    role?: unknown;
    customerIds?: unknown;
  };

  if (!maybe.user || !maybe.role || !Array.isArray(maybe.customerIds)) return null;
  if (
    typeof maybe.user.id !== "string" ||
    typeof maybe.user.email !== "string" ||
    typeof maybe.user.username !== "string" ||
    typeof maybe.user.name !== "string"
  ) {
    return null;
  }
  if (maybe.role !== "employee" && maybe.role !== "customer_user") return null;

  return {
    user: {
      id: maybe.user.id,
      email: maybe.user.email,
      username: maybe.user.username,
      name: maybe.user.name,
      avatarUrl: typeof maybe.user.avatarUrl === "string" ? maybe.user.avatarUrl : undefined,
    },
    role: maybe.role,
    customerIds: maybe.customerIds.map(String),
    tokenIdentifier: identity.tokenIdentifier,
  };
}

export async function getSession(ctx: SessionCtx): Promise<SessionClaims | null> {
  const session = await readIdentity(ctx);
  if (session) {
    return session;
  }

  return null;
}

export async function requireSession(ctx: SessionCtx): Promise<SessionClaims> {
  const session = await getSession(ctx);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export function canAccessCustomer(session: SessionClaims, customerExternalId: string): boolean {
  if (session.role === "employee") return true;
  return session.customerIds.includes(customerExternalId);
}
