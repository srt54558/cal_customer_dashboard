/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  fetchCustomersFromLinear,
  fetchProjectionForCustomer,
} from "./lib/linear";

async function upsertCustomerProjection(ctx: any, customer: any): Promise<void> {
  const projection = await fetchProjectionForCustomer(customer.id);
  await ctx.runMutation(internal.portal.internalUpsertCustomerProjection, {
    customer,
    issues: projection.issues,
    commentsByIssueId: projection.commentsByIssueId,
  });
}

export const refreshCustomersFromLinear = internalAction({
  args: {
    customerIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const mappedCustomerIds = new Set(
      await ctx.runQuery(internal.portal.internalListMappedCustomerIds, {}),
    );
    const requestedIds = new Set(
      (args.customerIds && args.customerIds.length > 0
        ? args.customerIds
        : Array.from(mappedCustomerIds)),
    );

    const effectiveIds = new Set<string>();
    for (const customerId of requestedIds) {
      if (mappedCustomerIds.has(customerId)) {
        effectiveIds.add(customerId);
      }
    }

    if (effectiveIds.size === 0) {
      return {
        ok: true,
        refreshedCustomers: 0,
        failedCustomers: 0,
        requestedCustomers: requestedIds.size,
        ignoredUnmapped: requestedIds.size,
      };
    }

    const allCustomers = await fetchCustomersFromLinear();
    const customers = allCustomers.filter((customer) => effectiveIds.has(customer.id));

    let refreshed = 0;
    let failed = 0;

    for (const customer of customers) {
      try {
        await upsertCustomerProjection(ctx, customer);
        refreshed += 1;
      } catch {
        failed += 1;
        console.error("REFRESH_CUSTOMER_FAILED");
      }
    }

    return {
      ok: failed === 0,
      refreshedCustomers: refreshed,
      failedCustomers: failed,
      requestedCustomers: requestedIds.size,
      ignoredUnmapped: requestedIds.size - effectiveIds.size,
    };
  },
});

export const refreshCustomers = internalAction({
  args: {
    customerIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const customerIds = args.customerIds ?? [];
    const events = (customerIds.length > 0 ? customerIds : [undefined]).map((customerId, idx) => ({
      sourceEventId: `manual_refresh:${customerId ?? "all"}:${now}:${idx}`,
      scope: "manual_refresh",
      customerExternalId: customerId,
      entityType: "customer",
      operation: "refresh",
      payloadHash: `${now}:${idx}`,
      payload: { customerId, trigger: "manual_refresh" },
    }));

    const enqueueResult = await ctx.runMutation(internal.ingestion.enqueueEvents, { events });
    await ctx.runAction(internal.ingestion.processPendingEvents, { batchSize: 25 });

    return {
      ok: true,
      refreshedCustomers: 0,
      failedCustomers: 0,
      requestedCustomers: customerIds.length,
      ignoredUnmapped: 0,
      queueInserted: enqueueResult.inserted,
      queueDeduped: enqueueResult.deduped,
    };
  },
});

export const ingestLinearWebhook = internalAction({
  args: {
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const parsed = args.payload as { type?: string };

    if (!parsed?.type || typeof parsed.type !== "string") {
      return { ok: false, ignored: true };
    }

    if (
      parsed.type.includes("Issue") ||
      parsed.type.includes("Comment") ||
      parsed.type.includes("Customer") ||
      parsed.type.includes("Reaction") ||
      parsed.type.includes("Attachment")
    ) {
      const enqueueResult = await ctx.runAction(internal.ingestion.enqueueFromWebhook, { payload: args.payload });
      return { ok: true, enqueued: enqueueResult.inserted, deduped: enqueueResult.deduped };
    }

    return { ok: true, ignored: true };
  },
});

export const refreshCustomersInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.sync.refreshCustomers, {});
    return { ok: true };
  },
});
