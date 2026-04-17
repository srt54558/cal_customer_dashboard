"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { useTranslations } from "next-intl"
import { api } from "../convex/_generated/api"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { IssuesList } from "@/components/issues-list"
import { Skeleton } from "@/components/ui/skeleton"
import type { ApiErrorCode, Customer, Issue } from "@/lib/models"
import { getSessionQuerySnapshot, setSessionQuerySnapshot } from "@/lib/session-query-cache"

const HAS_CONVEX = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

export function CustomerPageClient({
  customerSlug,
  initialCustomer,
  initialIssues,
  initialErrorCode,
  preferConvex = HAS_CONVEX,
}: {
  customerSlug: string
  initialCustomer: Customer | null
  initialIssues: Issue[]
  initialErrorCode?: ApiErrorCode
  preferConvex?: boolean
}) {
  const t = useTranslations("CustomerPage")
  if (!preferConvex) {
    if (initialErrorCode === "FORBIDDEN") {
      return <div className="p-4 text-sm text-destructive">{t("forbidden")}</div>
    }
    if (!initialCustomer) {
      return <div className="p-4 text-sm text-muted-foreground">{t("customerNotFound")}</div>
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <IssuesList issues={initialIssues} customerSlug={customerSlug} />
      </div>
    )
  }

  return <CustomerPageWithConvex customerSlug={customerSlug} />
}

function CustomerPageWithConvex({ customerSlug }: { customerSlug: string }) {
  const t = useTranslations("CustomerPage")
  const result = useQuery(api.portal.getCustomerOverviewBySlugScoped, { slug: customerSlug, activityLimit: 1 })
  const cacheKey = `tickets:${customerSlug}`
  if (result !== undefined) {
    setSessionQuerySnapshot(cacheKey, result)
  }
  const cachedResult = getSessionQuerySnapshot<typeof result>(cacheKey)
  const currentResult = result ?? cachedResult

  const content = useMemo(() => {
    if (!currentResult) {
      return <CustomerListSkeleton />
    }

    if (currentResult.errorCode === "UNAUTHORIZED") {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          <p className="mb-2">{t("convexAuthMissing")}</p>
          <Link href="/api/auth/logout" className="underline">
            {t("signOutAndLoginAgain")}
          </Link>
        </div>
      )
    }

    if (currentResult.errorCode === "FORBIDDEN") {
      return <div className="p-4 text-sm text-destructive">{t("forbidden")}</div>
    }

    if (!currentResult.customer) {
      return <div className="p-4 text-sm text-muted-foreground">{t("customerNotFound")}</div>
    }

    return <IssuesList issues={currentResult.issues} customerSlug={customerSlug} />
  }, [currentResult, customerSlug, t])

  return <div className="flex min-h-0 flex-1 flex-col">{content}</div>
}

export function CustomerListSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={`column-${index}`} className="rounded-lg border bg-muted/20 p-3 flex flex-col gap-3 min-h-[220px]">
            <header className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-6" />
            </header>
            <div className="flex flex-col gap-3">
              <Card>
                <CardHeader className="gap-3 pb-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
