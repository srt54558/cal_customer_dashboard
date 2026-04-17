/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
const LINEAR_API_URL = "https://api.linear.app/graphql";

type Customer = {
  id: string;
  slug: string;
  name: string;
  domains: string[];
  logoUrl?: string | null;
  revenue?: number | null;
  size?: number | null;
};

type Issue = {
  id: string;
  customerId: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  priorityLabel: string;
  state: { id: string; name: string; color: string; type: string };
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: Array<{ id: string; name: string; color: string }>;
  assignee?: { id: string; name: string; avatarUrl?: string };
  attachments?: Array<{ id: string; title: string; url: string; subtitle?: string }>;
  reactions?: Array<{ emoji: string; count: number }>;
};

type Comment = {
  id: string;
  issueId: string;
  parentId?: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  user: { id: string; name: string; avatarUrl?: string };
  reactions?: Array<{ emoji: string; count: number }>;
};

async function linearQuery(query: string, variables?: Record<string, unknown>) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_NOT_CONFIGURED");

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINEAR_HTTP_${response.status}: ${body.slice(0, 500)}`);
  }
  const json = await response.json();
  if (json.errors?.length) throw new Error(json.errors[0].message || "LINEAR_GRAPHQL_ERROR");
  if (!json.data) throw new Error("LINEAR_EMPTY");
  return json.data;
}

function slugifyCustomer(customerName: string, domains: string[]): string {
  const domain = domains[0]?.trim().toLowerCase();
  if (domain) {
    return domain.replace(/^www\./, "").replace(/\..*$/, "");
  }

  return customerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toCustomer(node: any): Customer {
  return {
    id: node.id,
    slug: slugifyCustomer(node.name, node.domains ?? []),
    name: node.name,
    domains: node.domains ?? [],
    logoUrl: node.logoUrl ?? null,
    revenue: node.revenue ?? null,
    size: node.size ?? null,
  };
}

function toIssue(node: any, customerId: string): Issue {
  return {
    id: node.id,
    customerId,
    identifier: node.identifier,
    title: node.title,
    description: node.description || undefined,
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    state: node.state,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    url: node.url,
    labels: node.labels?.nodes ?? [],
    assignee: node.assignee ?? undefined,
    attachments: [],
    reactions: summarizeReactions(node.reactions),
  };
}

function stripAuthorPrefix(body: string): string {
  return body.replace(/^\[from:[^\]]+\]\s*\n?/i, "").trim();
}

function summarizeReactions(reactions: any): Array<{ emoji: string; count: number }> {
  const source = Array.isArray(reactions)
    ? reactions
    : Array.isArray(reactions?.nodes)
    ? reactions.nodes
    : [];
  const reactionCounts = new Map<string, number>();
  for (const reaction of source) {
    const emoji = typeof reaction?.emoji === "string" ? reaction.emoji.trim() : "";
    if (!emoji) continue;
    const count = typeof reaction?.count === "number"
      ? reaction.count
      : Array.isArray(reaction?.users?.nodes)
      ? reaction.users.nodes.length
      : 1;
    reactionCounts.set(emoji, (reactionCounts.get(emoji) ?? 0) + count);
  }
  return Array.from(reactionCounts.entries()).map(([emoji, count]) => ({ emoji, count }));
}

function toComment(node: any, issueId: string): Comment {
  return {
    id: node.id,
    issueId,
    parentId: node.parent?.id || undefined,
    body: stripAuthorPrefix(node.body),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    user: {
      id: node.user?.id || "unknown",
      name: node.user?.name || "Unknown",
      avatarUrl: node.user?.avatarUrl ?? undefined,
    },
    reactions: summarizeReactions(node.reactions),
  };
}

function toAttachments(node: any): Array<{ id: string; title: string; url: string; subtitle?: string }> {
  return (node?.attachments?.nodes ?? [])
    .map((attachment: any) => {
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
    .filter((attachment: any) => Boolean(attachment));
}

function toStatusChangeComment(node: any, issueId: string): Comment | null {
  const fromStateName = node.fromState?.name?.trim();
  const toStateName = node.toState?.name?.trim();
  if (!fromStateName || !toStateName || fromStateName === toStateName) return null;

  return {
    id: `status-${node.id}`,
    issueId,
    body: `Status changed from ${fromStateName} to ${toStateName}`,
    createdAt: node.createdAt,
    updatedAt: node.createdAt,
    user: {
      id: node.actor?.id || "unknown",
      name: node.actor?.name || "Linear",
      avatarUrl: node.actor?.avatarUrl ?? undefined,
    },
  };
}

function mergeActivityComments(comments: Comment[], statusComments: Comment[]): Comment[] {
  const seen = new Set(comments.map((comment) => `${comment.createdAt}|${comment.body.trim().toLowerCase()}`));
  const merged = [...comments];
  for (const statusComment of statusComments) {
    const key = `${statusComment.createdAt}|${statusComment.body.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(statusComment);
  }
  return merged;
}

export async function fetchCustomersFromLinear(): Promise<Customer[]> {
  const query = `
    query Customers {
      customers {
        nodes {
          id
          name
          domains
          logoUrl
          revenue
          size
        }
      }
    }
  `;

  const data = await linearQuery(query);
  return (data.customers?.nodes ?? []).map(toCustomer);
}

export async function fetchProjectionForCustomer(customerId: string): Promise<{ issues: Issue[]; commentsByIssueId: Record<string, Comment[]> }> {
  const query = `
    query CustomerNeedsLite($customerId: ID!) {
      customerNeeds(filter: { customer: { id: { eq: $customerId } } }) {
        nodes {
          issue {
            id
            identifier
            title
            description
            priority
            priorityLabel
            url
            createdAt
            updatedAt
            state {
              id
              name
              color
              type
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
            assignee {
              id
              name
              avatarUrl
            }
          }
        }
      }
    }
  `;

  const data = await linearQuery(query, { customerId });
  const issuesById = new Map<string, Issue>();
  const commentsByIssueId: Record<string, Comment[]> = {};

  for (const node of data.customerNeeds?.nodes ?? []) {
    const issue = node.issue;
    if (!issue) continue;

    issuesById.set(issue.id, toIssue(issue, customerId));
    commentsByIssueId[issue.id] = [];
  }

  const activityQuery = `
    query IssueActivity($issueId: String!) {
      issue(id: $issueId) {
        id
        reactions {
          emoji
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
            parent { id }
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
            }
          }
        }
        history {
          nodes {
            id
            createdAt
            actor {
              id
              name
              avatarUrl
            }
            fromState { name }
            toState { name }
          }
        }
      }
    }
  `;

  for (const issue of issuesById.values()) {
    try {
      const activity = await linearQuery(activityQuery, { issueId: issue.id });
      const issueData = activity.issue;
      const normalComments = (issueData?.comments?.nodes ?? []).map((comment: any) => toComment(comment, issue.id));
      const statusComments = (issueData?.history?.nodes ?? [])
        .map((entry: any) => toStatusChangeComment(entry, issue.id))
        .filter((entry: Comment | null): entry is Comment => Boolean(entry));

      commentsByIssueId[issue.id] = mergeActivityComments(normalComments, statusComments);
      const attachments = toAttachments(issueData);
      issuesById.set(issue.id, {
        ...issue,
        attachments: attachments.length > 0 ? attachments : issue.attachments,
        reactions: summarizeReactions(issueData?.reactions),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      throw new Error(`LINEAR_ACTIVITY_SYNC_FAILED_${issue.id}: ${message}`);
    }
  }

  return {
    issues: Array.from(issuesById.values()),
    commentsByIssueId,
  };
}

export function collectCustomerIdsFromWebhookPayload(input: unknown): Set<string> {
  const customerIds = new Set<string>();

  function walk(value: unknown): void {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    const record = value as Record<string, unknown>;
    const directId = record.customerId;
    if (typeof directId === "string" && directId.trim()) {
      customerIds.add(directId);
    }

    const customer = record.customer;
    if (customer && typeof customer === "object") {
      const customerRecord = customer as Record<string, unknown>;
      const customerId = customerRecord.id;
      if (typeof customerId === "string" && customerId.trim()) {
        customerIds.add(customerId);
      }
    }

    for (const nested of Object.values(record)) {
      walk(nested);
    }
  }

  walk(input);
  return customerIds;
}
