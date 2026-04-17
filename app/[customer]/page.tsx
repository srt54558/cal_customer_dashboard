import { requireAuth } from "@/lib/auth"
import { getTranslations } from "next-intl/server"
import { getCustomerBySlugScoped, getIssuesForCustomerScoped } from "@/lib/data-store"
import { CustomerPageClient } from "@/components/customer-page-client"

interface CustomerPageProps {
  params: Promise<{ customer: string }>
}

export async function generateMetadata({ params }: CustomerPageProps) {
  const t = await getTranslations("CustomerRouteMetadata")
  const { customer: customerSlug } = await params

  return {
    title: t("customerPageTitle", { customerSlug }),
    description: t("customerPageDescription", { customerSlug }),
  }
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const session = await requireAuth()
  const { customer: customerSlug } = await params
  const useConvexClient = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

  if (useConvexClient) {
    return (
      <CustomerPageClient
        customerSlug={customerSlug}
        initialCustomer={null}
        initialIssues={[]}
        preferConvex={useConvexClient}
      />
    )
  }

  const customer = await getCustomerBySlugScoped(session, customerSlug)
  const issues = customer.customer
    ? await getIssuesForCustomerScoped(session, customer.customer.id)
    : { issues: [], commentsByIssueId: {}, source: "convex" as const, errorCode: customer.errorCode }

  return (
    <CustomerPageClient
      customerSlug={customerSlug}
      initialCustomer={customer.customer}
      initialIssues={issues.issues}
      initialErrorCode={customer.errorCode}
      preferConvex={useConvexClient}
    />
  )
}
