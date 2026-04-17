/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canAccessCustomer, getSession, requireSession } from "./lib/session";

const themeValidator = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailDomain(email: string): string | null {
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1];
}

function defaultNotificationPreferences() {
  return {
    emailNotifications: true,
    ticketUpdates: true,
    supportComments: true,
    weeklyDigest: false,
  };
}

export const getSettingsScoped = query({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    if (!canAccessCustomer(session, args.customerId)) {
      return {
        errorCode: "FORBIDDEN" as const,
        notificationPreferences: defaultNotificationPreferences(),
        appearance: { theme: "system" as const },
      };
    }

    const email = normalizeEmail(session.user.email);
    const notificationPref = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_email_customer", (q) => q.eq("email", email).eq("customerExternalId", args.customerId))
      .first();
    const appearancePref = await ctx.db
      .query("appearancePreferences")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    return {
      notificationPreferences: notificationPref
        ? {
            emailNotifications: notificationPref.emailNotifications,
            ticketUpdates: notificationPref.ticketUpdates,
            supportComments: notificationPref.supportComments,
            weeklyDigest: notificationPref.weeklyDigest,
          }
        : defaultNotificationPreferences(),
      appearance: {
        theme: (appearancePref?.theme ?? "system") as "light" | "dark" | "system",
      },
    };
  },
});

export const getSettingsByCustomerSlugScoped = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx);
    if (!session) {
      return {
        customer: null,
        errorCode: "UNAUTHORIZED" as const,
        notificationPreferences: defaultNotificationPreferences(),
        appearance: { theme: "system" as const },
      };
    }

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.toLowerCase()))
      .first();
    if (!customer) {
      return {
        customer: null,
        notificationPreferences: defaultNotificationPreferences(),
        appearance: { theme: "system" as const },
      };
    }
    if (!canAccessCustomer(session, customer.externalId)) {
      return {
        customer: null,
        errorCode: "FORBIDDEN" as const,
        notificationPreferences: defaultNotificationPreferences(),
        appearance: { theme: "system" as const },
      };
    }

    const email = normalizeEmail(session.user.email);
    const notificationPref = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_email_customer", (q) => q.eq("email", email).eq("customerExternalId", customer.externalId))
      .first();
    const appearancePref = await ctx.db
      .query("appearancePreferences")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    return {
      customer: {
        id: customer.externalId,
        slug: customer.slug,
        name: customer.name,
      },
      notificationPreferences: notificationPref
        ? {
            emailNotifications: notificationPref.emailNotifications,
            ticketUpdates: notificationPref.ticketUpdates,
            supportComments: notificationPref.supportComments,
            weeklyDigest: notificationPref.weeklyDigest,
          }
        : defaultNotificationPreferences(),
      appearance: {
        theme: (appearancePref?.theme ?? "system") as "light" | "dark" | "system",
      },
    };
  },
});

export const setNotificationPreferencesScoped = mutation({
  args: {
    customerId: v.string(),
    emailNotifications: v.boolean(),
    ticketUpdates: v.boolean(),
    supportComments: v.boolean(),
    weeklyDigest: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    if (!canAccessCustomer(session, args.customerId)) {
      return { ok: false as const, errorCode: "FORBIDDEN" as const };
    }

    const email = normalizeEmail(session.user.email);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_email_customer", (q) => q.eq("email", email).eq("customerExternalId", args.customerId))
      .first();

    const patch = {
      emailNotifications: args.emailNotifications,
      ticketUpdates: args.ticketUpdates,
      supportComments: args.supportComments,
      weeklyDigest: args.weeklyDigest,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("notificationPreferences", {
        email,
        customerExternalId: args.customerId,
        ...patch,
      });
    }

    return { ok: true as const };
  },
});

export const setAppearanceScoped = mutation({
  args: {
    theme: themeValidator,
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);
    const email = normalizeEmail(session.user.email);
    const existing = await ctx.db
      .query("appearancePreferences")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        theme: args.theme,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("appearancePreferences", {
        email,
        theme: args.theme,
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const };
  },
});

async function deleteCustomerProjectionData(ctx: any, customerExternalId: string): Promise<void> {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_customer", (q: any) => q.eq("customerExternalId", customerExternalId))
    .collect();
  for (const issue of issues) {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q: any) => q.eq("issueExternalId", issue.externalId))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    const commentAuthors = await ctx.db
      .query("commentAuthors")
      .withIndex("by_issue", (q: any) => q.eq("issueExternalId", issue.externalId))
      .collect();
    for (const author of commentAuthors) {
      await ctx.db.delete(author._id);
    }

    await ctx.db.delete(issue._id);
  }

  const activityEvents = await ctx.db
    .query("activityEvents")
    .withIndex("by_customer_created_at", (q: any) => q.eq("customerExternalId", customerExternalId))
    .collect();
  for (const event of activityEvents) {
    await ctx.db.delete(event._id);
  }

  const notificationPrefs = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_customer_email", (q: any) => q.eq("customerExternalId", customerExternalId))
    .collect();
  for (const pref of notificationPrefs) {
    await ctx.db.delete(pref._id);
  }

  const customers = await ctx.db
    .query("customers")
    .withIndex("by_external_id", (q: any) => q.eq("externalId", customerExternalId))
    .collect();
  for (const customer of customers) {
    await ctx.db.delete(customer._id);
  }

  const syncMeta = await ctx.db
    .query("syncMeta")
    .withIndex("by_scope_and_external_id", (q: any) => q.eq("scope", "customer").eq("externalId", customerExternalId))
    .collect();
  for (const row of syncMeta) {
    await ctx.db.delete(row._id);
  }
}

export const deleteAccountScoped = mutation({
  args: {},
  handler: async (ctx) => {
    const session = await requireSession(ctx);
    const normalizedEmail = normalizeEmail(session.user.email);
    const domain = emailDomain(normalizedEmail);

    const mapping = await ctx.db
      .query("emailMappings")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    const customerIds = mapping?.customerIds ?? [];

    if (mapping) {
      await ctx.db.delete(mapping._id);
    }

    const appearancePref = await ctx.db
      .query("appearancePreferences")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (appearancePref) {
      await ctx.db.delete(appearancePref._id);
    }

    const userProfileById = await ctx.db
      .query("userProfiles")
      .withIndex("by_external_user_id", (q) => q.eq("externalUserId", session.user.id))
      .first();
    if (userProfileById) {
      await ctx.db.delete(userProfileById._id);
    } else {
      const userProfileByEmail = await ctx.db
        .query("userProfiles")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first();
      if (userProfileByEmail) {
        await ctx.db.delete(userProfileByEmail._id);
      }
    }

    const userNotificationPrefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_email_customer", (q) => q.eq("email", normalizedEmail))
      .collect();
    for (const pref of userNotificationPrefs) {
      await ctx.db.delete(pref._id);
    }

    const cursors = await ctx.db
      .query("notificationCursors")
      .withIndex("by_token_identifier_customer", (q) => q.eq("tokenIdentifier", session.tokenIdentifier))
      .collect();
    for (const cursor of cursors) {
      await ctx.db.delete(cursor._id);
    }

    let organizationDeleted = false;
    if (domain && customerIds.length > 0) {
      const allMappings = await ctx.db
        .query("emailMappings")
        .withIndex("by_domain", (q) => q.eq("emailDomain", domain))
        .collect();
      const hasOtherAccountSameDomain = allMappings.some((entry) => {
        if (entry.email === normalizedEmail) return false;
        return entry.emailDomain === domain;
      });

      if (!hasOtherAccountSameDomain) {
        organizationDeleted = true;
        for (const customerId of customerIds) {
          await deleteCustomerProjectionData(ctx, customerId);
        }

        // Remove any remaining mappings pointing to deleted customers.
        const affectedEmails = await Promise.all(
          customerIds.map(async (customerId) => {
            const rows = await ctx.db
              .query("customerEmailMappings")
              .withIndex("by_customer_email", (q) => q.eq("customerExternalId", customerId))
              .collect();
            return rows.map((row) => row.email);
          }),
        );
        const uniqueEmails = Array.from(new Set(affectedEmails.flat()));
        for (const email of uniqueEmails) {
          const entry = await ctx.db.query("emailMappings").withIndex("by_email", (q) => q.eq("email", email)).first();
          if (entry && entry.customerIds.some((customerId) => customerIds.includes(customerId))) {
            await ctx.db.delete(entry._id);
          }
          const reverseRows = await ctx.db
            .query("customerEmailMappings")
            .withIndex("by_email_customer", (q) => q.eq("email", email))
            .collect();
          for (const reverseRow of reverseRows) {
            if (customerIds.includes(reverseRow.customerExternalId)) {
              await ctx.db.delete(reverseRow._id);
            }
          }
        }
      }
    }

    return { ok: true as const, organizationDeleted };
  },
});
