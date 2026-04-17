import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import { requireEnv } from "@/lib/env"
import type { Session } from "@/lib/models"
import { mintConvexToken } from "@/lib/convex-token"

function getConvexUrl(): string {
  return process.env.NEXT_PUBLIC_CONVEX_URL || requireEnv("NEXT_PUBLIC_CONVEX_URL")
}

function getInternalSecret(): string {
  if (process.env.CONVEX_INTERNAL_SECRET) {
    return process.env.CONVEX_INTERNAL_SECRET
  }
  return requireEnv("CONVEX_INTERNAL_SECRET")
}

export async function convexQueryForSession<T>(
  session: Session,
  fn: Parameters<ConvexHttpClient["query"]>[0],
  args: Record<string, unknown>
): Promise<T> {
  const client = new ConvexHttpClient(getConvexUrl())
  const token = await mintConvexToken(session)
  client.setAuth(token)
  return client.query(fn as never, args as never) as Promise<T>
}

export async function convexActionForSession<T>(
  session: Session,
  fn: Parameters<ConvexHttpClient["action"]>[0],
  args: Record<string, unknown>
): Promise<T> {
  const client = new ConvexHttpClient(getConvexUrl())
  const token = await mintConvexToken(session)
  client.setAuth(token)
  return client.action(fn as never, args as never) as Promise<T>
}

export async function convexMutationForSession<T>(
  session: Session,
  fn: Parameters<ConvexHttpClient["mutation"]>[0],
  args: Record<string, unknown>
): Promise<T> {
  const client = new ConvexHttpClient(getConvexUrl())
  const token = await mintConvexToken(session)
  client.setAuth(token)
  return client.mutation(fn as never, args as never) as Promise<T>
}

export async function convexSyncProjection(input: {
  customer: {
    id: string
    slug: string
    name: string
    domains: string[]
    logoUrl?: string | null
    revenue?: number | null
    size?: number | null
  }
  issues: Array<{
    id: string
    customerId: string
    identifier: string
    title: string
    description?: string
    priority: number
    priorityLabel: string
    state: {
      id: string
      name: string
      color: string
      type: string
    }
    createdAt: string
    updatedAt: string
    url: string
    labels: Array<{ id: string; name: string; color: string }>
    assignee?: { id: string; name: string; avatarUrl?: string }
  }>
  commentsByIssueId: Record<
    string,
    Array<{
      id: string
      issueId: string
      parentId?: string
      body: string
      createdAt: string
      updatedAt?: string
      user: { id: string; name: string; avatarUrl?: string }
    }>
  >
}): Promise<void> {
  const client = new ConvexHttpClient(getConvexUrl())
  await client.mutation(api.portal.upsertCustomerProjection, {
    secret: getInternalSecret(),
    ...input,
  })
}

export async function convexSyncCustomers(
  customers: Array<{
    id: string
    slug: string
    name: string
    domains: string[]
    logoUrl?: string | null
    revenue?: number | null
    size?: number | null
  }>
): Promise<void> {
  const client = new ConvexHttpClient(getConvexUrl())
  await client.mutation(api.portal.upsertCustomers, {
    secret: getInternalSecret(),
    customers,
  })
}

export async function convexSetEmailMapping(email: string, customerIds: string[]): Promise<void> {
  const client = new ConvexHttpClient(getConvexUrl())
  await client.mutation(api.portal.setEmailMapping, {
    secret: getInternalSecret(),
    email,
    customerIds,
  })
}

export async function convexSetUserProfile(user: {
  id: string
  email: string
  name: string
  avatarUrl?: string
}): Promise<void> {
  const client = new ConvexHttpClient(getConvexUrl())
  await client.mutation(api.portal.setUserProfile, {
    secret: getInternalSecret(),
    user,
  })
}

export async function convexDeleteAccountScoped(session: Session): Promise<void> {
  await convexMutationForSession(session, api.account.deleteAccountScoped, {})
}
