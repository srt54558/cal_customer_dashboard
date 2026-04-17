import { z } from "zod"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import {
  convexQueryForSession,
  convexSetEmailMapping,
  convexSyncCustomers,
  convexSyncProjection,
} from "@/lib/convex-server"
import {
  SessionSchema,
  type AccessDeniedReason,
  type ApiErrorCode,
  type Comment,
  type Customer,
  type DataSource,
  type Issue,
  type Session,
} from "@/lib/models"
import {
  createCommentInLinear,
  fetchCustomerByDomainFromLinear,
  fetchCustomersFromLinear,
  fetchIssueByIdentifierFromLinear,
  fetchIssuesAndCommentsForCustomerFromLinear,
} from "@/lib/linear"

const FALLBACK_BUDGET_DEFAULT = 30
const fallbackBudgetState = new Map<string, { windowStartMs: number; used: number }>()
const PUBLIC_EMAIL_DOMAIN_BLACKLIST = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "qq.com",
  "163.com",
  "126.com",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "fastmail.com",
])

type SourceWithFallback = Extract<DataSource, "convex" | "linear_fallback">

function isConvexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
}

async function getGuardedFallbackPolicy(session: Session): Promise<{ enabled: boolean; budgetPerMinute: number }> {
  if (!isConvexConfigured()) {
    return { enabled: false, budgetPerMinute: FALLBACK_BUDGET_DEFAULT }
  }
  try {
    const result = await convexQueryForSession<{ mode: "enabled" | "disabled"; budgetPerMinute: number }>(
      session,
      api.ops.getGuardedFallbackPolicy,
      {}
    )
    return {
      enabled: result.mode === "enabled",
      budgetPerMinute: Number.isFinite(result.budgetPerMinute) ? result.budgetPerMinute : FALLBACK_BUDGET_DEFAULT,
    }
  } catch {
    return { enabled: true, budgetPerMinute: FALLBACK_BUDGET_DEFAULT }
  }
}

async function canUseGuardedFallback(session: Session, reasonKey: string): Promise<boolean> {
  const policy = await getGuardedFallbackPolicy(session)
  if (!policy.enabled) return false

  const now = Date.now()
  const minuteBucket = Math.floor(now / 60_000)
  const stateKey = `${reasonKey}:${minuteBucket}`
  const current = fallbackBudgetState.get(stateKey) ?? { windowStartMs: now, used: 0 }
  if (current.used >= policy.budgetPerMinute) {
    return false
  }
  fallbackBudgetState.set(stateKey, { windowStartMs: current.windowStartMs, used: current.used + 1 })
  return true
}


export async function writeCustomerProjection(customer: Customer, issues: Issue[], commentsByIssueId: Record<string, Comment[]>): Promise<void> {
  if (!isConvexConfigured()) return
  await convexSyncProjection({ customer, issues, commentsByIssueId })
}

export async function hydrateAllCustomersFromLinear(): Promise<Customer[]> {
  const customers = await fetchCustomersFromLinear()
  if (isConvexConfigured()) {
    await convexSyncCustomers(customers)
  }
  return customers
}

export async function getCustomersForSession(session: Session): Promise<{ customers: Customer[]; source: SourceWithFallback }> {
  if (!isConvexConfigured()) {
    const refreshed = await fetchCustomersFromLinear()
    const filtered = session.role === "employee" ? refreshed : refreshed.filter((c) => session.customerIds.includes(c.id))
    return { customers: filtered, source: "linear_fallback" }
  }

  try {
    const first = await convexQueryForSession<{ customers: Customer[]; source: "convex" }>(session, api.portal.listCustomersScoped, {})
    if (first.customers.length > 0 || session.role === "customer_user") {
      return { customers: first.customers, source: "convex" }
    }

    if (!(await canUseGuardedFallback(session, "customers_empty"))) {
      return { customers: first.customers, source: "convex" }
    }
    await hydrateAllCustomersFromLinear()
    const second = await convexQueryForSession<{ customers: Customer[]; source: "convex" }>(session, api.portal.listCustomersScoped, {})
    return { customers: second.customers, source: "linear_fallback" }
  } catch {
    console.error("CUSTOMERS_CONVEX_FALLBACK")
    if (!(await canUseGuardedFallback(session, "customers_query_error"))) {
      return { customers: [], source: "convex" }
    }
    const refreshed = await fetchCustomersFromLinear()
    const filtered = session.role === "employee" ? refreshed : refreshed.filter((c) => session.customerIds.includes(c.id))
    return { customers: filtered, source: "linear_fallback" }
  }
}

export function canAccessCustomer(session: Session, customerId: string): boolean {
  if (session.role === "employee") {
    return true
  }
  return session.customerIds.includes(customerId)
}

export async function getCustomerBySlugScoped(session: Session, slug: string): Promise<{ customer: Customer | null; source: SourceWithFallback; errorCode?: ApiErrorCode }> {
  if (!isConvexConfigured()) {
    const customers = await fetchCustomersFromLinear()
    const match = customers.find((entry) => entry.slug.toLowerCase() === slug.toLowerCase()) ?? null
    if (!match) {
      return { customer: null, source: "linear_fallback" }
    }
    if (!canAccessCustomer(session, match.id)) {
      return { customer: null, source: "linear_fallback", errorCode: "FORBIDDEN" }
    }
    return { customer: match, source: "linear_fallback" }
  }

  const first = await convexQueryForSession<{ customer: Customer | null; source: "convex"; errorCode?: ApiErrorCode }>(
    session,
    api.portal.getCustomerBySlugScoped,
    { slug: slug.toLowerCase() }
  )
  if (first.customer || first.errorCode === "FORBIDDEN") {
    return first
  }

  if (!(await canUseGuardedFallback(session, "customer_slug_miss"))) {
    return first
  }
  await hydrateAllCustomersFromLinear()

  const second = await convexQueryForSession<{ customer: Customer | null; source: "convex"; errorCode?: ApiErrorCode }>(
    session,
    api.portal.getCustomerBySlugScoped,
    { slug: slug.toLowerCase() }
  )
  return { ...second, source: second.customer ? "linear_fallback" : "convex" }
}

export async function debugCustomerBySlugResolution(session: Session, slug: string): Promise<{
  slug: string
  sessionRole: Session["role"]
  sessionCustomerIds: string[]
  slugKey: string
  slugCustomerIdInitial: string | null
  slugCustomerIdAfterHydrate: string | null
  canAccessResolvedCustomer: boolean
  resolvedCustomerKey: string
  resolvedCustomerExists: boolean
  resolvedCustomerCorrupted: boolean
  resolvedCustomerSlug: string | null
  resolvedCustomerDomains: string[] | null
}> {
  const customer = await getCustomerBySlugScoped(session, slug)
  return {
    slug: slug.toLowerCase(),
    sessionRole: session.role,
    sessionCustomerIds: session.customerIds,
    slugKey: `convex:customer:slug:${slug.toLowerCase()}`,
    slugCustomerIdInitial: customer.customer?.id ?? null,
    slugCustomerIdAfterHydrate: customer.customer?.id ?? null,
    canAccessResolvedCustomer: customer.customer ? canAccessCustomer(session, customer.customer.id) : false,
    resolvedCustomerKey: customer.customer ? `convex:customer:${customer.customer.id}` : "",
    resolvedCustomerExists: Boolean(customer.customer),
    resolvedCustomerCorrupted: false,
    resolvedCustomerSlug: customer.customer?.slug ?? null,
    resolvedCustomerDomains: customer.customer?.domains ?? null,
  }
}

export async function getIssuesForCustomerScoped(session: Session, customerId: string): Promise<{
  issues: Issue[]
  commentsByIssueId: Record<string, Comment[]>
  source: SourceWithFallback
  errorCode?: ApiErrorCode
}> {
  if (!canAccessCustomer(session, customerId)) {
    return { issues: [], commentsByIssueId: {}, source: "convex", errorCode: "FORBIDDEN" }
  }

  if (!isConvexConfigured()) {
    try {
      const projection = await fetchIssuesAndCommentsForCustomerFromLinear(customerId)
      return {
        issues: projection.issues,
        commentsByIssueId: projection.commentsByIssueId,
        source: "linear_fallback",
      }
    } catch {
      return { issues: [], commentsByIssueId: {}, source: "linear_fallback", errorCode: "UPSTREAM_FAILED" }
    }
  }

  const first = await convexQueryForSession<{
    issues: Issue[]
    commentsByIssueId: Record<string, Comment[]>
    source: "convex"
    errorCode?: ApiErrorCode
  }>(session, api.portal.getIssuesForCustomerScoped, { customerId })

  if (first.errorCode === "FORBIDDEN") {
    return first
  }

  if (first.issues.length > 0) {
    return first
  }

  try {
    const customer = await getCustomerById(session, customerId)
    if (!customer) {
      return { issues: [], commentsByIssueId: {}, source: "convex", errorCode: "UPSTREAM_FAILED" }
    }

    if (!(await canUseGuardedFallback(session, "issues_cache_miss"))) {
      return first
    }
    const projection = await fetchIssuesAndCommentsForCustomerFromLinear(customerId)
    await writeCustomerProjection(customer, projection.issues, projection.commentsByIssueId)

    const second = await convexQueryForSession<{
      issues: Issue[]
      commentsByIssueId: Record<string, Comment[]>
      source: "convex"
      errorCode?: ApiErrorCode
    }>(session, api.portal.getIssuesForCustomerScoped, { customerId })

    return { ...second, source: "linear_fallback" }
  } catch {
    return { issues: [], commentsByIssueId: {}, source: "convex", errorCode: "UPSTREAM_FAILED" }
  }
}

async function getCustomerById(session: Session, customerId: string): Promise<Customer | null> {
  const customers = await getCustomersForSession(session)
  return customers.customers.find((customer) => customer.id === customerId) ?? null
}

export async function getIssueByIdentifierScoped(session: Session, identifier: string): Promise<{
  issue: Issue | null
  comments: Comment[]
  source: SourceWithFallback
  errorCode?: ApiErrorCode
}> {
  if (!isConvexConfigured()) {
    const fromLinear = await fetchIssueByIdentifierFromLinear(identifier)
    if (!fromLinear) {
      return { issue: null, comments: [], source: "linear_fallback", errorCode: "UPSTREAM_FAILED" }
    }
    if (!canAccessCustomer(session, fromLinear.issue.customerId)) {
      return { issue: null, comments: [], source: "linear_fallback", errorCode: "FORBIDDEN" }
    }
    return { issue: fromLinear.issue, comments: fromLinear.comments, source: "linear_fallback" }
  }

  const first = await convexQueryForSession<{
    issue: Issue | null
    comments: Comment[]
    source: "convex"
    errorCode?: ApiErrorCode
  }>(session, api.portal.getIssueByIdentifierScoped, { identifier })

  if (first.issue || first.errorCode === "FORBIDDEN") {
    return first
  }

  const fromLinear = await fetchIssueByIdentifierFromLinear(identifier)
  if (!(await canUseGuardedFallback(session, "issue_identifier_miss"))) {
    return first
  }
  if (!fromLinear) {
    return { issue: null, comments: [], source: "convex", errorCode: "UPSTREAM_FAILED" }
  }

  if (!canAccessCustomer(session, fromLinear.issue.customerId)) {
    return { issue: null, comments: [], source: "convex", errorCode: "FORBIDDEN" }
  }

  const customers = await fetchCustomersFromLinear()
  const customer = customers.find((entry) => entry.id === fromLinear.issue.customerId)

  if (customer) {
    const projection = await fetchIssuesAndCommentsForCustomerFromLinear(customer.id)
    await writeCustomerProjection(customer, projection.issues, projection.commentsByIssueId)
  }

  const second = await convexQueryForSession<{
    issue: Issue | null
    comments: Comment[]
    source: "convex"
    errorCode?: ApiErrorCode
  }>(session, api.portal.getIssueByIdentifierScoped, { identifier })

  return { ...second, source: "linear_fallback" }
}

export async function resolveCustomerMappingByEmailDomain(email: string): Promise<string[] | null> {
  const result = await resolveCustomerMappingByEmailDomainDetailed(email)
  return result.customerIds
}

export async function resolveCustomerMappingByEmailDomainDetailed(email: string): Promise<{
  customerIds: string[] | null
  reason: AccessDeniedReason | null
}> {
  const normalizedEmail = email.toLowerCase().trim()
  const domain = normalizedEmail.split("@")[1]
  if (!domain) {
    return { customerIds: null, reason: "NO_CUSTOMER_MAPPING" }
  }

  const rootDomain = domain.split(".").length > 2 ? domain.split(".").slice(-2).join(".") : domain
  if (PUBLIC_EMAIL_DOMAIN_BLACKLIST.has(domain) || PUBLIC_EMAIL_DOMAIN_BLACKLIST.has(rootDomain)) {
    return { customerIds: null, reason: "BLACKLISTED_EMAIL_DOMAIN" }
  }

  const customer =
    (await fetchCustomerByDomainFromLinear(domain)) ||
    (rootDomain !== domain ? await fetchCustomerByDomainFromLinear(rootDomain) : null)

  if (!customer) {
    return { customerIds: null, reason: "NO_CUSTOMER_MAPPING" }
  }

  if (isConvexConfigured()) {
    await convexSyncCustomers([customer])
    await convexSetEmailMapping(normalizedEmail, [customer.id])
  }

  return { customerIds: [customer.id], reason: null }
}

export async function createCommentScoped(session: Session, issueIdentifier: string, body: string): Promise<{
  ok: boolean
  source: SourceWithFallback
  errorCode?: ApiErrorCode
}> {
  const resolved = await getIssueByIdentifierScoped(session, issueIdentifier)
  if (!resolved.issue) {
    return { ok: false, source: resolved.source, errorCode: resolved.errorCode ?? "UPSTREAM_FAILED" }
  }

  try {
    await createCommentInLinear(resolved.issue.id, body, session.user.name)

    const customers = await fetchCustomersFromLinear()
    const customer = customers.find((entry) => entry.id === resolved.issue?.customerId)
    if (customer && isConvexConfigured()) {
      const projection = await fetchIssuesAndCommentsForCustomerFromLinear(customer.id)
      await writeCustomerProjection(customer, projection.issues, projection.commentsByIssueId)
    }

    return { ok: true, source: "linear_fallback" }
  } catch {
    return { ok: false, source: "linear_fallback", errorCode: "UPSTREAM_FAILED" }
  }
}

function collectCustomerIdsFromWebhookPayload(input: unknown): Set<string> {
  const customerIds = new Set<string>()

  function walk(value: unknown): void {
    if (!value || typeof value !== "object") {
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item)
      }
      return
    }

    const record = value as Record<string, unknown>
    const directId = record.customerId
    if (typeof directId === "string" && directId.trim()) {
      customerIds.add(directId)
    }

    const customer = record.customer
    if (customer && typeof customer === "object") {
      const customerRecord = customer as Record<string, unknown>
      const customerId = customerRecord.id
      if (typeof customerId === "string" && customerId.trim()) {
        customerIds.add(customerId)
      }
    }

    for (const nested of Object.values(record)) {
      walk(nested)
    }
  }

  walk(input)
  return customerIds
}

async function refreshCustomersByIds(customerIds: Set<string>): Promise<void> {
  if (customerIds.size === 0) {
    return
  }

  const customers = await fetchCustomersFromLinear()
  const customerById = new Map(customers.map((customer) => [customer.id, customer]))

  for (const customerId of customerIds) {
    const customer = customerById.get(customerId)
    if (!customer) {
      continue
    }

    const projection = await fetchIssuesAndCommentsForCustomerFromLinear(customer.id)
    await writeCustomerProjection(customer, projection.issues, projection.commentsByIssueId)
  }
}

export async function ingestLinearWebhookEvent(event: unknown): Promise<void> {
  const parsed = z
    .object({
      type: z.string(),
    })
    .passthrough()
    .parse(event)

  if (parsed.type.includes("Issue") || parsed.type.includes("Comment") || parsed.type.includes("Customer")) {
    const customerIds = collectCustomerIdsFromWebhookPayload(parsed)
    await refreshCustomersByIds(customerIds)
    return
  }
}

export async function removeIssue(issueId: string, customerId: string): Promise<void> {
  void issueId
  void customerId
  // No-op in Convex migration: issue cleanup is done via projection upsert.
}

export function validateSessionObject(input: unknown): Session | null {
  const parsed = SessionSchema.safeParse(input)
  if (!parsed.success) {
    return null
  }
  return parsed.data
}

export async function getEmailMappingFromConvex(email: string): Promise<string[] | null> {
  if (!isConvexConfigured()) return null
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  return client.query(api.portal.getEmailMapping, { email })
}
