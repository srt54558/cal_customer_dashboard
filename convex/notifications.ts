/* eslint-disable @typescript-eslint/ban-ts-comment */
 
// @ts-nocheck
import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

type PostmarkSendResponse = {
  To?: string;
  SubmittedAt?: string;
  MessageID?: string;
  ErrorCode?: number;
  Message?: string;
};

const activityEventValidator = v.object({
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
  createdAtIso: v.string(),
});

export const getCustomerEmailRecipients = internalQuery({
  args: {
    customerExternalId: v.string(),
    kinds: v.array(
      v.union(
        v.literal("status_changed"),
        v.literal("priority_changed"),
        v.literal("assignee_changed"),
        v.literal("title_changed"),
        v.literal("description_changed"),
        v.literal("comment_added"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.customerExternalId))
      .first();

    const customerMappings = await ctx.db
      .query("customerEmailMappings")
      .withIndex("by_customer_email", (q) => q.eq("customerExternalId", args.customerExternalId))
      .take(1000);
    const candidateEmails = Array.from(
      new Set(customerMappings.map((entry) => entry.email.toLowerCase().trim()).filter((email) => email.length > 0)),
    );

    const hasCommentEvents = args.kinds.includes("comment_added");
    const hasTicketUpdateEvents = args.kinds.some((kind) => kind !== "comment_added");

    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_customer_email", (q) => q.eq("customerExternalId", args.customerExternalId))
      .take(1000);
    const preferenceByEmail = new Map(preferences.map((entry) => [entry.email.toLowerCase().trim(), entry]));
    const recipients: Array<{ email: string; name?: string }> = [];
    for (const email of candidateEmails) {
      const preference = preferenceByEmail.get(email);

      const emailNotifications = preference?.emailNotifications ?? true;
      const ticketUpdates = preference?.ticketUpdates ?? true;
      const supportComments = preference?.supportComments ?? true;

      if (!emailNotifications) continue;
      if (hasTicketUpdateEvents && !ticketUpdates) continue;
      if (hasCommentEvents && !supportComments && !hasTicketUpdateEvents) continue;
      if (hasCommentEvents && hasTicketUpdateEvents && !supportComments && !ticketUpdates) continue;

      recipients.push({
        email,
      });
    }

    return {
      customerName: customer?.name ?? "Customer",
      recipients,
    };
  },
});

function buildFormalEmail(customerName: string, events: Array<{ issueIdentifier: string; message: string; createdAtIso: string }>): {
  subject: string;
  textBody: string;
} {
  const subject = `Cal.com Support Update for ${customerName}`;
  const eventLines = events.map((event) => `- ${event.message} (${event.issueIdentifier})`);
  const textBody = [
    `Hello,`,
    ``,
    `The following updates were recorded for ${customerName}:`,
    ...eventLines,
    ``,
    `This message was sent by Cal.com Support.`,
    ``,
    `Best regards,`,
    `Cal.com Support Team`,
  ].join("\n");

  return { subject, textBody };
}

export const sendCustomerUpdateEmails = internalAction({
  args: {
    customerExternalId: v.string(),
    events: v.array(activityEventValidator),
  },
  handler: async (ctx, args) => {
    const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
    const fromEmail = process.env.POSTMARK_FROM_EMAIL;
    const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound";

    if (!postmarkToken || !fromEmail) {
      return { ok: true, skipped: true, reason: "POSTMARK_NOT_CONFIGURED" as const };
    }
    if (args.events.length === 0) {
      return { ok: true, skipped: true, reason: "NO_EVENTS" as const };
    }

    const payload = await ctx.runQuery(internal.notifications.getCustomerEmailRecipients, {
      customerExternalId: args.customerExternalId,
      kinds: args.events.map((event) => event.kind),
    });
    if (payload.recipients.length === 0) {
      return { ok: true, skipped: true, reason: "NO_RECIPIENTS" as const };
    }

    const normalizedEvents = args.events
      .slice(-10)
      .map((event) => ({
        issueIdentifier: event.issueIdentifier,
        message: event.message,
        createdAtIso: event.createdAtIso,
      }));

    const { subject, textBody } = buildFormalEmail(payload.customerName, normalizedEvents);

    const responses = await Promise.all(
      payload.recipients.map(async (recipient) => {
        const to = recipient.name
          ? `${recipient.name.replace(/"/g, '\\"')} <${recipient.email}>`
          : recipient.email;
        const response = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": postmarkToken,
          },
          body: JSON.stringify({
            From: fromEmail,
            To: to,
            Subject: subject,
            TextBody: textBody,
            MessageStream: messageStream,
          }),
        });
        const responseBody = await response.text();
        let parsedBody: PostmarkSendResponse | null = null;
        try {
          parsedBody = JSON.parse(responseBody) as PostmarkSendResponse;
        } catch {
          parsedBody = null;
        }
        const acceptedByPostmark = response.ok && (parsedBody?.ErrorCode ?? -1) === 0;
        if (!acceptedByPostmark) {
          void responseBody;
          return false;
        }
        return true;
      }),
    );

    const sent = responses.filter(Boolean).length;
    const failed = responses.length - sent;
    return { ok: failed === 0, sent, failed };
  },
});
