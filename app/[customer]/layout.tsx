import { forbidden, notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getCustomerBySlugScoped } from "@/lib/data-store"
import { PortalShell } from "@/components/portal-shell"

interface CustomerLayoutProps {
  children: React.ReactNode
  params: Promise<{ customer: string }>
}

export default async function CustomerLayout({
  children,
  params,
}: CustomerLayoutProps) {
  const session = await requireAuth()
  const { customer: customerSlug } = await params

  const customer = await getCustomerBySlugScoped(session, customerSlug)

  if (customer.errorCode === "FORBIDDEN") {
    forbidden()
  }

  if (!customer.customer) {
    notFound()
  }

  return (
    <PortalShell user={session.user} customer={customer.customer}>
      {children}
    </PortalShell>
  )
}
