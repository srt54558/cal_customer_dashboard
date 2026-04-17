import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { collectCustomerIdsFromWebhookPayload } from "./lib/linear";

type EnqueueEventsResult = {
  ok: true;
  inserted: number;
  deduped: number;
};

type ClaimedEvent = {
  id: Id<"ingestionEvents">;
  customerExternalId?: string;
  payload: unknown;
};

function assertInternalSecret(secret: string | undefined): void {
  const expected = process.env.CONVEX_INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("FORBIDDEN");
  }
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

function normalizeEventsFromPayload(payload: unknown): Array<{
  sourceEventId: string;
  scope: string;
  customerExternalId?: string;
  entityType: string;
  operation: string;
  payloadHash: string;
  payload: unknown;
}> {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const type = typeof data?.type === "string" ? data.type : "unknown";
  const operation = typeof data?.action === "string" ? data.action : "upsert";
  const entityType = type;
  const customerIds = collectCustomerIdsFromWebhookPayload(payload);
  const serialized = JSON.stringify(payload ?? {});
  const payloadHash = simpleHash(serialized);
  const scope = "linear_webhook";
  const nestedDataId =
    data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>).id : undefined;
  const eventBaseId = `${scope}:${type}:${operation}:${data?.id ?? nestedDataId ?? payloadHash}`;

  if (customerIds.size === 0) {
    return [{
      sourceEventId: eventBaseId,
      scope,
      entityType,
      operation,
      payloadHash,
      payload,
    }];
  }

  return Array.from(customerIds).map((customerExternalId) => ({
    sourceEventId: `${eventBaseId}:${customerExternalId}`,
    scope,
    customerExternalId,
    entityType,
    operation,
    payloadHash,
    payload,
  }));
}

export const enqueueEvents = internalMutation({
  args: {
    events: v.array(v.object({
      sourceEventId: v.string(),
      scope: v.string(),
      customerExternalId: v.optional(v.string()),
      entityType: v.string(),
      operation: v.string(),
      payloadHash: v.string(),
      payload: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let deduped = 0;

    for (const event of args.events) {
      const existing = await ctx.db
        .query("ingestionEvents")
        .withIndex("by_source_event_id_and_scope", (q) => q.eq("sourceEventId", event.sourceEventId).eq("scope", event.scope))
        .first();
      if (existing) {
        deduped += 1;
        continue;
      }

      await ctx.db.insert("ingestionEvents", {
        ...event,
        status: "pending",
        attemptCount: 0,
        nextAttemptAtMs: Date.now(),
        receivedAtMs: Date.now(),
      });
      inserted += 1;
    }

    return { ok: true as const, inserted, deduped };
  },
});

export const enqueueFromWebhook = internalAction({
  args: {
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<EnqueueEventsResult> => {
    const events = normalizeEventsFromPayload(args.payload);
    const result: EnqueueEventsResult = await ctx.runMutation(internal.ingestion.enqueueEvents, { events });

    await ctx.runMutation(internal.ops.recordMetric, {
      metric: "ingestion.enqueue",
      status: "ok",
      value: result.inserted,
      payload: {
        inserted: result.inserted,
        deduped: result.deduped,
      },
    });

    if (result.inserted > 0) {
      await ctx.scheduler.runAfter(0, internal.ingestion.processPendingEvents, { batchSize: 25 });
    }

    return {
      ok: true as const,
      inserted: result.inserted,
      deduped: result.deduped,
    };
  },
});

export const claimPendingEvents = internalMutation({
  args: {
    workerId: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<ClaimedEvent[]> => {
    const now = Date.now();
    const candidates = await ctx.db
      .query("ingestionEvents")
      .withIndex("by_status_and_next_attempt_at", (q) => q.eq("status", "pending").lte("nextAttemptAtMs", now))
      .take(Math.max(1, Math.min(args.limit, 100)));

    const claimed: ClaimedEvent[] = [];
    for (const event of candidates) {
      await ctx.db.patch(event._id, {
        status: "processing",
        workerId: args.workerId,
        attemptCount: event.attemptCount + 1,
      });
      claimed.push({
        id: event._id,
        customerExternalId: event.customerExternalId,
        payload: event.payload,
      });
    }
    return claimed;
  },
});

export const acquireCustomerLease = internalMutation({
  args: {
    customerExternalId: v.string(),
    leaseOwner: v.string(),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const lease = await ctx.db
      .query("customerProcessingLeases")
      .withIndex("by_customer_external_id", (q) => q.eq("customerExternalId", args.customerExternalId))
      .first();

    if (!lease) {
      await ctx.db.insert("customerProcessingLeases", {
        customerExternalId: args.customerExternalId,
        leaseOwner: args.leaseOwner,
        leaseExpiresAtMs: now + args.ttlMs,
        updatedAt: now,
      });
      return true;
    }

    if (lease.leaseOwner === args.leaseOwner || lease.leaseExpiresAtMs <= now) {
      await ctx.db.patch(lease._id, {
        leaseOwner: args.leaseOwner,
        leaseExpiresAtMs: now + args.ttlMs,
        updatedAt: now,
      });
      return true;
    }

    return false;
  },
});

export const releaseCustomerLease = internalMutation({
  args: {
    customerExternalId: v.string(),
    leaseOwner: v.string(),
  },
  handler: async (ctx, args) => {
    const lease = await ctx.db
      .query("customerProcessingLeases")
      .withIndex("by_customer_external_id", (q) => q.eq("customerExternalId", args.customerExternalId))
      .first();
    if (!lease) return { ok: true as const };
    if (lease.leaseOwner !== args.leaseOwner) return { ok: true as const };
    await ctx.db.delete(lease._id);
    return { ok: true as const };
  },
});

export const markEventProcessed = internalMutation({
  args: {
    id: v.id("ingestionEvents"),
    workerId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return { ok: false as const };
    if (row.workerId !== args.workerId) return { ok: false as const };
    await ctx.db.patch(args.id, {
      status: "processed",
      processedAtMs: Date.now(),
      workerId: undefined,
      lastError: undefined,
    });
    return { ok: true as const };
  },
});

export const markEventFailed = internalMutation({
  args: {
    id: v.id("ingestionEvents"),
    workerId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return { ok: false as const };
    if (row.workerId !== args.workerId) return { ok: false as const };
    const attempt = row.attemptCount;
    const dead = attempt >= 8;
    const retryDelayMs = Math.min(60_000, Math.max(1_000, (2 ** Math.min(6, attempt)) * 500));
    await ctx.db.patch(args.id, {
      status: dead ? "dead_letter" : "pending",
      workerId: undefined,
      lastError: args.error.slice(0, 500),
      nextAttemptAtMs: Date.now() + retryDelayMs,
    });
    return { ok: true as const, dead };
  },
});

export const processPendingEvents = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    claimed: number;
    processed: number;
    failed: number;
    leaseBlocked: number;
  }> => {
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 25, 100));
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const claimed: ClaimedEvent[] = await ctx.runMutation(internal.ingestion.claimPendingEvents, {
      workerId,
      limit: batchSize,
    });

    let processed = 0;
    let failed = 0;
    let leaseBlocked = 0;

    for (const event of claimed) {
      let leaseAcquired = true;
      if (event.customerExternalId) {
        leaseAcquired = await ctx.runMutation(internal.ingestion.acquireCustomerLease, {
          customerExternalId: event.customerExternalId,
          leaseOwner: workerId,
          ttlMs: 60_000,
        });
      }

      if (!leaseAcquired) {
        leaseBlocked += 1;
        await ctx.runMutation(internal.ingestion.markEventFailed, {
          id: event.id,
          workerId,
          error: "LEASE_UNAVAILABLE",
        });
        continue;
      }

      try {
        if (event.customerExternalId) {
          await ctx.runAction(internal.sync.refreshCustomersFromLinear, {
            customerIds: [event.customerExternalId],
          });
        } else {
          await ctx.runAction(internal.sync.refreshCustomersFromLinear, {});
        }

        await ctx.runMutation(internal.ingestion.markEventProcessed, {
          id: event.id,
          workerId,
        });
        processed += 1;
      } catch (error: unknown) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error ?? "INGESTION_FAILED");
        await ctx.runMutation(internal.ingestion.markEventFailed, {
          id: event.id,
          workerId,
          error: message,
        });
      } finally {
        if (event.customerExternalId) {
          await ctx.runMutation(internal.ingestion.releaseCustomerLease, {
            customerExternalId: event.customerExternalId,
            leaseOwner: workerId,
          });
        }
      }
    }

    await ctx.runMutation(internal.ops.recordMetric, {
      metric: "ingestion.process",
      status: failed > 0 ? "partial" : "ok",
      payload: {
        claimed: claimed.length,
        processed,
        failed,
        leaseBlocked,
      },
      value: processed,
    });

    if (claimed.length === batchSize) {
      await ctx.scheduler.runAfter(0, internal.ingestion.processPendingEvents, { batchSize });
    }

    return {
      ok: failed === 0,
      claimed: claimed.length,
      processed,
      failed,
      leaseBlocked,
    };
  },
});

export const listDeadLetterEvents = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    return await ctx.db
      .query("ingestionEvents")
      .withIndex("by_status_and_received_at", (q) => q.eq("status", "dead_letter"))
      .order("desc")
      .take(limit);
  },
});

export const replayDeadLetterEvents = mutation({
  args: {
    secret: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertInternalSecret(args.secret);
    const limit = Math.max(1, Math.min(args.limit ?? 100, 1000));
    const rows = await ctx.db
      .query("ingestionEvents")
      .withIndex("by_status_and_received_at", (q) => q.eq("status", "dead_letter"))
      .order("desc")
      .take(limit);

    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: "pending",
        workerId: undefined,
        nextAttemptAtMs: Date.now(),
      });
    }

    return { ok: true as const, replayed: rows.length };
  },
});

export const compactProcessedEvents = mutation({
  args: {
    secret: v.optional(v.string()),
    olderThanMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertInternalSecret(args.secret);
    const limit = Math.max(1, Math.min(args.limit ?? 500, 5000));
    const cutoff = Date.now() - args.olderThanMs;
    const rows = await ctx.db
      .query("ingestionEvents")
      .withIndex("by_status_and_received_at", (q) => q.eq("status", "processed"))
      .take(limit);

    let deleted = 0;
    for (const row of rows) {
      if ((row.processedAtMs ?? 0) < cutoff) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return { ok: true as const, deleted };
  },
});
