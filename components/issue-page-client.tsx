"use client"

import type { ComponentType, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAction, useQuery } from "convex/react"
import { useTranslations } from "next-intl"
import { format, formatDistanceToNow } from "date-fns"
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  User,
  ChevronRight,
  CheckCircle2,
  Circle,
  XCircle,
  HelpCircle,
  Info,
  Smile,
  Plus,
  Paperclip,
} from "lucide-react"
import { api } from "../convex/_generated/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CommentComposer } from "@/components/comment-composer"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { getSessionQuerySnapshot, setSessionQuerySnapshot } from "@/lib/session-query-cache"
import type { Comment, Issue } from "@/lib/models"

const HAS_CONVEX = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
const REACTION_EMOJIS = ["👍", "❤️", "🎉", "👀", "🚀"]
const REACTION_ALIAS_TO_EMOJI: Record<string, string> = {
  "+1": "👍",
  thumbsup: "👍",
  thumbs_up: "👍",
  heart: "❤️",
  tada: "🎉",
  eyes: "👀",
  rocket: "🚀",
}

export type IssuePageResult = {
  issue: Issue | null
  comments: Comment[]
  source: "convex" | "linear_fallback"
  errorCode?: string
}

export function IssuePageClient({
  customerSlug,
  issueId,
  initialResult,
  preferConvex = HAS_CONVEX,
}: {
  customerSlug: string
  issueId: string
  initialResult?: IssuePageResult
  preferConvex?: boolean
}) {
  const t = useTranslations("IssuePage")
  if (!preferConvex) {
    if (!initialResult) {
      return <div className="p-4 text-sm text-muted-foreground">{t("issueDataUnavailable")}</div>
    }
    return <IssuePageContent customerSlug={customerSlug} result={initialResult} />
  }

  return <IssuePageWithConvex customerSlug={customerSlug} issueId={issueId} />
}

function IssuePageWithConvex({ customerSlug, issueId }: { customerSlug: string; issueId: string }) {
  const result = useQuery(api.portal.getIssueByIdentifierScoped, { identifier: issueId })
  const cacheKey = `issue:${issueId}`
  if (result !== undefined) {
    setSessionQuerySnapshot(cacheKey, result)
  }
  const cachedResult = getSessionQuerySnapshot<typeof result>(cacheKey)
  const currentResult = result ?? cachedResult

  if (!currentResult) {
    return <IssuePageSkeleton />
  }

  return <IssuePageContent customerSlug={customerSlug} result={currentResult as IssuePageResult} />
}

export function IssuePageSkeleton() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Skeleton className="h-9 w-36" />
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-8 w-3/4" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <Separator />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <div className="p-6 space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
            </div>
          </Card>
          <Card>
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-28 w-full" />
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <div className="p-5 space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-36" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function IssuePageContent({ customerSlug, result }: { customerSlug: string; result: IssuePageResult }) {
  const t = useTranslations("IssuePage")
  const reactToEntity = useAction(api.comments.reactScoped)
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  if (result.errorCode === "UNAUTHORIZED") {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p className="mb-2">{t("convexAuthMissing")}</p>
        <Link href="/api/auth/logout" className="underline">
          {t("signOutAndLoginAgain")}
        </Link>
      </div>
    )
  }

  if (result.errorCode === "FORBIDDEN") {
    return <div className="p-4 text-sm text-destructive">{t("forbidden")}</div>
  }

  if (!result.issue) {
    return <div className="p-4 text-sm text-muted-foreground">{t("issueNotFound")}</div>
  }

  const issue = result.issue
  const statusInfo = getStatusInfo(issue.state.type)
  const priorityInfo = getPriorityInfo(issue.priority)
  const threadedComments = buildCommentThreads(result.comments)
  const issueReactions = issue.reactions ?? []
  const sidebarAttachments = collectSidebarAttachments(issue.attachments, result.comments)

  const onReact = (emoji: string, commentId?: string) => {
    reactToEntity({
      issueIdentifier: issue.identifier,
      emoji,
      commentId,
    }).catch(console.error)
  }

  useEffect(() => {
    const titleNode = titleRef.current
    if (!titleNode || typeof window === "undefined") {
      return
    }

    const publishTitleVisibility = (visible: boolean) => {
      window.dispatchEvent(
        new CustomEvent("portal:issue-title-visibility", {
          detail: { visible },
        })
      )
    }

    publishTitleVisibility(true)

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        publishTitleVisibility(Boolean(entry?.isIntersecting))
      },
      {
        threshold: 0.01,
        rootMargin: "-72px 0px 0px 0px",
      }
    )

    observer.observe(titleNode)
    return () => {
      observer.disconnect()
      publishTitleVisibility(true)
    }
  }, [issue.identifier])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        <Link href={`/${customerSlug}`} className="hover:text-foreground transition-colors flex items-center gap-1.5">
          <ArrowLeft className="h-3 w-3" />
          {t("breadcrumbTickets")}
        </Link>
        <ChevronRight className="h-3 w-3 opacity-30" />
        <span className="font-mono text-muted-foreground/60">{issue.identifier}</span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex flex-col gap-4 max-w-3xl min-w-0">
            <h1 ref={titleRef} className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight font-heading">{issue.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusInfo.variant} className="font-bold uppercase tracking-wider gap-2 px-2.5 py-1">
                <statusInfo.icon className="h-3 w-3" />
                {issue.state.name}
              </Badge>
              <Badge variant={priorityInfo.variant} className="font-bold uppercase tracking-wider gap-2 px-2.5 py-1">
                <priorityInfo.icon className="h-3 w-3" />
                {issue.priorityLabel}
              </Badge>
              {issue.labels.map((label: { id: string; name: string }) => (
                <Badge key={label.id} variant="outline" className="font-bold uppercase tracking-wider text-muted-foreground px-2.5 py-1">
                  {label.name}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {issueReactions.map((reaction) => (
                <Badge 
                  key={`issue-reaction-${reaction.emoji}`} 
                  variant="outline"
                  className="gap-1.5 rounded-full px-2 py-1 text-xs"
                >
                  <span>{toDisplayEmoji(reaction.emoji)}</span>
                  <span>{reaction.count}</span>
                </Badge>
              ))}
              {HAS_CONVEX ? <ReactionPickerWithAction targetKey="issue" onReact={(emoji) => onReact(emoji)} /> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 mt-6">
          <div className="lg:col-span-8 flex flex-col gap-10">
            <section className="flex flex-col gap-4">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1 font-heading">{t("sections.description")}</h2>
              <Card className="p-6 sm:p-8 shadow-sm">
                {issue.description ? (
                  <div className="prose dark:prose-invert max-w-none prose-sm leading-relaxed text-foreground/80">
                    <pre className="whitespace-pre-wrap font-sans leading-relaxed text-sm sm:text-base">{issue.description}</pre>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">{t("noDescription")}</p>
                )}
              </Card>
            </section>

            <section className="flex flex-col gap-6">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground font-heading">{t("sections.activity")}</h2>
                <Badge variant="outline" size="sm" className="font-bold text-muted-foreground/50 rounded-full">
                  {result.comments.length}
                </Badge>
              </div>

              <div className="flex flex-col gap-8">
                <Card className="p-6 bg-muted/30 shadow-sm">
                  <CommentComposer issueIdentifier={issue.identifier} canComment />
                </Card>

                <div className="flex flex-col gap-8">
                  {threadedComments.length > 0 ? (
                    threadedComments.map((comment) => (
                      <ThreadedComment 
                        key={comment.id} 
                        issueIdentifier={issue.identifier} 
                        comment={comment} 
                        onReact={onReact}
                      />
                    ))
                  ) : (
                    <Card className="py-12 text-center border-dashed bg-muted/20">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">{t("noActivityYet")}</p>
                    </Card>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:col-span-4 flex flex-col gap-6">
            <Card className="p-6 sticky top-28 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-8 px-1 font-heading">{t("sections.details")}</h3>

              <div className="flex flex-col gap-8">
                <Property label={t("details.assignee")} icon={User}>
                  {issue.assignee ? (
                    <div className="flex items-center gap-3">
                      <Avatar className="h-7 w-7 border border-border">
                        <AvatarImage src={issue.assignee.avatarUrl} />
                        <AvatarFallback className="text-[9px] font-bold">
                          {issue.assignee.name.split(" ").map((n: string) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-bold text-foreground">{issue.assignee.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">{t("details.unassigned")}</span>
                  )}
                </Property>

                <Property label={t("details.created")} icon={Clock}>
                  <span className="text-sm font-bold text-foreground">{format(new Date(issue.createdAt), "MMM d, yyyy")}</span>
                </Property>

                <Property label={t("details.lastUpdated")} icon={Clock}>
                  <span className="text-sm font-bold text-foreground">{formatDistanceToNow(new Date(issue.updatedAt), { addSuffix: true })}</span>
                </Property>
              </div>
            </Card>

            {sidebarAttachments.length > 0 ? (
              <Card className="sticky top-[28rem] p-6 shadow-sm">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-5 px-1 font-heading">{t("sections.attachments")}</h3>
                <div className="flex flex-col gap-3">
                  {sidebarAttachments.map((attachment) => (
                    <div key={attachment.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{attachment.title}</p>
                          {attachment.subtitle ? (
                            <p className="truncate text-xs text-muted-foreground">{attachment.subtitle}</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary hover:underline"
                          >
                            {t("attachments.open")}
                          </a>
                          <a href={attachment.url} download className="font-semibold text-primary hover:underline">
                            {t("attachments.download")}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}

type ThreadedCommentNode = Comment & {
  replies: ThreadedCommentNode[]
}

function buildCommentThreads(comments: Comment[]): ThreadedCommentNode[] {
  const nodesById = new Map<string, ThreadedCommentNode>()
  for (const comment of comments) {
    nodesById.set(comment.id, { ...comment, replies: [] })
  }

  const roots: ThreadedCommentNode[] = []
  for (const node of nodesById.values()) {
    if (node.parentId && node.parentId !== node.id) {
      const parent = nodesById.get(node.parentId)
      if (parent) {
        parent.replies.push(node)
        continue
      }
    }
    roots.push(node)
  }

  roots.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const sortReplies = (node: ThreadedCommentNode): void => {
    node.replies.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    for (const reply of node.replies) {
      sortReplies(reply)
    }
  }

  for (const root of roots) {
    sortReplies(root)
  }

  return roots
}

function isStatusChangeComment(comment: Comment): boolean {
  const body = comment.body.toLowerCase()
  return (
    body.includes("changed status from") ||
    body.includes("set status to") ||
    body.includes("status changed from") ||
    comment.body.includes("→")
  )
}

function ThreadedComment({
  comment,
  issueIdentifier,
  onReact,
}: {
  comment: ThreadedCommentNode
  issueIdentifier: string
  onReact: (emoji: string, commentId?: string) => void
}) {
  const isStatusChange = isStatusChangeComment(comment)
  const parsedBody = parseCommentBody(comment.body)

  return (
    <div className="flex flex-col gap-4">
      {isStatusChange ? (
        <div className="flex items-center gap-3 py-1">
          <div className="h-px w-8 bg-border/80" />
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-foreground/80">
            <Info className="h-3 w-3" />
            {comment.body}
            <span className="opacity-70">•</span>
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </div>
          <div className="h-px flex-1 bg-border/80" />
        </div>
      ) : (
        <div className="flex gap-4">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarImage src={comment.user.avatarUrl} />
            <AvatarFallback className="text-[10px] font-bold">
              {comment.user.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{comment.user.name}</span>
              <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
            </div>
            <Card className="px-4 py-3 shadow-sm">
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                <MarkdownText text={parsedBody.text} />
              </div>
            </Card>
            {parsedBody.attachments.length > 0 ? (
              <div className="flex flex-col gap-2">
                {parsedBody.attachments.map((attachment) => (
                  <Card key={`${comment.id}-${attachment.url}`} className="px-3 py-2">
                    {attachment.kind === "image" ? (
                      <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={attachment.url}
                          alt={attachment.title}
                          className="mb-2 max-h-72 w-full rounded-md border border-border object-contain bg-muted/20"
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="truncate">{attachment.title}</span>
                        </div>
                      </a>
                    ) : (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{attachment.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{attachment.url}</div>
                        </div>
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </a>
                    )}
                  </Card>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              {comment.reactions && comment.reactions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {comment.reactions.map((reaction) => (
                    <Badge 
                      key={`${comment.id}-${reaction.emoji}`} 
                      variant="outline"
                      className="gap-1.5 rounded-full px-2 py-1 text-xs"
                    >
                      <span>{toDisplayEmoji(reaction.emoji)}</span>
                      <span>{reaction.count}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <div />
              )}
              {HAS_CONVEX ? <ReactionPickerWithAction targetKey={comment.id} onReact={(emoji) => onReact(emoji, comment.id)} /> : null}
            </div>
          </div>
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="ml-12 flex flex-col gap-4 border-l border-border pl-4">
          {comment.replies.map((reply) => (
            <ThreadedComment 
              key={reply.id} 
              issueIdentifier={issueIdentifier} 
              comment={reply} 
              onReact={onReact}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReactionPickerWithAction({
  targetKey,
  onReact,
}: {
  targetKey: string
  onReact: (emoji: string) => void
}) {
  const [open, setOpen] = useState(false)

  const handleReact = (emoji: string) => {
    onReact(emoji)
    setOpen(false)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 rounded-full px-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Smile className="h-4 w-4" />
        <Plus className="h-3 w-3 -ml-1" />
      </Button>
      {open ? (
        <>
          <div className="absolute left-0 top-7 z-[9] h-3 w-52" />
          <div className="absolute left-0 top-8 z-10 flex items-center gap-1 rounded-full border border-border bg-background p-1 shadow-md animate-in fade-in zoom-in-95 duration-100 origin-top-left">
          {REACTION_EMOJIS.map((emoji) => (
            <Button
              key={`${targetKey}-${emoji}`}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2 text-xs hover:bg-muted"
              onClick={() => handleReact(emoji)}
            >
              {emoji}
            </Button>
          ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function toDisplayEmoji(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return value
  return REACTION_ALIAS_TO_EMOJI[trimmed.toLowerCase()] ?? trimmed
}

type ParsedAttachment = {
  title: string
  url: string
  kind: "image" | "file"
}

type SidebarAttachment = ParsedAttachment & {
  id: string
  subtitle?: string
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url) || url.includes("uploads.linear.app")
}

function parseCommentBody(body: string): { text: string; attachments: ParsedAttachment[] } {
  const attachments: ParsedAttachment[] = []
  let text = body

  const imageMarkdownRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  text = text.replace(imageMarkdownRegex, (_match, alt: string, url: string) => {
    attachments.push({
      title: alt?.trim() || "Image",
      url,
      kind: "image",
    })
    return ""
  })

  const listAttachmentRegex = /^\s*-\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/gm
  text = text.replace(listAttachmentRegex, (_match, title: string, url: string) => {
    attachments.push({
      title: title.trim(),
      url,
      kind: isLikelyImageUrl(url) ? "image" : "file",
    })
    return ""
  })

  text = text.replace(/\n?\s*Attachments:\s*\n?/gi, "\n")
  text = text.replace(/\n{3,}/g, "\n\n").trim()

  const unique = new Map<string, ParsedAttachment>()
  for (const attachment of attachments) {
    unique.set(`${attachment.url}|${attachment.title}`, attachment)
  }

  return { text, attachments: Array.from(unique.values()) }
}

function normalizeAttachmentValue(value: string): string {
  return value.trim().toLowerCase()
}

function collectSidebarAttachments(
  issueAttachments: Issue["attachments"] | undefined,
  comments: Comment[],
): SidebarAttachment[] {
  const merged = new Map<string, SidebarAttachment>()

  for (const attachment of issueAttachments ?? []) {
    const normalizedTitle = attachment.title.trim()
    const key = `${normalizeAttachmentValue(attachment.url)}|${normalizeAttachmentValue(normalizedTitle)}`
    if (merged.has(key)) continue
    merged.set(key, {
      id: attachment.id,
      title: normalizedTitle,
      url: attachment.url,
      subtitle: attachment.subtitle,
      kind: isLikelyImageUrl(attachment.url) ? "image" : "file",
    })
  }

  for (const comment of comments) {
    const parsed = parseCommentBody(comment.body)
    for (const attachment of parsed.attachments) {
      const normalizedTitle = attachment.title.trim()
      const key = `${normalizeAttachmentValue(attachment.url)}|${normalizeAttachmentValue(normalizedTitle)}`
      if (merged.has(key)) continue
      merged.set(key, {
        id: `comment:${comment.id}:${key}`,
        title: normalizedTitle,
        url: attachment.url,
        kind: attachment.kind,
      })
    }
  }

  return Array.from(merged.values())
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <>
      {lines.map((line, lineIndex) => (
        <div key={`line-${lineIndex}`}>
          {renderInlineMarkdown(line)}
        </div>
      ))}
    </>
  )
}

function renderInlineMarkdown(line: string): ReactNode {
  const parts: ReactNode[] = []
  let remaining = line
  let key = 0
  const tokenRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/
  while (remaining.length > 0) {
    const match = remaining.match(tokenRegex)
    if (!match || match.index === undefined) {
      parts.push(<span key={`text-${key++}`}>{remaining}</span>)
      break
    }
    const before = remaining.slice(0, match.index)
    if (before) {
      parts.push(<span key={`text-${key++}`}>{before}</span>)
    }
    if (match[2] && match[3]) {
      parts.push(
        <a
          key={`link-${key++}`}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-primary"
        >
          {match[2]}
        </a>,
      )
    } else if (match[4]) {
      parts.push(<strong key={`bold-${key++}`}>{match[4]}</strong>)
    } else if (match[5]) {
      parts.push(<code key={`code-${key++}`} className="rounded bg-muted px-1 py-0.5 text-[12px]">{match[5]}</code>)
    } else if (match[6]) {
      parts.push(<em key={`italic-${key++}`}>{match[6]}</em>)
    }
    remaining = remaining.slice(match.index + match[0].length)
  }
  return parts
}

function Property({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <div>{children}</div>
    </div>
  )
}

function getStatusInfo(type: string) {
  switch (type) {
    case "completed":
      return { icon: CheckCircle2, variant: "success" as const }
    case "started":
      return { icon: Clock, variant: "info" as const }
    case "canceled":
      return { icon: XCircle, variant: "outline" as const }
    case "unstarted":
      return { icon: Circle, variant: "warning" as const }
    case "backlog":
      return { icon: HelpCircle, variant: "outline" as const }
    default:
      return { icon: Circle, variant: "outline" as const }
  }
}

function getPriorityInfo(priority: number) {
  switch (priority) {
    case 1:
      return { icon: AlertCircle, variant: "destructive" as const }
    case 2:
      return { icon: ChevronRight, variant: "warning" as const }
    case 3:
      return { icon: ChevronRight, variant: "info" as const }
    case 4:
      return { icon: ChevronRight, variant: "outline" as const }
    default:
      return { icon: Circle, variant: "outline" as const }
  }
}
