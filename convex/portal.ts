/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { canAccessCustomer, getSession, requireSession } from "./lib/session";
import { internal } from "./_generated/api";

const customerValidator = v.object({
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  domains: v.array(v.string()),
  logoUrl: v.optional(v.union(v.string(), v.null())),
  revenue: v.optional(v.union(v.number(), v.null())),
  size: v.optional(v.union(v.number(), v.null())),
});

const issueValidator = v.object({
  id: v.string(),
  customerId: v.string(),
  identifier: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  priority: v.number(),
  priorityLabel: v.string(),
  state: v.object({
    id: v.string(),
    name: v.string(),
    color: v.string(),
    type: v.string(),
  }),
  createdAt: v.string(),
  updatedAt: v.string(),
  url: v.string(),
  labels: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      color: v.string(),
    }),
  ),
  assignee: v.optional(
    v.object({
      id: v.string(),
      name: v.string(),
      avatarUrl: v.optional(v.string()),
    }),
  ),
  attachments: v.optional(
    v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        url: v.string(),
        subtitle: v.optional(v.string()),
      }),
    ),
  ),
  reactions: v.optional(
    v.array(
      v.object({
        emoji: v.string(),
        count: v.number(),
      }),
    ),
  ),
});

const commentValidator = v.object({
  id: v.string(),
  issueId: v.string(),
  parentId: v.optional(v.string()),
  body: v.string(),
  createdAt: v.string(),
  updatedAt: v.optional(v.string()),
  user: v.object({
    id: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  }),
  reactions: v.optional(
    v.array(
      v.object({
        emoji: v.string(),
        count: v.number(),
      }),
    ),
  ),
});

const commentAuthorUserValidator = v.object({
  id: v.string(),
  name: v.string(),
  avatarUrl: v.optional(v.string()),
  email: v.optional(v.string()),
});

const userProfileValidator = v.object({
  id: v.string(),
  email: v.string(),
  name: v.string(),
  avatarUrl: v.optional(v.string()),
});

const MAX_ACTIVITY_ITEMS_PER_CUSTOMER = 300;
const MAX_ACTIVITY_MESSAGE_LENGTH = 220;
const DEFAULT_BATCH_SIZE = 200;
const MAX_AUTHOR_OVERRIDES_PER_ISSUE = 2000;
const MAX_ISSUE_COMMENTS_PER_QUERY = 2000;
const MAX_PREVIOUS_ISSUES = 2000;
const MAX_PREVIOUS_COMMENTS = 10000;

function assertInternalSecret(secret: string | undefined): void {
  const expected = process.env.CONVEX_INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("FORBIDDEN");
  }
}

async function upsertCustomer(ctx: any, customer: {
  id: string;
  slug: string;
  name: string;
  domains: string[];
  logoUrl?: string | null;
  revenue?: number | null;
  size?: number | null;
}) {
  const existing = await ctx.db
    .query("customers")
    .withIndex("by_external_id", (q: any) => q.eq("externalId", customer.id))
    .first();

  const patch = {
    externalId: customer.id,
    slug: customer.slug.toLowerCase(),
    name: customer.name,
    domains: customer.domains.map((domain) => domain.toLowerCase()),
    logoUrl: customer.logoUrl,
    revenue: customer.revenue,
    size: customer.size,
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("customers", patch);
}

async function clearCustomerIssues(ctx: any, customerId: string): Promise<void> {
  while (true) {
    const existingComments = await ctx.db
      .query("comments")
      .withIndex("by_customer_issue", (q: any) => q.eq("customerExternalId", customerId))
      .take(DEFAULT_BATCH_SIZE);
    if (existingComments.length === 0) {
      break;
    }
    for (const comment of existingComments) {
      await ctx.db.delete(comment._id);
    }
  }

  while (true) {
    const existingIssues = await ctx.db
      .query("issues")
      .withIndex("by_customer", (q: any) => q.eq("customerExternalId", customerId))
      .take(DEFAULT_BATCH_SIZE);
    if (existingIssues.length === 0) {
      break;
    }
    for (const issue of existingIssues) {
      await ctx.db.delete(issue._id);
    }
  }
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function stripAuthorPrefix(body: string): string {
  return body.replace(/^\[from:[^\]]+\]\s*\n?/i, "").trim();
}

function assigneeName(assignee: { id: string; name: string; avatarUrl?: string } | undefined): string {
  return assignee?.name?.trim() || "Unassigned";
}

function normalizeActivityMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function extractAuthorNameFromBody(body: string | undefined): string | null {
  if (!body) return null;
  const match = body.match(/^\[from:\s*([^\]]+)\]/i);
  const name = match?.[1]?.trim();
  return name || null;
}

function resolveCommentUser(authorOverride: {
  id: string;
  name: string;
  avatarUrl?: string;
} | undefined, commentExternalId: string, fallbackUser: {
  id: string;
  name: string;
  avatarUrl?: string;
}, body?: string) {
  if (!authorOverride) {
    const prefixedName = extractAuthorNameFromBody(body);
    if (prefixedName) {
      return {
        id: fallbackUser.id,
        name: prefixedName,
        avatarUrl: fallbackUser.avatarUrl,
      };
    }
    return fallbackUser;
  }
  return {
    id: authorOverride.id,
    name: authorOverride.name,
    avatarUrl: authorOverride.avatarUrl,
  };
}

async function loadCommentAuthorOverridesByIssue(ctx: any, issueExternalId: string) {
  const rows = await ctx.db
    .query("commentAuthors")
    .withIndex("by_issue", (q: any) => q.eq("issueExternalId", issueExternalId))
    .take(MAX_AUTHOR_OVERRIDES_PER_ISSUE);
  return new Map<string, { id: string; name: string; avatarUrl?: string }>(
    rows.map((row: any) => [row.commentExternalId, row.user]),
  );
}

async function insertActivityEvent(ctx: any, input: {
  customerExternalId: string;
  issueExternalId: string;
  issueIdentifier: string;
  kind: "status_changed" | "priority_changed" | "assignee_changed" | "title_changed" | "description_changed" | "comment_added";
  message: string;
}) {
  const normalizedMessage = normalizeActivityMessage(input.message);
  if (!normalizedMessage || normalizedMessage.length > MAX_ACTIVITY_MESSAGE_LENGTH) {
    return;
  }
  const now = Date.now();
  await ctx.db.insert("activityEvents", {
    customerExternalId: input.customerExternalId,
    issueExternalId: input.issueExternalId,
    issueIdentifier: input.issueIdentifier,
    kind: input.kind,
    message: normalizedMessage,
    createdAtMs: now,
    createdAtIso: new Date(now).toISOString(),
  });
}

async function pruneCustomerActivityEvents(ctx: any, customerExternalId: string): Promise<void> {
  while (true) {
    const rows = await ctx.db
      .query("activityEvents")
      .withIndex("by_customer_created_at", (q: any) => q.eq("customerExternalId", customerExternalId))
      .order("desc")
      .take(MAX_ACTIVITY_ITEMS_PER_CUSTOMER + DEFAULT_BATCH_SIZE);

    if (rows.length <= MAX_ACTIVITY_ITEMS_PER_CUSTOMER) {
      break;
    }

    const overflowRows = rows.slice(MAX_ACTIVITY_ITEMS_PER_CUSTOMER);
    for (const row of overflowRows) {
      await ctx.db.delete(row._id);
    }

    if (overflowRows.length < DEFAULT_BATCH_SIZE) {
      break;
    }
  }
}

async function scheduleCustomerUpdateEmail(ctx: any, customerExternalId: string, sinceMs: number): Promise<void> {
  const rows = await ctx.db
    .query("activityEvents")
    .withIndex("by_customer_created_at", (q: any) => q.eq("customerExternalId", customerExternalId))
    .order("desc")
    .take(200);

  const events = rows
    .filter((row: any) => row.createdAtMs >= sinceMs)
    .sort((a: any, b: any) => a.createdAtMs - b.createdAtMs)
    .slice(-20)
    .map((row: any) => ({
      issueIdentifier: row.issueIdentifier,
      kind: row.kind,
      message: row.message,
      createdAtIso: row.createdAtIso,
    }));

  if (events.length === 0) return;

  await ctx.scheduler.runAfter(0, internal.notifications.sendCustomerUpdateEmails, {
    customerExternalId,
    events,
  });
}

function toUpdatedAtMs(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLastCommentAtMs(comments: any[]): number {
  let max = 0;
  for (const comment of comments) {
    const ts = Date.parse(comment.updatedAt ?? comment.createdAt ?? "");
    if (Number.isFinite(ts) && ts > max) max = ts;
  }
  return max;
}

async function upsertReadModelsForCustomer(ctx: any, customerExternalId: string, issues: any[], commentsByIssueId: Record<string, any[]>): Promise<void> {
  const now = Date.now();
  const openIssues = issues.filter((issue) => issue.state?.type !== "completed").length;
  const inProgressIssues = issues.filter((issue) => issue.state?.type === "started").length;
  const resolvedIssues = issues.filter((issue) => issue.state?.type === "completed").length;
  const latestIssueUpdatedAtMs = issues.reduce((max, issue) => Math.max(max, toUpdatedAtMs(issue.updatedAt)), 0);

  const recentActivityRows = await ctx.db
    .query("activityEvents")
    .withIndex("by_customer_created_at", (q: any) => q.eq("customerExternalId", customerExternalId))
    .order("desc")
    .take(200);
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const unreadLast12hCount = recentActivityRows.filter((row: any) => row.createdAtMs >= cutoff).length;

  const existingDashboard = await ctx.db
    .query("customerDashboardReadModels")
    .withIndex("by_customer_external_id", (q: any) => q.eq("customerExternalId", customerExternalId))
    .first();
  const dashboardPatch = {
    totalIssues: issues.length,
    openIssues,
    inProgressIssues,
    resolvedIssues,
    unreadLast12hCount,
    latestIssueUpdatedAtMs,
    updatedAt: now,
  };
  if (existingDashboard) {
    await ctx.db.patch(existingDashboard._id, dashboardPatch);
  } else {
    await ctx.db.insert("customerDashboardReadModels", {
      customerExternalId,
      ...dashboardPatch,
    });
  }

  const existingListRows = await ctx.db
    .query("issueListReadModels")
    .withIndex("by_customer_and_updated_at", (q: any) => q.eq("customerExternalId", customerExternalId))
    .take(5000);
  for (const row of existingListRows) {
    await ctx.db.delete(row._id);
  }

  for (const issue of issues) {
    await ctx.db.insert("issueListReadModels", {
      customerExternalId,
      issueExternalId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      stateName: issue.state?.name ?? "",
      stateType: issue.state?.type ?? "",
      updatedAtMs: toUpdatedAtMs(issue.updatedAt),
    });

    const existingDetail = await ctx.db
      .query("issueDetailReadModels")
      .withIndex("by_issue_external_id", (q: any) => q.eq("issueExternalId", issue.id))
      .first();
    const issueComments = commentsByIssueId[issue.id] ?? [];
    const detailPatch = {
      customerExternalId,
      description: issue.description,
      attachments: issue.attachments,
      reactions: issue.reactions,
      commentCount: issueComments.length,
      lastCommentAtMs: toLastCommentAtMs(issueComments),
      updatedAt: now,
    };
    if (existingDetail) {
      await ctx.db.patch(existingDetail._id, detailPatch);
    } else {
      await ctx.db.insert("issueDetailReadModels", {
        issueExternalId: issue.id,
        ...detailPatch,
      });
    }
  }
}

export const listCustomersScoped = query({
  args: {},
  handler: async (ctx) => {
    const session = await getSession(ctx);
    if (!session) {
      return { customers: [], source: "convex" as const, errorCode: "UNAUTHORIZED" as const };
    }
    const scoped = session.role === "employee"
      ? await ctx.db.query("customers").order("desc").take(500)
      : (await Promise.all(
        session.customerIds.map((customerId) =>
          ctx.db.query("customers").withIndex("by_external_id", (q) => q.eq("externalId", customerId)).first(),
        ),
      )).filter(Boolean);

    return {
      customers: scoped.map((customer) => ({
        id: customer.externalId,
        slug: customer.slug,
        name: customer.name,
        domains: customer.domains,
        logoUrl: customer.logoUrl ?? null,
        revenue: customer.revenue ?? null,
        size: customer.size ?? null,
      })),
      source: "convex" as const,
    };
  },
});

export const getCustomerBySlugScoped = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { customer: null, source: "convex" as const, errorCode: "UNAUTHORIZED" as const };
    }
    const slug = args.slug.toLowerCase();

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!customer) {
      return { customer: null, source: "convex" as const };
    }

    if (!canAccessCustomer(session, customer.externalId)) {
      return { customer: null, source: "convex" as const, errorCode: "FORBIDDEN" as const };
    }

    return {
      customer: {
        id: customer.externalId,
        slug: customer.slug,
        name: customer.name,
        domains: customer.domains,
        logoUrl: customer.logoUrl ?? null,
        revenue: customer.revenue ?? null,
        size: customer.size ?? null,
      },
      source: "convex" as const,
    };
  },
});

async function loadIssuesAndCommentsForCustomer(ctx: any, customerId: string) {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_customer", (q: any) => q.eq("customerExternalId", customerId))
    .take(500);

  const sortedIssues = issues.sort((a: any, b: any) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const commentsByIssueId: Record<string, Array<{
    id: string;
    issueId: string;
    parentId?: string;
    body: string;
    createdAt: string;
    updatedAt?: string;
    user: { id: string; name: string; avatarUrl?: string };
    reactions?: Array<{ emoji: string; count: number }>;
  }>> = {};

  const commentsForCustomer = await ctx.db
    .query("comments")
    .withIndex("by_customer_issue", (q: any) => q.eq("customerExternalId", customerId))
    .take(2000);

  for (const issue of sortedIssues) {
    commentsByIssueId[issue.externalId] = [];
  }
  for (const comment of commentsForCustomer) {
    const bucket = commentsByIssueId[comment.issueExternalId] ?? (commentsByIssueId[comment.issueExternalId] = []);
    bucket.push({
      id: comment.externalId,
      issueId: comment.issueExternalId,
      parentId: comment.parentId,
      body: stripAuthorPrefix(comment.body),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.user,
      reactions: comment.reactions,
    });
  }
  for (const issue of sortedIssues) {
    commentsByIssueId[issue.externalId].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  return {
    issues: sortedIssues.map((issue: any) => ({
      id: issue.externalId,
      customerId: issue.customerExternalId,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      state: issue.state,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      url: issue.url,
      labels: issue.labels,
      assignee: issue.assignee,
      attachments: issue.attachments,
      reactions: issue.reactions,
    })),
    commentsByIssueId,
  };
}

async function loadPreviousCustomerProjectionState(ctx: any, customerId: string): Promise<{
  previousIssueByExternalId: Map<string, any>;
  previousCommentIdsByIssue: Map<string, Set<string>>;
}> {
  const previousIssues = await ctx.db
    .query("issues")
    .withIndex("by_customer", (q: any) => q.eq("customerExternalId", customerId))
    .take(MAX_PREVIOUS_ISSUES);
  const previousIssueByExternalId = new Map(previousIssues.map((issue: any) => [issue.externalId, issue]));

  const previousComments = await ctx.db
    .query("comments")
    .withIndex("by_customer_issue", (q: any) => q.eq("customerExternalId", customerId))
    .take(MAX_PREVIOUS_COMMENTS);

  const previousCommentIdsByIssue = new Map<string, Set<string>>();
  for (const comment of previousComments) {
    const bucket = previousCommentIdsByIssue.get(comment.issueExternalId) ?? new Set<string>();
    bucket.add(comment.externalId);
    previousCommentIdsByIssue.set(comment.issueExternalId, bucket);
  }

  return { previousIssueByExternalId, previousCommentIdsByIssue };
}

async function loadRecentActivityForCustomer(ctx: any, session: any, customerId: string, limitInput?: number) {
  const limit = Math.max(1, Math.min(limitInput ?? 20, 100));
  const cursorByToken = await ctx.db
    .query("notificationCursors")
    .withIndex("by_token_identifier_customer", (q: any) =>
      q.eq("tokenIdentifier", session.tokenIdentifier).eq("customerExternalId", customerId),
    )
    .first();
  const clearedAtMs = cursorByToken?.clearedAtMs ?? 0;

  const rows = await ctx.db
    .query("activityEvents")
    .withIndex("by_customer_created_at", (q: any) => q.eq("customerExternalId", customerId))
    .order("desc")
    .take(200);

  const visible = rows.filter((row: any) => row.createdAtMs > clearedAtMs).slice(0, limit);
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const unreadLast12hCount = rows.filter((row: any) => row.createdAtMs > Math.max(clearedAtMs, cutoff)).length;

  return {
    items: visible.map((row: any) => ({
      id: row._id,
      issueExternalId: row.issueExternalId,
      issueIdentifier: row.issueIdentifier,
      kind: row.kind,
      message: row.message,
      createdAtMs: row.createdAtMs,
      createdAtIso: row.createdAtIso,
    })),
    unreadLast12hCount,
  };
}

export const getCustomerOverviewBySlugScoped = query({
  args: {
    slug: v.string(),
    activityLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return {
        customer: null,
        issues: [],
        commentsByIssueId: {},
        recentActivity: [],
        unreadLast12hCount: 0,
        source: "convex" as const,
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    const slug = args.slug.toLowerCase();
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!customer) {
      return {
        customer: null,
        issues: [],
        commentsByIssueId: {},
        recentActivity: [],
        unreadLast12hCount: 0,
        source: "convex" as const,
      };
    }
    if (!canAccessCustomer(session, customer.externalId)) {
      return {
        customer: null,
        issues: [],
        commentsByIssueId: {},
        recentActivity: [],
        unreadLast12hCount: 0,
        source: "convex" as const,
        errorCode: "FORBIDDEN" as const,
      };
    }

    const issuePayload = await loadIssuesAndCommentsForCustomer(ctx, customer.externalId);
    const activityPayload = await loadRecentActivityForCustomer(ctx, session, customer.externalId, args.activityLimit);

    return {
      customer: {
        id: customer.externalId,
        slug: customer.slug,
        name: customer.name,
        domains: customer.domains,
        logoUrl: customer.logoUrl ?? null,
        revenue: customer.revenue ?? null,
        size: customer.size ?? null,
      },
      issues: issuePayload.issues,
      commentsByIssueId: issuePayload.commentsByIssueId,
      recentActivity: activityPayload.items,
      unreadLast12hCount: activityPayload.unreadLast12hCount,
      source: "convex" as const,
    };
  },
});

export const getIssuesForCustomerScoped = query({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return {
        issues: [],
        commentsByIssueId: {},
        source: "convex" as const,
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    if (!canAccessCustomer(session, args.customerId)) {
      return {
        issues: [],
        commentsByIssueId: {},
        source: "convex" as const,
        errorCode: "FORBIDDEN" as const,
      };
    }

    const payload = await loadIssuesAndCommentsForCustomer(ctx, args.customerId);

    return {
      issues: payload.issues,
      commentsByIssueId: payload.commentsByIssueId,
      source: "convex" as const,
    };
  },
});

export const getIssueByIdentifierScoped = query({
  args: {
    identifier: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { issue: null, comments: [], source: "convex" as const, errorCode: "UNAUTHORIZED" as const };
    }
    const identifier = args.identifier.trim().toUpperCase();

    const issue = await ctx.db
      .query("issues")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .first();

    if (!issue) {
      return { issue: null, comments: [], source: "convex" as const, errorCode: "UPSTREAM_FAILED" as const };
    }

    if (!canAccessCustomer(session, issue.customerExternalId)) {
      return { issue: null, comments: [], source: "convex" as const, errorCode: "FORBIDDEN" as const };
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueExternalId", issue.externalId))
      .take(MAX_ISSUE_COMMENTS_PER_QUERY);

    return {
      issue: {
        id: issue.externalId,
        customerId: issue.customerExternalId,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: issue.state,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        url: issue.url,
        labels: issue.labels,
        assignee: issue.assignee,
        attachments: issue.attachments,
        reactions: issue.reactions,
      },
      comments: comments
        .map((comment) => ({
          id: comment.externalId,
          issueId: comment.issueExternalId,
          parentId: comment.parentId,
          body: stripAuthorPrefix(comment.body),
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          user: comment.user,
          reactions: comment.reactions,
        }))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      source: "convex" as const,
    };
  },
});

export const upsertCustomerProjection = mutation({
  args: {
    secret: v.optional(v.string()),
    customer: customerValidator,
    issues: v.array(issueValidator),
    commentsByIssueId: v.record(v.string(), v.array(commentValidator)),
  },
  handler: async (ctx, args) => {
    const startedAtMs = Date.now();
    assertInternalSecret(args.secret);

    const { previousIssueByExternalId, previousCommentIdsByIssue } = await loadPreviousCustomerProjectionState(
      ctx,
      args.customer.id,
    );

    await upsertCustomer(ctx, args.customer);
    await clearCustomerIssues(ctx, args.customer.id);

    for (const issue of args.issues) {
      const previous = previousIssueByExternalId.get(issue.id);
      const authorOverrides = await loadCommentAuthorOverridesByIssue(ctx, issue.id);
      await ctx.db.insert("issues", {
        externalId: issue.id,
        customerExternalId: issue.customerId,
        identifier: issue.identifier.toUpperCase(),
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: issue.state,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        url: issue.url,
        labels: issue.labels,
        assignee: issue.assignee,
        attachments: issue.attachments,
        reactions: issue.reactions,
        syncedAt: Date.now(),
      });

      const comments = args.commentsByIssueId[issue.id] ?? [];
      for (const comment of comments) {
        const user = resolveCommentUser(authorOverrides.get(comment.id), comment.id, comment.user, comment.body);
        await ctx.db.insert("comments", {
          externalId: comment.id,
          issueExternalId: issue.id,
          customerExternalId: issue.customerId,
          parentId: comment.parentId,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          user,
          reactions: comment.reactions,
          syncedAt: Date.now(),
        });

        const previousCommentIds = previousCommentIdsByIssue.get(issue.id) ?? new Set<string>();
        if (!previousCommentIds.has(comment.id) && !comment.id.startsWith("status-")) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "comment_added",
            message: `${user.name} commented on ${issue.identifier}`,
          });
        }
      }

      if (previous) {
        if (previous.state.id !== issue.state.id || previous.state.name !== issue.state.name) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "status_changed",
            message: `${issue.identifier} moved to ${issue.state.name}`,
          });
        }

        if (previous.priority !== issue.priority || previous.priorityLabel !== issue.priorityLabel) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "priority_changed",
            message: `${issue.identifier} priority changed to ${issue.priorityLabel}`,
          });
        }

        if (assigneeName(previous.assignee) !== assigneeName(issue.assignee)) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "assignee_changed",
            message: `${issue.identifier} assigned to ${assigneeName(issue.assignee)}`,
          });
        }

        if (normalizeText(previous.title) !== normalizeText(issue.title)) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "title_changed",
            message: `${issue.identifier} title was updated`,
          });
        }

        if (normalizeText(previous.description) !== normalizeText(issue.description)) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "description_changed",
            message: `${issue.identifier} description was updated`,
          });
        }
      }
    }

    const syncMeta = await ctx.db
      .query("syncMeta")
      .withIndex("by_scope_and_external_id", (q) => q.eq("scope", "customer").eq("externalId", args.customer.id))
      .first();

    if (syncMeta) {
      await ctx.db.patch(syncMeta._id, { updatedAt: Date.now() });
    } else {
      await ctx.db.insert("syncMeta", {
        scope: "customer",
        externalId: args.customer.id,
        updatedAt: Date.now(),
      });
    }

    await pruneCustomerActivityEvents(ctx, args.customer.id);
    await scheduleCustomerUpdateEmail(ctx, args.customer.id, startedAtMs);
    await upsertReadModelsForCustomer(ctx, args.customer.id, args.issues, args.commentsByIssueId);

    return { ok: true };
  },
});

export const upsertCustomers = mutation({
  args: {
    secret: v.optional(v.string()),
    customers: v.array(customerValidator),
  },
  handler: async (ctx, args) => {
    assertInternalSecret(args.secret);
    for (const customer of args.customers) {
      await upsertCustomer(ctx, customer);
    }
    return { ok: true };
  },
});

export const setEmailMapping = mutation({
  args: {
    secret: v.optional(v.string()),
    email: v.string(),
    customerIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertInternalSecret(args.secret);
    const normalizedEmail = args.email.toLowerCase().trim();
    const emailDomain = normalizedEmail.split("@")[1] ?? "";
    const now = Date.now();

    const existing = await ctx.db
      .query("emailMappings")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        emailDomain,
        customerIds: args.customerIds,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("emailMappings", {
        email: normalizedEmail,
        emailDomain,
        customerIds: args.customerIds,
        updatedAt: now,
      });
    }

    while (true) {
      const existingCustomerRows = await ctx.db
        .query("customerEmailMappings")
        .withIndex("by_email_customer", (q) => q.eq("email", normalizedEmail))
        .take(DEFAULT_BATCH_SIZE);
      if (existingCustomerRows.length === 0) {
        break;
      }
      for (const row of existingCustomerRows) {
        await ctx.db.delete(row._id);
      }
    }
    for (const customerExternalId of args.customerIds) {
      await ctx.db.insert("customerEmailMappings", {
        customerExternalId,
        email: normalizedEmail,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

export const setUserProfile = mutation({
  args: {
    secret: v.optional(v.string()),
    user: userProfileValidator,
  },
  handler: async (ctx, args) => {
    assertInternalSecret(args.secret);
    const email = args.user.email.toLowerCase().trim();
    const byId = await ctx.db
      .query("userProfiles")
      .withIndex("by_external_user_id", (q) => q.eq("externalUserId", args.user.id))
      .first();

    if (byId) {
      await ctx.db.patch(byId._id, {
        email,
        name: args.user.name,
        avatarUrl: args.user.avatarUrl,
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    const byEmail = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        externalUserId: args.user.id,
        name: args.user.name,
        avatarUrl: args.user.avatarUrl,
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    await ctx.db.insert("userProfiles", {
      externalUserId: args.user.id,
      email,
      name: args.user.name,
      avatarUrl: args.user.avatarUrl,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const syncMyProfileScoped = mutation({
  args: {
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const email = session.user.email.toLowerCase().trim();
    const byId = await ctx.db
      .query("userProfiles")
      .withIndex("by_external_user_id", (q) => q.eq("externalUserId", session.user.id))
      .first();

    if (byId) {
      await ctx.db.patch(byId._id, {
        email,
        name: args.name,
        avatarUrl: args.avatarUrl,
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    const byEmail = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        externalUserId: session.user.id,
        name: args.name,
        avatarUrl: args.avatarUrl,
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    await ctx.db.insert("userProfiles", {
      externalUserId: session.user.id,
      email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const replaceIssueCommentsScoped = mutation({
  args: {
    issueId: v.string(),
    comments: v.array(commentValidator),
  },
  handler: async (ctx, args) => {
    const startedAtMs = Date.now();
    const session = await requireSession(ctx);
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.issueId))
      .first();

    if (!issue) {
      return { ok: false, errorCode: "UPSTREAM_FAILED" as const };
    }

    if (!canAccessCustomer(session, issue.customerExternalId)) {
      return { ok: false, errorCode: "FORBIDDEN" as const };
    }

    const existing = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueExternalId", issue.externalId))
      .take(MAX_ISSUE_COMMENTS_PER_QUERY);
    const authorOverrides = await loadCommentAuthorOverridesByIssue(ctx, issue.externalId);
    const existingIds = new Set(existing.map((comment) => comment.externalId));
    for (const comment of existing) {
      await ctx.db.delete(comment._id);
    }

    for (const comment of args.comments) {
      const user = resolveCommentUser(authorOverrides.get(comment.id), comment.id, comment.user, comment.body);
      await ctx.db.insert("comments", {
        externalId: comment.id,
        issueExternalId: issue.externalId,
        customerExternalId: issue.customerExternalId,
        parentId: comment.parentId,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        user,
        reactions: comment.reactions,
        syncedAt: Date.now(),
      });

      if (!existingIds.has(comment.id) && !comment.id.startsWith("status-")) {
        await insertActivityEvent(ctx, {
          customerExternalId: issue.customerExternalId,
          issueExternalId: issue.externalId,
          issueIdentifier: issue.identifier,
          kind: "comment_added",
          message: `${user.name} commented on ${issue.identifier}`,
        });
      }
    }

    await pruneCustomerActivityEvents(ctx, issue.customerExternalId);
    await scheduleCustomerUpdateEmail(ctx, issue.customerExternalId, startedAtMs);
    await upsertReadModelsForCustomer(
      ctx,
      issue.customerExternalId,
      [{
        id: issue.externalId,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: issue.state,
        updatedAt: issue.updatedAt,
        attachments: issue.attachments,
        reactions: issue.reactions,
      }],
      { [issue.externalId]: args.comments },
    );

    return { ok: true as const };
  },
});

export const patchIssueActivityScoped = mutation({
  args: {
    issueId: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          id: v.string(),
          title: v.string(),
          url: v.string(),
          subtitle: v.optional(v.string()),
        }),
      ),
    ),
    reactions: v.optional(
      v.array(
        v.object({
          emoji: v.string(),
          count: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.issueId))
      .first();

    if (!issue) {
      return { ok: false, errorCode: "UPSTREAM_FAILED" as const };
    }

    if (!canAccessCustomer(session, issue.customerExternalId)) {
      return { ok: false, errorCode: "FORBIDDEN" as const };
    }

    await ctx.db.patch(issue._id, {
      attachments: args.attachments ?? issue.attachments,
      reactions: args.reactions ?? issue.reactions,
      syncedAt: Date.now(),
    });
    const detail = await ctx.db
      .query("issueDetailReadModels")
      .withIndex("by_issue_external_id", (q) => q.eq("issueExternalId", issue.externalId))
      .first();
    if (detail) {
      await ctx.db.patch(detail._id, {
        attachments: args.attachments ?? issue.attachments,
        reactions: args.reactions ?? issue.reactions,
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const };
  },
});

export const upsertCommentAuthorScoped = mutation({
  args: {
    issueId: v.string(),
    commentId: v.string(),
    user: commentAuthorUserValidator,
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.issueId))
      .first();

    if (!issue) {
      return { ok: false, errorCode: "UPSTREAM_FAILED" as const };
    }
    if (!canAccessCustomer(session, issue.customerExternalId)) {
      return { ok: false, errorCode: "FORBIDDEN" as const };
    }

    const existing = await ctx.db
      .query("commentAuthors")
      .withIndex("by_comment_external_id", (q) => q.eq("commentExternalId", args.commentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        issueExternalId: args.issueId,
        user: args.user,
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    await ctx.db.insert("commentAuthors", {
      commentExternalId: args.commentId,
      issueExternalId: args.issueId,
      user: args.user,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const getEmailMapping = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.toLowerCase().trim();
    const mapping = await ctx.db
      .query("emailMappings")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    return mapping?.customerIds ?? null;
  },
});

export const internalListMappedCustomerIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const ids = new Set<string>();
    for await (const mapping of ctx.db.query("customerEmailMappings")) {
      ids.add(mapping.customerExternalId);
    }
    return Array.from(ids);
  },
});

export const getRecentActivityScoped = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { items: [], unreadLast12hCount: 0, errorCode: "UNAUTHORIZED" as const };
    }
    if (!canAccessCustomer(session, args.customerId)) {
      return { items: [], unreadLast12hCount: 0, errorCode: "FORBIDDEN" as const };
    }

    return loadRecentActivityForCustomer(ctx, session, args.customerId, args.limit);
  },
});

export const getUnreadActivityCountScoped = query({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { unreadLast12hCount: 0, errorCode: "UNAUTHORIZED" as const };
    }
    if (!canAccessCustomer(session, args.customerId)) {
      return { unreadLast12hCount: 0, errorCode: "FORBIDDEN" as const };
    }
    const activity = await loadRecentActivityForCustomer(ctx, session, args.customerId, 1);
    return { unreadLast12hCount: activity.unreadLast12hCount };
  },
});

export const getDashboardSummaryScoped = query({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { summary: null, errorCode: "UNAUTHORIZED" as const };
    }
    if (!canAccessCustomer(session, args.customerId)) {
      return { summary: null, errorCode: "FORBIDDEN" as const };
    }

    const row = await ctx.db
      .query("customerDashboardReadModels")
      .withIndex("by_customer_external_id", (q) => q.eq("customerExternalId", args.customerId))
      .first();
    if (!row) {
      return { summary: null };
    }
    return {
      summary: {
        customerId: row.customerExternalId,
        totalIssues: row.totalIssues,
        openIssues: row.openIssues,
        inProgressIssues: row.inProgressIssues,
        resolvedIssues: row.resolvedIssues,
        unreadLast12hCount: row.unreadLast12hCount,
        latestIssueUpdatedAtMs: row.latestIssueUpdatedAtMs,
        updatedAt: row.updatedAt,
      },
    };
  },
});

export const getIssueListReadModelScoped = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { issues: [], errorCode: "UNAUTHORIZED" as const };
    }
    if (!canAccessCustomer(session, args.customerId)) {
      return { issues: [], errorCode: "FORBIDDEN" as const };
    }
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = await ctx.db
      .query("issueListReadModels")
      .withIndex("by_customer_and_updated_at", (q) => q.eq("customerExternalId", args.customerId))
      .order("desc")
      .take(limit);
    return {
      issues: rows.map((row) => ({
        issueExternalId: row.issueExternalId,
        identifier: row.identifier,
        title: row.title,
        priority: row.priority,
        priorityLabel: row.priorityLabel,
        stateName: row.stateName,
        stateType: row.stateType,
        updatedAtMs: row.updatedAtMs,
      })),
    };
  },
});

export const getIssueDetailReadModelScoped = query({
  args: {
    issueId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return { detail: null, errorCode: "UNAUTHORIZED" as const };
    }
    const detail = await ctx.db
      .query("issueDetailReadModels")
      .withIndex("by_issue_external_id", (q) => q.eq("issueExternalId", args.issueId))
      .first();
    if (!detail) {
      return { detail: null };
    }
    if (!canAccessCustomer(session, detail.customerExternalId)) {
      return { detail: null, errorCode: "FORBIDDEN" as const };
    }
    return {
      detail: {
        issueExternalId: detail.issueExternalId,
        customerExternalId: detail.customerExternalId,
        description: detail.description,
        attachments: detail.attachments,
        reactions: detail.reactions,
        commentCount: detail.commentCount,
        lastCommentAtMs: detail.lastCommentAtMs,
        updatedAt: detail.updatedAt,
      },
    };
  },
});

export const clearRecentActivityScoped = mutation({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    if (!canAccessCustomer(session, args.customerId)) {
      return { ok: false, errorCode: "FORBIDDEN" as const };
    }

    const existingByToken = await ctx.db
      .query("notificationCursors")
      .withIndex("by_token_identifier_customer", (q) =>
        q.eq("tokenIdentifier", session.tokenIdentifier).eq("customerExternalId", args.customerId),
      )
      .first();

    const now = Date.now();
    if (existingByToken) {
      await ctx.db.patch(existingByToken._id, {
        clearedAtMs: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationCursors", {
        tokenIdentifier: session.tokenIdentifier,
        customerExternalId: args.customerId,
        clearedAtMs: now,
        updatedAt: now,
      });
    }

    return { ok: true as const };
  },
});

export const internalUpsertCustomerProjection = internalMutation({
  args: {
    customer: customerValidator,
    issues: v.array(issueValidator),
    commentsByIssueId: v.record(v.string(), v.array(commentValidator)),
  },
  handler: async (ctx, args) => {
    const startedAtMs = Date.now();
    const { previousIssueByExternalId, previousCommentIdsByIssue } = await loadPreviousCustomerProjectionState(
      ctx,
      args.customer.id,
    );

    await upsertCustomer(ctx, args.customer);
    await clearCustomerIssues(ctx, args.customer.id);

    for (const issue of args.issues) {
      const previous = previousIssueByExternalId.get(issue.id);
      const authorOverrides = await loadCommentAuthorOverridesByIssue(ctx, issue.id);
      await ctx.db.insert("issues", {
        externalId: issue.id,
        customerExternalId: issue.customerId,
        identifier: issue.identifier.toUpperCase(),
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: issue.state,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        url: issue.url,
        labels: issue.labels,
        assignee: issue.assignee,
        attachments: issue.attachments,
        reactions: issue.reactions,
        syncedAt: Date.now(),
      });

      const comments = args.commentsByIssueId[issue.id] ?? [];
      for (const comment of comments) {
        const user = resolveCommentUser(authorOverrides.get(comment.id), comment.id, comment.user, comment.body);
        await ctx.db.insert("comments", {
          externalId: comment.id,
          issueExternalId: issue.id,
          customerExternalId: issue.customerId,
          parentId: comment.parentId,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          user,
          reactions: comment.reactions,
          syncedAt: Date.now(),
        });

        const previousCommentIds = previousCommentIdsByIssue.get(issue.id) ?? new Set<string>();
        if (!previousCommentIds.has(comment.id) && !comment.id.startsWith("status-")) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "comment_added",
            message: `${user.name} commented on ${issue.identifier}`,
          });
        }
      }

      if (previous) {
        if (previous.state.id !== issue.state.id || previous.state.name !== issue.state.name) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "status_changed",
            message: `${issue.identifier} moved to ${issue.state.name}`,
          });
        }

        if (previous.priority !== issue.priority || previous.priorityLabel !== issue.priorityLabel) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "priority_changed",
            message: `${issue.identifier} priority changed to ${issue.priorityLabel}`,
          });
        }

        if (assigneeName(previous.assignee) !== assigneeName(issue.assignee)) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "assignee_changed",
            message: `${issue.identifier} assigned to ${assigneeName(issue.assignee)}`,
          });
        }

        if (normalizeText(previous.title) !== normalizeText(issue.title)) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "title_changed",
            message: `${issue.identifier} title was updated`,
          });
        }

        if (normalizeText(previous.description) !== normalizeText(issue.description)) {
          await insertActivityEvent(ctx, {
            customerExternalId: issue.customerId,
            issueExternalId: issue.id,
            issueIdentifier: issue.identifier,
            kind: "description_changed",
            message: `${issue.identifier} description was updated`,
          });
        }
      }
    }

    const syncMeta = await ctx.db
      .query("syncMeta")
      .withIndex("by_scope_and_external_id", (q) => q.eq("scope", "customer").eq("externalId", args.customer.id))
      .first();

    if (syncMeta) {
      await ctx.db.patch(syncMeta._id, { updatedAt: Date.now() });
    } else {
      await ctx.db.insert("syncMeta", {
        scope: "customer",
        externalId: args.customer.id,
        updatedAt: Date.now(),
      });
    }

    await pruneCustomerActivityEvents(ctx, args.customer.id);
    await scheduleCustomerUpdateEmail(ctx, args.customer.id, startedAtMs);
    await upsertReadModelsForCustomer(ctx, args.customer.id, args.issues, args.commentsByIssueId);

    return { ok: true };
  },
});

export const internalUpsertCustomers = internalMutation({
  args: {
    customers: v.array(customerValidator),
  },
  handler: async (ctx, args) => {
    for (const customer of args.customers) {
      await upsertCustomer(ctx, customer);
    }
    return { ok: true };
  },
});
