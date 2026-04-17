import { requireAuth } from "@/lib/auth"
import { getTranslations } from "next-intl/server"
import { getIssueByIdentifierScoped } from "@/lib/data-store"
import { IssuePageClient } from "@/components/issue-page-client"

interface IssuePageProps {
  params: Promise<{ customer: string; issueId: string }>
}

export async function generateMetadata({ params }: IssuePageProps) {
  const t = await getTranslations("CustomerRouteMetadata")
  const { issueId } = await params

  return {
    title: t("issuePageTitle", { issueId }),
    description: t("issuePageDescription", { issueId }),
  }
}

export default async function IssuePage({ params }: IssuePageProps) {
  const session = await requireAuth()
  const { customer: customerSlug, issueId } = await params
  const useConvexClient = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
  const issueResult = useConvexClient ? null : await getIssueByIdentifierScoped(session, issueId)

  return (
    <IssuePageClient
      customerSlug={customerSlug}
      issueId={issueId}
      initialResult={issueResult ?? undefined}
      preferConvex={useConvexClient}
    />
  )
}
