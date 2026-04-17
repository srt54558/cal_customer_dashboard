/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { requireSession } from "./lib/session";

type LinearResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

function withAuthorPrefix(body: string, name: string): string {
  const trimmed = body.trim();
  if (/^\[from:/i.test(trimmed)) return trimmed;
  return `[from: ${name}]\n${trimmed}`;
}

function stripAuthorPrefix(body: string): string {
  return body.replace(/^\[from:[^\]]+\]\s*\n?/i, "").trim();
}

function summarizeReactions(
  reactions:
    | Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
    | { nodes?: Array<{ emoji?: string; count?: number; users?: { nodes?: Array<{ id: string }> } }> }
    | undefined,
): Array<{ emoji: string; count: number }> {
  const source = Array.isArray(reactions)
    ? reactions
    : Array.isArray(reactions?.nodes)
      ? reactions.nodes
      : [];
  const counts = new Map<string, number>();
  for (const reaction of source) {
    const emoji = reaction?.emoji?.trim();
    if (!emoji) continue;
    const count = "count" in reaction && typeof reaction.count === "number"
      ? reaction.count
      : "users" in reaction && Array.isArray(reaction.users?.nodes)
        ? reaction.users.nodes.length
        : 1;
    counts.set(emoji, (counts.get(emoji) ?? 0) + count);
  }
  return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
}

function normalizeAttachments(attachments?: Array<{ url: string; title: string; subtitle?: string }>) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((attachment) => ({
      url: typeof attachment?.url === "string" ? attachment.url.trim() : "",
      title: typeof attachment?.title === "string" ? attachment.title.trim() : "",
      subtitle: typeof attachment?.subtitle === "string" ? attachment.subtitle.trim() : "",
    }))
    .filter((attachment) => attachment.url.length > 0 && attachment.title.length > 0)
    .map((attachment) => ({
      url: attachment.url,
      title: attachment.title,
      subtitle: attachment.subtitle || undefined,
    }));
}

function appendAttachmentsToBody(body: string, attachments: Array<{ url: string; title: string }>): string {
  if (attachments.length === 0) return body.trim();
  const links = attachments.map((attachment) => `- [${attachment.title}](${attachment.url})`).join("\n");
  return `${body.trim()}\n\nAttachments:\n${links}`;
}

async function linearRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_NOT_CONFIGURED");
  }

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINEAR_HTTP_${response.status}: ${body.slice(0, 500)}`);
  }

  const json: LinearResponse<T> = await response.json();
  if (json.errors?.length) {
    throw new Error(`LINEAR_HTTP_400: ${JSON.stringify({ errors: json.errors })}`);
  }
  if (!json.data) {
    throw new Error("LINEAR_EMPTY");
  }

  return json.data;
}

async function refreshIssueProjection(
  ctx: {
    runMutation: (functionReference: unknown, args: unknown) => Promise<unknown>;
  },
  issueId: string,
  issueIdentifier: string,
  fallbackComments: Array<{
    id: string;
    issueId: string;
    parentId?: string;
    body: string;
    createdAt: string;
    updatedAt?: string;
    user: { id: string; name: string; avatarUrl?: string };
    reactions?: Array<{ emoji: string; count: number }>;
  }>,
) {
  const issueQuery = `
    query IssueById($issueId: String!) {
      issue(id: $issueId) {
        id
        reactions {
          emoji
          user {
            id
          }
          externalUser {
            id
          }
        }
        attachments {
          nodes {
            id
            title
            subtitle
            url
          }
        }
        comments {
          nodes {
            id
            parent {
              id
            }
            body
            createdAt
            updatedAt
            user {
              id
              name
              avatarUrl
            }
            reactions {
              emoji
              user {
                id
              }
              externalUser {
                id
              }
            }
          }
        }
      }
    }
  `;

  const refreshed = await linearRequest<{
    issue: {
      id: string;
      reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>;
      attachments?: {
        nodes?: Array<{
          id?: string;
          title?: string;
          subtitle?: string;
          url?: string;
        }>;
      };
      comments?: {
        nodes?: Array<{
          id: string;
          parent?: { id: string };
          body: string;
          createdAt: string;
          updatedAt?: string;
          user?: { id: string; name: string; avatarUrl?: string };
          reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>;
        }>;
      };
    } | null;
  }>(issueQuery, { issueId });

  const comments = (refreshed.issue?.comments?.nodes ?? []).map((comment) => ({
    id: comment.id,
    issueId: refreshed.issue?.id ?? issueId,
    parentId: comment.parent?.id,
    body: stripAuthorPrefix(comment.body),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    user: {
      id: comment.user?.id ?? "unknown",
      name: comment.user?.name ?? "Unknown",
      avatarUrl: comment.user?.avatarUrl ?? undefined,
    },
    reactions: summarizeReactions(comment.reactions),
  }));

  const attachments = (refreshed.issue?.attachments?.nodes ?? [])
    .map((attachment) => {
      const id = typeof attachment?.id === "string" ? attachment.id.trim() : "";
      const title = typeof attachment?.title === "string" ? attachment.title.trim() : "";
      const url = typeof attachment?.url === "string" ? attachment.url : "";
      if (!id || !title || !url) return null;
      return {
        id,
        title,
        url,
        subtitle: typeof attachment?.subtitle === "string" ? attachment.subtitle : undefined,
      };
    })
    .filter((attachment): attachment is { id: string; title: string; url: string; subtitle?: string } => Boolean(attachment));

  const issueReactions = summarizeReactions(refreshed.issue?.reactions);

  if (comments.length === 0) {
    await ctx.runMutation(api.portal.replaceIssueCommentsScoped, {
      issueId,
      comments: fallbackComments,
    });
  } else {
    await ctx.runMutation(api.portal.replaceIssueCommentsScoped, {
      issueId,
      comments,
    });
  }

  await ctx.runMutation(api.portal.patchIssueActivityScoped, {
    issueId,
    attachments,
    reactions: issueReactions,
  });

  return {
    ok: true as const,
    source: "linear_fallback" as const,
    issueIdentifier,
  };
}

export const createScoped = action({
  args: {
    issueIdentifier: v.string(),
    body: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          url: v.string(),
          title: v.string(),
          subtitle: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx);

    const issueResult = (await ctx.runQuery(api.portal.getIssueByIdentifierScoped, {
      identifier: args.issueIdentifier,
    })) as {
      issue: { id: string; identifier: string } | null;
      comments?: Array<{
        id: string;
        issueId: string;
        parentId?: string;
        body: string;
        createdAt: string;
        updatedAt?: string;
        user: { id: string; name: string; avatarUrl?: string };
        reactions?: Array<{ emoji: string; count: number }>;
      }>;
      errorCode?: string;
    };

    if (!issueResult.issue) {
      return {
        ok: false,
        source: "linear_fallback" as const,
        errorCode: issueResult.errorCode ?? "UPSTREAM_FAILED",
      };
    }

    const normalizedAttachments = normalizeAttachments(args.attachments);
    const fullBody = appendAttachmentsToBody(args.body, normalizedAttachments);

    const createMutation = `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
          }
        }
      }
    `;

    const created = await linearRequest<{
      commentCreate?: {
        success?: boolean;
        comment?: { id?: string };
      };
    }>(createMutation, {
      input: {
        issueId: issueResult.issue.id,
        body: withAuthorPrefix(fullBody, session.user.name),
      },
    });

    const createdCommentId = created.commentCreate?.comment?.id;
    if (!createdCommentId) {
      return { ok: false, source: "linear_fallback" as const, errorCode: "UPSTREAM_FAILED" as const };
    }

    if (normalizedAttachments.length > 0) {
      const attachmentMutation = `
        mutation CreateAttachment($input: AttachmentCreateInput!) {
          attachmentCreate(input: $input) {
            success
            attachment {
              id
            }
          }
        }
      `;

      for (const attachment of normalizedAttachments) {
        await linearRequest<{
          attachmentCreate?: {
            success?: boolean;
            attachment?: { id?: string };
          };
        }>(attachmentMutation, {
          input: {
            issueId: issueResult.issue.id,
            title: attachment.title,
            url: attachment.url,
            subtitle: attachment.subtitle,
          },
        });
      }
    }

    await ctx.runMutation(api.portal.upsertCommentAuthorScoped, {
      issueId: issueResult.issue.id,
      commentId: createdCommentId,
      user: {
        id: session.user.id,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
        email: session.user.email,
      },
    });

    const previousComments = Array.isArray(issueResult.comments) ? issueResult.comments : [];
    const fallbackComment = {
      id: createdCommentId,
      issueId: issueResult.issue.id,
      parentId: undefined,
      body: stripAuthorPrefix(fullBody),
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      user: {
        id: session.user.id,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
      },
      reactions: [],
    };
    const mergedById = new Map<string, (typeof previousComments)[number]>();
    for (const comment of previousComments) {
      mergedById.set(comment.id, comment);
    }
    mergedById.set(fallbackComment.id, fallbackComment);

    return refreshIssueProjection(ctx, issueResult.issue.id, issueResult.issue.identifier, Array.from(mergedById.values()));
  },
});

export const reactScoped = action({
  args: {
    issueIdentifier: v.string(),
    emoji: v.string(),
    commentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const issueResult = (await ctx.runQuery(api.portal.getIssueByIdentifierScoped, {
      identifier: args.issueIdentifier,
    })) as {
      issue: { id: string; identifier: string } | null;
      comments?: Array<{
        id: string;
      }>;
      errorCode?: string;
    };

    if (!issueResult.issue) {
      return {
        ok: false,
        source: "linear_fallback" as const,
        errorCode: issueResult.errorCode ?? "UPSTREAM_FAILED",
      };
    }

    const emoji = args.emoji.trim();
    if (!emoji) {
      return { ok: false, source: "linear_fallback" as const, errorCode: "UPSTREAM_FAILED" as const };
    }

    if (args.commentId) {
      const targetComment = (issueResult.comments ?? []).find((comment) => comment.id === args.commentId);
      if (!targetComment) {
        return { ok: false, source: "linear_fallback" as const, errorCode: "UPSTREAM_FAILED" as const };
      }
    }

    const reactionMutation = `
      mutation CreateReaction($input: ReactionCreateInput!) {
        reactionCreate(input: $input) {
          success
          reaction {
            id
          }
        }
      }
    `;

    try {
      await linearRequest<{
        reactionCreate?: {
          success?: boolean;
          reaction?: { id?: string };
        };
      }>(reactionMutation, {
        input: args.commentId
          ? {
              commentId: args.commentId,
              emoji,
            }
          : {
              issueId: issueResult.issue.id,
              emoji,
            },
      });
    } catch (error) {
      // If it still fails with "already exists", we just ignore it as success
      if (error instanceof Error && error.message.includes("already exists")) {
        return refreshIssueProjection(ctx, issueResult.issue.id, issueResult.issue.identifier, issueResult.comments ?? []);
      }
      throw error;
    }

    return refreshIssueProjection(ctx, issueResult.issue.id, issueResult.issue.identifier, issueResult.comments ?? []);
  },
});
