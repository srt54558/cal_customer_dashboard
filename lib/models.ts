import { z } from "zod"

export const RoleSchema = z.enum(["employee", "customer_user"])
export type Role = z.infer<typeof RoleSchema>

export const AccessDeniedReasonSchema = z.enum([
  "BLACKLISTED_EMAIL_DOMAIN",
  "NO_CUSTOMER_MAPPING",
])
export type AccessDeniedReason = z.infer<typeof AccessDeniedReasonSchema>

export const SafeUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
})

export const SessionSchema = z.object({
  user: SafeUserSchema,
  role: RoleSchema,
  customerIds: z.array(z.string()),
  accessDeniedReason: AccessDeniedReasonSchema.optional(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
})
export type Session = z.infer<typeof SessionSchema>

export const CustomerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  logoUrl: z.string().nullable().optional(),
  revenue: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
})
export type Customer = z.infer<typeof CustomerSchema>

export const IssueStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  type: z.string(),
})

export const LabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

export const AssigneeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().optional(),
  })
  .optional()

export const CommentSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  parentId: z.string().optional(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().optional(),
  }),
  reactions: z
    .array(
      z.object({
        emoji: z.string(),
        count: z.number(),
      }),
    )
    .optional(),
})
export type Comment = z.infer<typeof CommentSchema>

export const IssueAttachmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  subtitle: z.string().optional(),
})
export type IssueAttachment = z.infer<typeof IssueAttachmentSchema>

export const IssueSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.number(),
  priorityLabel: z.string(),
  state: IssueStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  labels: z.array(LabelSchema),
  assignee: AssigneeSchema,
  attachments: z.array(IssueAttachmentSchema).optional(),
  reactions: z
    .array(
      z.object({
        emoji: z.string(),
        count: z.number(),
      }),
    )
    .optional(),
})
export type Issue = z.infer<typeof IssueSchema>

export const CustomerProjectionSchema = z.object({
  customer: CustomerSchema,
  issues: z.array(IssueSchema),
  commentsByIssueId: z.record(z.array(CommentSchema)),
  syncedAt: z.number(),
})
export type CustomerProjection = z.infer<typeof CustomerProjectionSchema>

export const SourceSchema = z.enum(["convex", "linear_fallback"])
export type DataSource = z.infer<typeof SourceSchema>

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "MAPPING_MISSING"
  | "UPSTREAM_FAILED"
  | "DATA_CORRUPT"

export function slugifyCustomer(customerName: string, domains: string[]): string {
  const domain = domains[0]?.trim().toLowerCase()
  if (domain) {
    return domain.replace(/^www\./, "").replace(/\..*$/, "")
  }

  return customerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
