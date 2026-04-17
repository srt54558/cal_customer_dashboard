"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Search, ChevronRight, Clock, User, AlertCircle, CheckCircle2, Circle, HelpCircle, XCircle } from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import type { Issue } from "@/lib/models"

interface IssuesListProps {
  issues: Issue[]
  customerSlug: string
}

const KANBAN_COLUMNS = [
  { id: "backlog", labelKey: "columns.backlog", types: ["backlog"] },
  { id: "unstarted", labelKey: "columns.todo", types: ["unstarted"] },
  { id: "started", labelKey: "columns.inProgress", types: ["started"] },
  { id: "completed", labelKey: "columns.done", types: ["completed", "canceled"] },
]

export function IssuesList({ issues, customerSlug }: IssuesListProps) {
  const t = useTranslations("IssuesList")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const raw = search.trim()
    if (!raw) {
      return issues
    }

    const terms = raw
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    return issues.filter((issue) => {
      const searchable = [
        issue.identifier,
        issue.title,
        issue.description ?? "",
        issue.state.name,
        issue.state.type,
        issue.priorityLabel,
        issue.assignee?.name ?? "",
        ...issue.labels.map((label) => label.name),
      ]
        .join(" ")
        .toLowerCase()

      return terms.every((term) => searchable.includes(term))
    })
  }, [issues, search])

  const columns = useMemo(() => {
    const byCol: Record<string, Issue[]> = {}
    for (const col of KANBAN_COLUMNS) {
      byCol[col.id] = filtered.filter(i => col.types.includes(i.state.type))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
    return byCol
  }, [filtered])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-semibold text-foreground font-heading">{t("title")}</span>
          <Badge variant="secondary" className="text-xs font-semibold">
            {t("ticketsCount", { count: filtered.length })}
          </Badge>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <Button className="h-9 whitespace-nowrap" disabled>
            {t("createTicket")}
          </Button>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 pb-2">
        <div className="flex h-full items-start gap-4 overflow-x-auto pb-3">
          {KANBAN_COLUMNS.map((column) => (
            <div
              key={column.id}
              className="flex h-full w-[280px] shrink-0 flex-col gap-3 rounded-2xl border border-border/70 bg-muted/35 p-3 md:w-[calc(25%-0.75rem)] md:min-w-[280px]"
            >
              <div className="flex items-center justify-between px-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground font-heading">{t(column.labelKey)}</h3>
                  <Badge variant="outline" size="sm" className="rounded-full font-bold">
                    {columns[column.id].length}
                  </Badge>
                </div>
              </div>

              <div className="custom-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-1">
                {columns[column.id].map((issue) => (
                  <KanbanCard key={issue.id} issue={issue} customerSlug={customerSlug} />
                ))}
                {columns[column.id].length === 0 && (
                  <div className="rounded-lg border border-dashed border-border h-24 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{t("noIssues")}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KanbanCard({ issue, customerSlug }: { issue: Issue; customerSlug: string }) {
  const statusInfo = getStatusInfo(issue.state.type)
  const priorityInfo = getPriorityInfo(issue.priority)

  return (
    <Link href={`/${customerSlug}/issues/${issue.identifier}`} className="block group">
      <Card className="p-4 transition-all hover:border-primary/30 hover:shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {issue.identifier}
            </span>
            <Badge variant={statusInfo.variant} size="sm" className="px-1 h-5 min-w-5">
              <statusInfo.icon className="h-3 w-3" />
            </Badge>
          </div>

          <h4 className="text-sm font-bold text-foreground leading-snug transition-colors line-clamp-3 font-heading">
            {issue.title}
          </h4>

          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter", priorityInfo.className)}>
                <priorityInfo.icon className="h-2.5 w-2.5" />
              </div>
              
              {issue.labels.length > 0 && (
                <div className="flex -space-x-1">
                  {issue.labels.slice(0, 2).map(label => (
                    <div 
                      key={label.id} 
                      className="h-1.5 w-1.5 rounded-full ring-2 ring-background" 
                      style={{ backgroundColor: label.color }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-muted-foreground uppercase">
                {formatDistanceToNow(new Date(issue.updatedAt), { addSuffix: false })}
              </span>
              {issue.assignee ? (
                <Avatar className="h-5 w-5 border border-border">
                  <AvatarImage src={issue.assignee.avatarUrl} />
                  <AvatarFallback className="text-[7px] font-bold">
                    {issue.assignee.name.split(" ").map(n => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-5 w-5 rounded-full border border-border bg-muted flex items-center justify-center">
                  <User className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
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
    case 1: // Urgent
      return { icon: AlertCircle, className: "text-red-500" }
    case 2: // High
      return { icon: ChevronRight, className: "text-orange-500 -rotate-90" }
    case 3: // Medium
      return { icon: ChevronRight, className: "text-blue-500" }
    case 4: // Low
      return { icon: ChevronRight, className: "text-muted-foreground rotate-90" }
    default:
      return { icon: Circle, className: "text-muted-foreground" }
  }
}
