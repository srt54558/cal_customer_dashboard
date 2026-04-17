import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

export const DEFAULT_GUARDED_FALLBACK_MODE = "enabled" as const;

function assertInternalSecret(secret: string | undefined): void {
  const expected = process.env.CONVEX_INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("FORBIDDEN");
  }
}

async function readFlagValue(ctx: QueryCtx | MutationCtx, key: string): Promise<string | null> {
  const row = await ctx.db.query("featureFlags").withIndex("by_key", (q) => q.eq("key", key)).first();
  return row?.value ?? null;
}

export const getFeatureFlag = internalQuery({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return readFlagValue(ctx, args.key);
  },
});

export const getGuardedFallbackPolicy = query({
  args: {},
  handler: async (ctx) => {
    const mode = (await readFlagValue(ctx, "guarded_fallback_mode")) ?? DEFAULT_GUARDED_FALLBACK_MODE;
    const budgetRaw = await readFlagValue(ctx, "guarded_fallback_budget_per_minute");
    const budget = Number.parseInt(String(budgetRaw ?? "30"), 10);
    return {
      mode: mode === "disabled" ? "disabled" as const : "enabled" as const,
      budgetPerMinute: Number.isFinite(budget) && budget > 0 ? budget : 30,
    };
  },
});

export const setFeatureFlag = mutation({
  args: {
    secret: v.optional(v.string()),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    assertInternalSecret(args.secret);
    const existing = await ctx.db.query("featureFlags").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    await ctx.db.insert("featureFlags", {
      key: args.key,
      value: args.value,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const recordMetric = internalMutation({
  args: {
    metric: v.string(),
    dimension: v.optional(v.string()),
    status: v.optional(v.string()),
    value: v.optional(v.number()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("operationalMetrics", {
      metric: args.metric,
      dimension: args.dimension,
      status: args.status,
      value: args.value,
      payload: args.payload,
      atMs: Date.now(),
    });
    return { ok: true as const };
  },
});

export const getOperationalMetrics = query({
  args: {
    metric: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const rows = await ctx.db
      .query("operationalMetrics")
      .withIndex("by_metric_and_at", (q) => q.eq("metric", args.metric))
      .order("desc")
      .take(limit);
    return rows;
  },
});
