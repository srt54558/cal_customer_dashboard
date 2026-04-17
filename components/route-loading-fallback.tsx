"use client"

import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { CustomerListSkeleton } from "@/components/customer-page-client"
import { CustomerOverviewClient, OverviewSkeleton } from "@/components/customer-overview-client"
import { IssuePageSkeleton } from "@/components/issue-page-client"
import { SettingsPageSkeleton } from "@/components/settings-page-client"
import { IssuesList } from "@/components/issues-list"
import { getSessionQuerySnapshot } from "@/lib/session-query-cache"
import type { Customer, Issue } from "@/lib/models"
import type { IssuePageResult } from "@/components/issue-page-client"
import { IssuePageContent } from "@/components/issue-page-client"
import { Button } from "@/components/ui/button"
import { ExternalLink, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { Switch } from "@/components/ui/switch"

type TicketsSnapshot = {
  customer?: { id?: string } | null
  issues?: Issue[]
  errorCode?: string
}

type OverviewSnapshot = {
  customer?: Customer | null
  issues?: Issue[]
  commentsByIssueId?: Record<string, unknown[]>
  recentActivity?: Array<{
    id: string
    message: string
    createdAtIso: string
    issueIdentifier: string
  }>
  unreadLast12hCount?: number
  __firstName?: string
  errorCode?: string
}

type SettingsSnapshot = {
  customer?: { id?: string } | null
  notificationPreferences?: {
    emailNotifications: boolean
    ticketUpdates: boolean
    supportComments: boolean
    weeklyDigest: boolean
  }
  appearance?: {
    theme?: string
  }
  errorCode?: string
}

type IssueSnapshot = {
  issue?: IssuePageResult["issue"]
  comments?: IssuePageResult["comments"]
  source?: IssuePageResult["source"]
  errorCode?: string
}

export function TicketsRouteLoading() {
  const params = useParams<{ customer: string }>()
  const customerSlug = params?.customer
  if (!customerSlug) {
    return <CustomerListSkeleton />
  }

  const cached = getSessionQuerySnapshot<TicketsSnapshot>(`tickets:${customerSlug}`)
  if (!cached || cached.errorCode || !cached.customer) {
    return <CustomerListSkeleton />
  }

  return <IssuesList issues={cached.issues ?? []} customerSlug={customerSlug} />
}

export function OverviewRouteLoading() {
  const params = useParams<{ customer: string }>()
  const customerSlug = params?.customer
  if (!customerSlug) {
    return <OverviewSkeleton />
  }

  const cached = getSessionQuerySnapshot<OverviewSnapshot>(`overview:${customerSlug}`)
  if (!cached || cached.errorCode || !cached.customer) {
    return <OverviewSkeleton />
  }

  return (
    <CustomerOverviewClient
      customerSlug={customerSlug}
      firstName={cached.__firstName ?? "there"}
      preferConvex={false}
      initialData={{
        customer: cached.customer ?? null,
        issues: cached.issues ?? [],
        commentsByIssueId: (cached.commentsByIssueId ?? {}) as Record<string, never[]>,
        recentActivity: (cached.recentActivity ?? []).map((item) => ({
          id: item.id,
          message: item.message,
          createdAtIso: item.createdAtIso,
          href: `/${customerSlug}/issues/${item.issueIdentifier}`,
        })),
        recentActivityUnreadLast12h: cached.unreadLast12hCount,
      }}
    />
  )
}

export function SettingsRouteLoading() {
  const t = useTranslations("SettingsPage")
  const params = useParams<{ customer: string }>()
  const customerSlug = params?.customer
  if (!customerSlug) {
    return <SettingsPageSkeleton />
  }

  const cached = getSessionQuerySnapshot<SettingsSnapshot>(`settings:${customerSlug}`)
  if (!cached || cached.errorCode || !cached.customer) {
    return <SettingsPageSkeleton />
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Card className="p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground font-heading">{t("notifications.title")}</div>
          <div className="text-xs text-muted-foreground">{t("notifications.subtitle")}</div>
        </div>
        <div className="flex flex-col divide-y divide-border">
          <SettingsSwitchRow
            title={t("notifications.emailNotifications.title")}
            description={t("notifications.emailNotifications.description")}
            checked={Boolean(cached.notificationPreferences?.emailNotifications)}
          />
          <SettingsSwitchRow
            title={t("notifications.ticketUpdates.title")}
            description={t("notifications.ticketUpdates.description")}
            checked={Boolean(cached.notificationPreferences?.ticketUpdates)}
          />
          <SettingsSwitchRow
            title={t("notifications.supportComments.title")}
            description={t("notifications.supportComments.description")}
            checked={Boolean(cached.notificationPreferences?.supportComments)}
          />
          <SettingsSwitchRow
            title={t("notifications.weeklyDigest.title")}
            description={t("notifications.weeklyDigest.description")}
            checked={Boolean(cached.notificationPreferences?.weeklyDigest)}
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground font-heading">{t("profile.title")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.subtitle")}</div>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground font-heading">{t("profile.calSettingsTitle")}</div>
            <div className="text-xs text-muted-foreground">{t("profile.calSettingsDescription")}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href="https://app.cal.com/settings/my-account/profile"
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("profile.openProfileSettings")}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground font-heading">{t("appearance.title")}</div>
          <div className="text-xs text-muted-foreground">{t("appearance.subtitle")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={cached.appearance?.theme === "light" ? "default" : "outline"} size="sm" disabled>
            {t("appearance.light")}
          </Button>
          <Button variant={cached.appearance?.theme === "dark" ? "default" : "outline"} size="sm" disabled>
            {t("appearance.dark")}
          </Button>
          <Button variant={!cached.appearance?.theme || cached.appearance.theme === "system" ? "default" : "outline"} size="sm" disabled>
            {t("appearance.system")}
          </Button>
        </div>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5 p-5">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <TriangleAlert className="h-4 w-4" />
          <span className="text-sm font-semibold font-heading">{t("danger.title")}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("danger.deleteAccountDescription")}
        </div>
      </Card>
    </div>
  )
}

function SettingsSwitchRow({
  title,
  description,
  checked,
}: {
  title: string
  description: string
  checked: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground font-heading">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} disabled />
    </div>
  )
}

export function IssueRouteLoading() {
  const params = useParams<{ customer: string; issueId: string }>()
  const issueId = params?.issueId
  if (!issueId) {
    return <IssuePageSkeleton />
  }

  const cached = getSessionQuerySnapshot<IssueSnapshot>(`issue:${issueId}`)
  if (!cached || cached.errorCode || !cached.issue) {
    return <IssuePageSkeleton />
  }

  const result: IssuePageResult = {
    issue: cached.issue ?? null,
    comments: cached.comments ?? [],
    source: cached.source ?? "convex",
    errorCode: cached.errorCode,
  }

  return (
    <IssuePageContent customerSlug={params.customer ?? ""} result={result} />
  )
}
