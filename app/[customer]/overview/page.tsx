import { requireAuth } from "@/lib/auth"
import { getCustomerBySlugScoped, getIssuesForCustomerScoped } from "@/lib/data-store"
import { CustomerOverviewClient } from "@/components/customer-overview-client"

interface CustomerOverviewPageProps {
  params: Promise<{ customer: string }>
}

export default async function CustomerOverviewPage({ params }: CustomerOverviewPageProps) {
  const session = await requireAuth()
  const { customer: customerSlug } = await params
  const useConvexClient = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

  if (useConvexClient) {
    return (
      <CustomerOverviewClient
        customerSlug={customerSlug}
        firstName={session.user.name.split(" ")[0] || "there"}
        preferConvex={useConvexClient}
      />
    )
  }

  const customer = await getCustomerBySlugScoped(session, customerSlug)
  const issuesResult = customer.customer
    ? await getIssuesForCustomerScoped(session, customer.customer.id)
    : { issues: [], commentsByIssueId: {}, source: "linear_fallback" as const, errorCode: customer.errorCode }

  return (
    <CustomerOverviewClient
      customerSlug={customerSlug}
      firstName={session.user.name.split(" ")[0] || "there"}
      initialData={{
        customer: customer.customer,
        issues: issuesResult.issues,
        commentsByIssueId: issuesResult.commentsByIssueId,
        errorCode: customer.errorCode,
      }}
      preferConvex={useConvexClient}
    />
  )
}
