"use client"

import Link from "next/link"
import { Building2, ChevronRight } from "lucide-react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { useTranslations } from "next-intl"
import { api } from "../convex/_generated/api"
import { Card } from "@/components/ui/card"
import type { Customer } from "@/lib/models"

const HAS_CONVEX = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

type CustomerLite = Pick<Customer, "id" | "slug" | "name" | "logoUrl" | "domains">

export function HomePageClient({
  role,
  firstName,
  initialCustomers,
  preferConvex = HAS_CONVEX,
}: {
  role: "employee" | "customer_user"
  firstName: string
  initialCustomers: CustomerLite[]
  preferConvex?: boolean
}) {
  if (!preferConvex) {
    return <HomePageContent role={role} firstName={firstName} customers={initialCustomers} />
  }

  return <HomePageWithConvex role={role} firstName={firstName} />
}

function HomePageWithConvex({ role, firstName }: { role: "employee" | "customer_user"; firstName: string }) {
  const t = useTranslations("HomePage")
  const result = useQuery(api.portal.listCustomersScoped, {})
  const errorCode = (result as { errorCode?: string } | undefined)?.errorCode

  if (errorCode === "UNAUTHORIZED") {
    return (
      <main className="flex-1 container py-12">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-3">{t("convexAuthMissing")}</p>
          <Link href="/api/auth/logout" className="text-sm underline">
            {t("signOutAndLoginAgain")}
          </Link>
        </Card>
      </main>
    )
  }

  const customers = (result?.customers ?? []) as CustomerLite[]

  return <HomePageContent role={role} firstName={firstName} customers={customers} />
}

function HomePageContent({
  role,
  firstName,
  customers,
}: {
  role: "employee" | "customer_user"
  firstName: string
  customers: CustomerLite[]
}) {
  const t = useTranslations("HomePage")
  const router = useRouter()

  useEffect(() => {
    if (role === "customer_user" && customers.length === 1) {
      router.replace(`/${customers[0].slug}`)
    }
  }, [customers, role, router])

  return (
    <main className="flex-1 container py-12">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-heading">
            {role === "employee" ? t("titleEmployee") : t("titleCustomer", { firstName })}
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl">
            {role === "employee"
              ? t("subtitleEmployee")
              : t("subtitleCustomer")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/${customer.slug}`} className="group">
              <Card className="flex items-center gap-4 p-5 transition-all hover:border-primary/50 hover:shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border bg-muted transition-colors">
                  {customer.logoUrl ? (
                    <img src={customer.logoUrl} alt={customer.name} className="h-6 w-6 object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate text-foreground">{customer.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {customer.domains.length > 0 ? customer.domains[0] : t("internalDomain")}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Card>
            </Link>
          ))}

          {customers.length === 0 && (
            <div className="col-span-full">
              <Card className="flex flex-col items-center justify-center py-20 text-center px-6 border-dashed bg-muted/30">
                <Building2 className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-bold text-foreground">{t("noOrganizationsTitle")}</h3>
                <p className="text-muted-foreground mt-1 max-w-xs mx-auto text-sm">
                  {role === "employee"
                    ? t("noOrganizationsEmployee")
                    : t("noOrganizationsCustomer")}
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
