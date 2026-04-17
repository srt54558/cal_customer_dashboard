/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const LINEAR_WEBHOOK_SIGNATURE_HEADER = "linear-signature";
const LINEAR_WEBHOOK_TS_HEADER = "linear-timestamp";

const http = httpRouter();

http.route({
  path: "/linear-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);
    const timestamp = request.headers.get(LINEAR_WEBHOOK_TS_HEADER) || undefined;

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rawBody = await request.text();

    let payload: unknown;
    try {
      payload = await ctx.runAction(internal.webhooks.parseLinearWebhook, {
        rawBody,
        signature,
        timestamp,
      });
    } catch {
      console.error("WEBHOOK_PARSE_FAILED");
      return new Response(JSON.stringify({ error: "Invalid webhook" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      await ctx.runAction(internal.sync.ingestLinearWebhook, { payload });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      console.error("WEBHOOK_PROCESSING_FAILED");
      return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
