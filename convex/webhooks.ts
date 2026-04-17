"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { LinearWebhookClient } from "@linear/sdk/webhooks";

export const parseLinearWebhook = internalAction({
  args: {
    rawBody: v.string(),
    signature: v.string(),
    timestamp: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const secret = process.env.LINEAR_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("LINEAR_WEBHOOK_SECRET_MISSING");
    }

    const client = new LinearWebhookClient(secret);
    const rawBody = Buffer.from(args.rawBody, "utf8");
    return client.parseData(rawBody, args.signature, args.timestamp);
  },
});
