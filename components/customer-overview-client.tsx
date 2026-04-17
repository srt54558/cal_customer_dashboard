"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { Clock3, MessageSquare, Ticket, TriangleAlert } from "lucide-react";
import type { ElementType } from "react";
import { formatDistanceToNow } from "date-fns";
import { api } from "../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getSessionQuerySnapshot,
  setSessionQuerySnapshot,
} from "@/lib/session-query-cache";
import type { ApiErrorCode, Comment, Customer, Issue } from "@/lib/models";

const HAS_CONVEX = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export type OverviewInitialData = {
  customer: Customer | null;
  issues: Issue[];
  commentsByIssueId: Record<string, Comment[]>;
  recentActivity?: Array<{
    id: string;
    message: string;
    createdAtIso: string;
    href: string;
  }>;
  recentActivityUnreadLast12h?: number;
  errorCode?: ApiErrorCode;
};

export function CustomerOverviewClient({
  customerSlug,
  firstName,
  initialData,
  preferConvex = HAS_CONVEX,
}: {
  customerSlug: string;
  firstName: string;
  initialData?: OverviewInitialData;
  preferConvex?: boolean;
}) {
  if (!preferConvex) {
    if (!initialData) {
      return <OverviewSkeleton />;
    }
    return (
      <OverviewContent
        customerSlug={customerSlug}
        firstName={firstName}
        data={initialData}
      />
    );
  }

  return (
    <CustomerOverviewWithConvex
      customerSlug={customerSlug}
      firstName={firstName}
    />
  );
}

function CustomerOverviewWithConvex({
  customerSlug,
  firstName,
}: {
  customerSlug: string;
  firstName: string;
}) {
  const customerResult = useQuery(api.portal.getCustomerOverviewBySlugScoped, {
    slug: customerSlug,
    activityLimit: 5,
  });
  const cacheKey = `overview:${customerSlug}`;
  if (customerResult !== undefined) {
    setSessionQuerySnapshot(cacheKey, {
      ...customerResult,
      __firstName: firstName,
    });
  }
  const cachedResult = getSessionQuerySnapshot<typeof customerResult>(cacheKey);
  const currentResult = customerResult ?? cachedResult;

  if (!currentResult) {
    return <OverviewSkeleton />;
  }

  return (
    <OverviewContent
      customerSlug={customerSlug}
      firstName={firstName}
      data={{
        customer: currentResult.customer,
        issues: currentResult.issues,
        commentsByIssueId: currentResult.commentsByIssueId,
        recentActivity: currentResult.recentActivity.map(
          (item: {
            id: unknown;
            message: string;
            createdAtIso: string;
            issueIdentifier: string;
          }) => ({
            id: String(item.id),
            message: item.message,
            createdAtIso: item.createdAtIso,
            href: `/${customerSlug}/issues/${item.issueIdentifier}`,
          }),
        ),
        recentActivityUnreadLast12h: currentResult.unreadLast12hCount,
        errorCode: currentResult.errorCode,
      }}
    />
  );
}

export function OverviewContent({
  customerSlug,
  firstName,
  data,
}: {
  customerSlug: string;
  firstName: string;
  data: OverviewInitialData;
}) {
  const t = useTranslations("CustomerOverview");
  const { resolvedTheme } = useTheme();
  const iframeOrigin = "https://status.cal.com";
  const iframeSrc = useMemo(
    () =>
      resolvedTheme === "dark"
        ? `${iframeOrigin}/?embed=title,banner,components&theme=dark`
        : `${iframeOrigin}/?embed=title,banner,components&theme=light`,
    [resolvedTheme],
  );
  if (data.errorCode === "UNAUTHORIZED") {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p className="mb-2">{t("convexAuthMissing")}</p>
        <Link href="/api/auth/logout" className="underline">
          {t("signOutAndLoginAgain")}
        </Link>
      </div>
    );
  }

  if (data.errorCode === "FORBIDDEN") {
    return <div className="p-4 text-sm text-destructive">{t("forbidden")}</div>;
  }

  if (!data.customer) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t("customerNotFound")}
      </div>
    );
  }

  const issues = data.issues;
  const openCount = issues.filter(
    (issue) => issue.state.type !== "completed",
  ).length;
  const inProgressCount = issues.filter(
    (issue) => issue.state.type === "started",
  ).length;
  const doneCount = issues.filter(
    (issue) => issue.state.type === "completed",
  ).length;
  const recentNotifs =
    data.recentActivityUnreadLast12h ??
    issues.filter(
      (issue) =>
        Date.parse(issue.updatedAt) >= Date.now() - 12 * 60 * 60 * 1000,
    ).length;
  const greeting = getTimeGreeting(t);

  const recent = [...issues]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 6);
  const recentActivity = data.recentActivity ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl font-heading">
          {greeting}, {firstName || t("fallbackName")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {recentNotifs === 0
            ? t("notifications.none")
            : t("notifications.some", { count: recentNotifs })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewStat
          label={t("stats.totalTickets.label")}
          value={String(issues.length)}
          helper={t("stats.totalTickets.helper")}
          icon={Ticket}
        />
        <OverviewStat
          label={t("stats.open.label")}
          value={String(openCount)}
          helper={t("stats.open.helper")}
          icon={TriangleAlert}
        />
        <OverviewStat
          label={t("stats.inProgress.label")}
          value={String(inProgressCount)}
          helper={t("stats.inProgress.helper")}
          icon={Clock3}
        />
        <OverviewStat
          label={t("stats.resolved.label")}
          value={String(doneCount)}
          helper={t("stats.resolved.helper")}
          icon={MessageSquare}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground font-heading">
              {t("recentTickets.title")}
            </span>
            <Badge variant="outline">{recent.length}</Badge>
          </div>

          <div className="flex flex-col">
            {recent.map((issue) => (
              <Link
                key={issue.id}
                href={`/${customerSlug}/issues/${issue.identifier}`}
                className="flex items-center gap-3 border-b border-border/70 px-4 py-3 text-sm transition-colors hover:bg-muted/40 last:border-b-0"
              >
                <span className="w-[78px] shrink-0 font-mono text-[11px] text-muted-foreground">
                  {issue.identifier}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {issue.title}
                </span>
                <Badge
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  {issue.priorityLabel}
                </Badge>
                <Badge
                  variant="outline"
                  size="sm"
                  className="hidden md:inline-flex"
                >
                  {issue.state.name}
                </Badge>
              </Link>
            ))}

            {recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("recentTickets.empty")}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-4 text-sm font-semibold text-foreground font-heading">
            {t("recentActivity.title")}
          </div>
          <div className="flex flex-col gap-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((item) => (
                <ActivityItem
                  key={item.id}
                  text={item.message}
                  time={formatDistanceToNow(new Date(item.createdAtIso), {
                    addSuffix: true,
                  })}
                  href={item.href}
                />
              ))
            ) : (
              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
                <div className="text-sm text-muted-foreground">
                  {t("recentActivity.empty")}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-xl bg-background p-0">
        <iframe
          title={t("uptime.title")}
          src={iframeSrc}
          className="h-[500px] w-full border-0 bg-transparent"
          loading="lazy"
          scrolling="no"
          referrerPolicy="no-referrer"
        />
      </Card>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={`overview-stat-${idx}`} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <Card className="p-4">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>

        <Card className="p-4">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ElementType;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-semibold text-foreground font-heading">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </Card>
  );
}

function ActivityItem({
  text,
  time,
  href,
}: {
  text: string;
  time: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50 block"
    >
      <div className="text-sm text-foreground">{text}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{time}</div>
    </Link>
  );
}

function getTimeGreeting(t: ReturnType<typeof useTranslations>) {
  const hour = new Date().getHours();
  if (hour < 12) {
    return t("greeting.morning");
  }
  if (hour < 15) {
    return t("greeting.afternoon");
  }
  return t("greeting.evening");
}
