import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  emailMappings: defineTable({
    email: v.string(),
    emailDomain: v.string(),
    customerIds: v.array(v.string()),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_domain", ["emailDomain"]),

  customerEmailMappings: defineTable({
    customerExternalId: v.string(),
    email: v.string(),
    updatedAt: v.number(),
  })
    .index("by_customer_email", ["customerExternalId", "email"])
    .index("by_email_customer", ["email", "customerExternalId"]),

  userProfiles: defineTable({
    externalUserId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_external_user_id", ["externalUserId"])
    .index("by_email", ["email"]),

  notificationPreferences: defineTable({
    email: v.string(),
    customerExternalId: v.string(),
    emailNotifications: v.boolean(),
    ticketUpdates: v.boolean(),
    supportComments: v.boolean(),
    weeklyDigest: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_email_customer", ["email", "customerExternalId"])
    .index("by_customer_email", ["customerExternalId", "email"]),

  appearancePreferences: defineTable({
    email: v.string(),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  customers: defineTable({
    externalId: v.string(),
    slug: v.string(),
    name: v.string(),
    domains: v.array(v.string()),
    logoUrl: v.optional(v.union(v.string(), v.null())),
    revenue: v.optional(v.union(v.number(), v.null())),
    size: v.optional(v.union(v.number(), v.null())),
    updatedAt: v.number(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_slug", ["slug"]),

  issues: defineTable({
    externalId: v.string(),
    customerExternalId: v.string(),
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
    syncedAt: v.number(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_identifier", ["identifier"])
    .index("by_customer", ["customerExternalId"]),

  comments: defineTable({
    externalId: v.string(),
    issueExternalId: v.string(),
    customerExternalId: v.optional(v.string()),
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
    syncedAt: v.number(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_issue", ["issueExternalId"])
    .index("by_customer_issue", ["customerExternalId", "issueExternalId"]),

  commentAuthors: defineTable({
    commentExternalId: v.string(),
    issueExternalId: v.string(),
    user: v.object({
      id: v.string(),
      name: v.string(),
      avatarUrl: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
    updatedAt: v.number(),
  })
    .index("by_comment_external_id", ["commentExternalId"])
    .index("by_issue", ["issueExternalId"]),

  activityEvents: defineTable({
    customerExternalId: v.string(),
    issueExternalId: v.string(),
    issueIdentifier: v.string(),
    kind: v.union(
      v.literal("status_changed"),
      v.literal("priority_changed"),
      v.literal("assignee_changed"),
      v.literal("title_changed"),
      v.literal("description_changed"),
      v.literal("comment_added"),
    ),
    message: v.string(),
    createdAtMs: v.number(),
    createdAtIso: v.string(),
  })
    .index("by_customer_created_at", ["customerExternalId", "createdAtMs"])
    .index("by_issue_created_at", ["issueExternalId", "createdAtMs"]),

  notificationCursors: defineTable({
    userId: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    customerExternalId: v.string(),
    clearedAtMs: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_identifier_customer", ["tokenIdentifier", "customerExternalId"]),

  syncMeta: defineTable({
    scope: v.string(),
    externalId: v.string(),
    updatedAt: v.number(),
  }).index("by_scope_and_external_id", ["scope", "externalId"]),

  ingestionEvents: defineTable({
    sourceEventId: v.string(),
    scope: v.string(),
    customerExternalId: v.optional(v.string()),
    entityType: v.string(),
    operation: v.string(),
    payloadHash: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("dead_letter"),
    ),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
    nextAttemptAtMs: v.number(),
    receivedAtMs: v.number(),
    processedAtMs: v.optional(v.number()),
    workerId: v.optional(v.string()),
  })
    .index("by_source_event_id_and_scope", ["sourceEventId", "scope"])
    .index("by_status_and_received_at", ["status", "receivedAtMs"])
    .index("by_status_and_next_attempt_at", ["status", "nextAttemptAtMs"])
    .index("by_customer_and_received_at", ["customerExternalId", "receivedAtMs"]),

  customerProcessingLeases: defineTable({
    customerExternalId: v.string(),
    leaseOwner: v.string(),
    leaseExpiresAtMs: v.number(),
    updatedAt: v.number(),
  }).index("by_customer_external_id", ["customerExternalId"]),

  featureFlags: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  operationalMetrics: defineTable({
    metric: v.string(),
    dimension: v.optional(v.string()),
    status: v.optional(v.string()),
    value: v.optional(v.number()),
    payload: v.optional(v.any()),
    atMs: v.number(),
  })
    .index("by_metric_and_at", ["metric", "atMs"])
    .index("by_status_and_at", ["status", "atMs"]),

  customerDashboardReadModels: defineTable({
    customerExternalId: v.string(),
    totalIssues: v.number(),
    openIssues: v.number(),
    inProgressIssues: v.number(),
    resolvedIssues: v.number(),
    unreadLast12hCount: v.number(),
    latestIssueUpdatedAtMs: v.number(),
    updatedAt: v.number(),
  }).index("by_customer_external_id", ["customerExternalId"]),

  issueListReadModels: defineTable({
    customerExternalId: v.string(),
    issueExternalId: v.string(),
    identifier: v.string(),
    title: v.string(),
    priority: v.number(),
    priorityLabel: v.string(),
    stateName: v.string(),
    stateType: v.string(),
    updatedAtMs: v.number(),
  })
    .index("by_customer_and_updated_at", ["customerExternalId", "updatedAtMs"])
    .index("by_issue_external_id", ["issueExternalId"]),

  issueDetailReadModels: defineTable({
    issueExternalId: v.string(),
    customerExternalId: v.string(),
    description: v.optional(v.string()),
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
    commentCount: v.number(),
    lastCommentAtMs: v.number(),
    updatedAt: v.number(),
  }).index("by_issue_external_id", ["issueExternalId"]),

});
