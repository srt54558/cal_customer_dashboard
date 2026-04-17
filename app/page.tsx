import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { getCustomersForSession } from "@/lib/data-store"
import { PortalHeader } from "@/components/portal-header"
import { HomePageClient } from "@/components/home-page-client"

export default async function HomePage() {
  const session = await requireAuth()
  const customersResult = await getCustomersForSession(session)
  const customers = customersResult.customers
  const useConvexClient = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

  if (session.role === "customer_user" && customers.length === 1) {
    redirect(`/${customers[0].slug}`)
  }

  return (
    <div className="min-h-full flex flex-col bg-background">
      <PortalHeader user={session.user} role={session.role} />
      <HomePageClient
        role={session.role}
        firstName={session.user.name.split(" ")[0] || session.user.name}
        initialCustomers={customers}
        preferConvex={useConvexClient}
      />
    </div>
  )
}
