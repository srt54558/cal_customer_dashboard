"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { useTranslations } from "next-intl"
import { api } from "../convex/_generated/api"
import { IssuesList } from "@/components/issues-list"
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
  const cachedResult = getSessionQuerySnapshot<typeof result>(cacheKey)
  const currentResult = result ?? cachedResult

  useEffect(() => {
    if (result !== undefined) {
      setSessionQuerySnapshot(cacheKey, result)
    }
  }, [cacheKey, result])

  const content = useMemo(() => {
    if (!currentResult) {
      return <div className="p-4 text-sm text-muted-foreground">{t("loadingCustomer")}</div>
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
