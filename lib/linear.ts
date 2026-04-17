import { env, requireEnv } from "@/lib/env"
import { slugifyCustomer, type Comment, type Customer, type Issue, type IssueAttachment } from "@/lib/models"

const LINEAR_API_URL = "https://api.linear.app/graphql"

type GraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message: string }>
}

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = requireEnv("LINEAR_API_KEY")

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
  }

  const json: GraphqlResponse<T> = await response.json()
  if (json.errors?.length) {
    throw new Error(json.errors[0].message)
  }

  if (!json.data) {
    throw new Error("Linear API returned empty data")
  }

  return json.data
}

function toCustomer(node: {
  id: string
  name: string
  domains: string[]
  logoUrl?: string | null
  revenue?: number | null
  size?: number | null
}): Customer {
  return {
    id: node.id,
    slug: slugifyCustomer(node.name, node.domains),
    name: node.name,
    domains: node.domains ?? [],
    logoUrl: node.logoUrl ?? undefined,
    revenue: node.revenue ?? null,
    size: node.size ?? null,
  }
}

function toIssue(node: {
  id: string
  identifier: string
  title: string
  description?: string
  priority: number
  priorityLabel: string
  url: string
  createdAt: string
  updatedAt: string
  state: { id: string; name: string; color: string; type: string }
  labels?: { nodes?: Array<{ id: string; name: string; color: string }> }
  assignee?: { id: string; name: string; avatarUrl?: string }
  reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
}, customerId: string, attachments?: IssueAttachment[]): Issue {
  return {
    id: node.id,
    customerId,
    identifier: node.identifier,
    title: node.title,
    description: node.description || undefined,
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    state: node.state,
    labels: node.labels?.nodes ?? [],
    assignee: node.assignee ?? undefined,
    attachments: attachments ?? [],
    reactions: summarizeReactions(node.reactions),
  }
}

function stripAuthorPrefix(body: string): string {
  return body.replace(/^\[from:[^\]]+\]\s*\n?/i, "").trim()
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
      : []
  const reactionCounts = new Map<string, number>()
  for (const reaction of source) {
    const emoji = reaction?.emoji?.trim()
    if (!emoji) continue
    const resolvedCount = "count" in reaction && typeof reaction.count === "number"
      ? reaction.count
      : "users" in reaction && Array.isArray(reaction.users?.nodes)
        ? reaction.users.nodes.length
        : 1
    reactionCounts.set(emoji, (reactionCounts.get(emoji) ?? 0) + resolvedCount)
  }
  return Array.from(reactionCounts.entries()).map(([emoji, count]) => ({ emoji, count }))
}

function toComment(node: {
  id: string
  body: string
  createdAt: string
  updatedAt?: string
  parent?: { id: string }
  user?: { id: string; name: string; avatarUrl?: string }
  reactions?:
    | Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
    | {
      nodes?: Array<{
        emoji?: string
        count?: number
        users?: { nodes?: Array<{ id: string }> }
      }>
    }
}, issueId: string): Comment {
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
  }
}

function toAttachments(node: { attachments?: { nodes?: Array<{ id?: string; title?: string; subtitle?: string | null; url?: string }> } }): IssueAttachment[] {
  const attachments: IssueAttachment[] = []
  for (const attachment of node.attachments?.nodes ?? []) {
    const url = attachment.url
    const title = attachment.title?.trim()
    const id = attachment.id?.trim()
    if (!url || !title || !id) continue
    attachments.push({
      id,
      title,
      url,
      subtitle: attachment.subtitle ?? undefined,
    })
  }
  return attachments
}

function toStatusChangeComment(node: {
  id: string
  createdAt: string
  actor?: { id: string; name: string; avatarUrl?: string }
  fromState?: { name: string }
  toState?: { name: string }
}, issueId: string): Comment | null {
  const fromStateName = node.fromState?.name?.trim()
  const toStateName = node.toState?.name?.trim()
  if (!fromStateName || !toStateName || fromStateName === toStateName) {
    return null
  }

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
  }
}

function mergeActivityComments(comments: Comment[], statusComments: Comment[]): Comment[] {
  const seen = new Set(comments.map((comment) => `${comment.createdAt}|${comment.body.trim().toLowerCase()}`))
  const merged = [...comments]
  for (const statusComment of statusComments) {
    const key = `${statusComment.createdAt}|${statusComment.body.trim().toLowerCase()}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(statusComment)
  }
  return merged
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
  `

  const data = await linearQuery<{ customers: { nodes: Array<{ id: string; name: string; domains: string[]; logoUrl?: string | null; revenue?: number | null; size?: number | null }> } }>(query)
  return data.customers.nodes.map(toCustomer)
}

export async function fetchCustomerByDomainFromLinear(domain: string): Promise<Customer | null> {
  const customers = await fetchCustomersFromLinear()
  const normalized = domain.toLowerCase().trim()
  return (
    customers.find((customer) =>
      customer.domains.some((candidate) => candidate.toLowerCase().trim() === normalized)
    ) ?? null
  )
}

export async function fetchIssuesAndCommentsForCustomerFromLinear(customerId: string): Promise<{
  issues: Issue[]
  commentsByIssueId: Record<string, Comment[]>
}> {
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
  `

  const data = await linearQuery<{
    customerNeeds: {
      nodes: Array<{
        issue?: {
          id: string
          identifier: string
          title: string
          description?: string
          priority: number
          priorityLabel: string
          url: string
          createdAt: string
          updatedAt: string
          state: { id: string; name: string; color: string; type: string }
          labels?: { nodes?: Array<{ id: string; name: string; color: string }> }
          assignee?: { id: string; name: string; avatarUrl?: string }
        }
      }>
    }
  }>(query, { customerId })

  const issuesById = new Map<string, Issue>()
  const commentsByIssueId: Record<string, Comment[]> = {}

  for (const node of data.customerNeeds.nodes) {
    const issue = node.issue
    if (!issue) {
      continue
    }

    issuesById.set(issue.id, toIssue(issue, customerId))
    commentsByIssueId[issue.id] = []
  }

  const activityQuery = `
    query IssueActivity($issueId: String!) {
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
        history {
          nodes {
            id
            createdAt
            actor {
              id
              name
              avatarUrl
            }
            fromState {
              name
            }
            toState {
              name
            }
          }
        }
      }
    }
  `

  for (const issue of issuesById.values()) {
    try {
      const activity = await linearQuery<{
        issue?: {
          reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
          attachments?: {
            nodes?: Array<{
              id?: string
              title?: string
              subtitle?: string | null
              url?: string
            }>
          }
          comments?: {
            nodes?: Array<{
              id: string
              parent?: { id: string }
              body: string
              createdAt: string
              updatedAt?: string
              user?: { id: string; name: string; avatarUrl?: string }
              reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
            }>
          }
          history?: {
            nodes?: Array<{
              id: string
              createdAt: string
              actor?: { id: string; name: string; avatarUrl?: string }
              fromState?: { name: string }
              toState?: { name: string }
            }>
          }
        }
      }>(activityQuery, { issueId: issue.id })

      const normalComments = (activity.issue?.comments?.nodes ?? []).map((comment) => toComment(comment, issue.id))
      const statusComments = (activity.issue?.history?.nodes ?? [])
        .map((entry) => toStatusChangeComment(entry, issue.id))
        .filter((entry): entry is Comment => Boolean(entry))
      commentsByIssueId[issue.id] = mergeActivityComments(normalComments, statusComments)

      const attachments = toAttachments(activity.issue ?? {})
      if (attachments.length > 0) {
        issuesById.set(issue.id, { ...issue, attachments, reactions: summarizeReactions(activity.issue?.reactions) })
        continue
      }
      issuesById.set(issue.id, { ...issue, reactions: summarizeReactions(activity.issue?.reactions) })
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown"
      throw new Error(`LINEAR_ACTIVITY_SYNC_FAILED_${issue.id}: ${message}`)
    }
  }

  return {
    issues: Array.from(issuesById.values()),
    commentsByIssueId,
  }
}

export async function fetchIssueByIdentifierFromLinear(identifier: string): Promise<{
  issue: Issue
  comments: Comment[]
} | null> {
  const query = `
    query IssueByIdentifier($identifier: String!) {
      issues(filter: { identifier: { eq: $identifier } }) {
        nodes {
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
          customerNeeds {
            nodes {
              customer {
                id
              }
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
          history {
            nodes {
              id
              createdAt
              actor {
                id
                name
                avatarUrl
              }
              fromState {
                name
              }
              toState {
                name
              }
            }
          }
        }
      }
    }
  `

  try {
    const data = await linearQuery<{
      issues: {
        nodes: Array<{
        id: string
        identifier: string
        title: string
        description?: string
        priority: number
        priorityLabel: string
        url: string
        createdAt: string
        updatedAt: string
        state: { id: string; name: string; color: string; type: string }
        labels?: { nodes?: Array<{ id: string; name: string; color: string }> }
        assignee?: { id: string; name: string; avatarUrl?: string }
        reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
        attachments?: {
          nodes?: Array<{
            id?: string
            title?: string
            subtitle?: string | null
            url?: string
          }>
        }
        customerNeeds?: { nodes?: Array<{ customer?: { id: string } }> }
        comments?: {
          nodes?: Array<{
            id: string
            parent?: { id: string }
            body: string
            createdAt: string
            updatedAt?: string
            user?: { id: string; name: string; avatarUrl?: string }
            reactions?: Array<{ emoji?: string; user?: { id: string } | null; externalUser?: { id: string } | null }>
          }>
        }
        history?: {
          nodes?: Array<{
            id: string
            createdAt: string
            actor?: { id: string; name: string; avatarUrl?: string }
            fromState?: { name: string }
            toState?: { name: string }
          }>
        }
      }>
      }
    }>(query, { identifier })

    const issue = data.issues.nodes[0]
    if (!issue) {
      return null
    }

    const customerId = issue.customerNeeds?.nodes?.[0]?.customer?.id
    if (!customerId) {
      return null
    }

    const normalComments = (issue.comments?.nodes ?? []).map((comment) => toComment(comment, issue.id))
    const statusComments = (issue.history?.nodes ?? [])
      .map((entry) => toStatusChangeComment(entry, issue.id))
      .filter((entry): entry is Comment => Boolean(entry))

    return {
      issue: toIssue(issue, customerId, toAttachments(issue)),
      comments: mergeActivityComments(normalComments, statusComments),
    }
  } catch {
    return null
  }
}

function withAuthorPrefix(body: string, authorName?: string): string {
  const trimmed = body.trim()
  if (!authorName) {
    return trimmed
  }
  if (/^\[from:/i.test(trimmed)) {
    return trimmed
  }
  return `[from: ${authorName}]\n${trimmed}`
}

export async function createCommentInLinear(issueId: string, body: string, authorName?: string): Promise<{ id: string }> {
  const mutation = `
    mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
        }
      }
    }
  `

  const data = await linearQuery<{
    commentCreate: {
      success: boolean
      comment?: { id: string }
    }
  }>(mutation, {
    input: {
      issueId,
      body: withAuthorPrefix(body, authorName),
    },
  })

  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new Error("Failed to create comment in Linear")
  }

  return { id: data.commentCreate.comment.id }
}

export const linearConfig = {
  apiUrl: LINEAR_API_URL,
  hasApiKey: Boolean(env.linearApiKey),
}
