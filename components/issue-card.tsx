"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatDistanceToNow } from "date-fns"
import type { Issue } from "@/lib/models"
import { AlertTriangle, ArrowDown, ArrowUp, Equal } from "lucide-react"

interface IssueCardProps {
  issue: Issue
  customerSlug: string
}

export function IssueCard({ issue, customerSlug }: IssueCardProps) {
  const priorityIcon = getPriorityIcon(issue.priority)
  const priorityColor = getPriorityColor(issue.priority)

  return (
    <Link href={`/${customerSlug}/issues/${issue.identifier}`} className="group block">
      <Card className="h-full cursor-pointer border-border/70 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:border-primary/45 group-hover:shadow-md/10">
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">{issue.identifier}</span>
            <StatusBadge state={issue.state} />
          </div>
          <CardTitle className="text-[15px] leading-snug">{issue.title}</CardTitle>
          <div className={`flex items-center gap-1.5 text-xs ${priorityColor}`}>
            {priorityIcon}
            <span>{issue.priorityLabel}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {issue.labels.slice(0, 3).map((label) => (
                <Badge
                  key={label.id}
                  variant="outline"
                  size="sm"
                  style={{ borderColor: label.color, color: label.color }}
                >
                  {label.name}
                </Badge>
              ))}
              {issue.labels.length > 3 && (
                <span className="text-xs text-muted-foreground">+{issue.labels.length - 3} more</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {issue.assignee && (
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={issue.assignee.avatarUrl} />
                    <AvatarFallback className="text-[10px]">
                      {issue.assignee.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden xl:inline">{issue.assignee.name}</span>
                </div>
              )}
              <span>
                {formatDistanceToNow(new Date(issue.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function StatusBadge({ state }: { state: Issue["state"] }) {
  const bgColor = getStateBackgroundColor(state.type)

  return (
    <Badge variant="secondary" className={bgColor} style={{ color: state.color }}>
      <span className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: state.color }} />
      {state.name}
    </Badge>
  )
}

function getStateBackgroundColor(type: string): string {
  switch (type) {
    case "completed":
      return "bg-green-500/10"
    case "started":
      return "bg-blue-500/10"
    case "canceled":
      return "bg-red-500/10"
    default:
      return "bg-muted"
  }
}

function getPriorityIcon(priority: number) {
  switch (priority) {
    case 1:
      return <AlertTriangle className="h-3.5 w-3.5" />
    case 2:
      return <ArrowUp className="h-3.5 w-3.5" />
    case 3:
      return <Equal className="h-3.5 w-3.5" />
    case 4:
      return <ArrowDown className="h-3.5 w-3.5" />
    default:
      return null
  }
}

function getPriorityColor(priority: number): string {
  switch (priority) {
    case 1:
      return "text-red-500"
    case 2:
      return "text-orange-500"
    case 3:
      return "text-yellow-600"
    case 4:
      return "text-blue-500"
    default:
      return "text-muted-foreground"
  }
}
