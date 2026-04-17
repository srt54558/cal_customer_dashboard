"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  Bell,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  Settings,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  AlertDialogClose,
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetPanel,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { api } from "@/convex/_generated/api"
import type { CalUser } from "@/lib/auth"
import type { Customer } from "@/lib/models"
import { formatDistanceToNow } from "date-fns"

interface PortalShellProps {
  children: React.ReactNode
  user: CalUser
  customer: Customer
}

const NAV_ITEMS = [
  {
    key: "overview",
    labelKey: "nav.overview",
    icon: Home,
    href: (slug: string) => `/${slug}/overview`,
  },
  {
    key: "tickets",
    labelKey: "nav.tickets",
    icon: ClipboardList,
    href: (slug: string) => `/${slug}`,
  },
  {
    key: "settings",
    labelKey: "nav.settings",
    icon: Settings,
    href: (slug: string) => `/${slug}/settings`,
  },
]
const HAS_CONVEX = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

export function PortalShell({ children, user, customer }: PortalShellProps) {
  const t = useTranslations("PortalShell")
  const pathname = usePathname()
  const router = useRouter()
  const [showIssueBackButton, setShowIssueBackButton] = useState(false)
  const isIssueRoute = pathname.startsWith(`/${customer.slug}/issues/`)

  const shellTitle = getShellTitle(pathname, customer.slug, t)

  useEffect(() => {
    const siblingRoutes = [`/${customer.slug}`, `/${customer.slug}/overview`, `/${customer.slug}/settings`]
    for (const route of siblingRoutes) {
      router.prefetch(route)
    }
  }, [customer.slug, router])

  useEffect(() => {
    if (!isIssueRoute) {
      setShowIssueBackButton(false)
      return
    }

    const onIssueTitleVisibility = (event: Event) => {
      const customEvent = event as CustomEvent<{ visible?: boolean }>
      setShowIssueBackButton(customEvent.detail?.visible === false)
    }

    window.addEventListener("portal:issue-title-visibility", onIssueTitleVisibility as EventListener)
    return () => {
      window.removeEventListener("portal:issue-title-visibility", onIssueTitleVisibility as EventListener)
    }
  }, [isIssueRoute])

  const handleIssueBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/${customer.slug}`)
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="flex min-h-screen">
        <aside className="hidden h-screen w-60 shrink-0 self-start border-r border-border bg-background lg:sticky lg:top-0 lg:flex lg:flex-col">
          <div className="px-4 py-5">
            <SidebarBrandLogo brandLabel={t("brand")} />
          </div>

          <div className="flex flex-1 flex-col gap-1 px-2 pb-2">
            {NAV_ITEMS.map((item) => {
              const href = item.href(customer.slug)
              const active = isNavItemActive(item.key, href, pathname, customer.slug)
              const Icon = item.icon

              return (
                <Link
                  key={item.key}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              )
            })}

            <div className="mt-2 border-t border-border pt-2">
              <LogoutAction />
            </div>
          </div>

          <div className="mt-auto border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-[10px] font-bold">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-foreground">{user.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Sheet>
                  <SheetTrigger
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        className="lg:hidden"
                        aria-label={t("actions.openNavigation")}
                      />
                    }
                  >
                    <Menu className="h-4 w-4" />
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[320px] p-0">
                    <SheetHeader className="border-b border-border pb-4">
                      <SheetTitle>
                        <SidebarBrandLogo brandLabel={t("brand")} />
                      </SheetTitle>
                    </SheetHeader>
                    <SheetPanel className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        {NAV_ITEMS.map((item) => {
                          const href = item.href(customer.slug)
                          const active = isNavItemActive(item.key, href, pathname, customer.slug)
                          const Icon = item.icon

                          return (
                            <Link
                              key={item.key}
                              href={href}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                                active
                                  ? "bg-secondary text-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              {t(item.labelKey)}
                            </Link>
                          )
                        })}
                        <div className="mt-2 border-t border-border pt-2">
                          <LogoutAction />
                        </div>
                      </div>
                    </SheetPanel>
                  </SheetContent>
                </Sheet>

                <div className="relative min-w-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={handleIssueBack}
                    className={cn(
                      "absolute left-0 top-0 z-10 h-7 w-7 rounded-md transition-all duration-300 ease-out",
                      isIssueRoute && showIssueBackButton
                        ? "translate-x-0 opacity-100"
                        : "-translate-x-2 opacity-0 pointer-events-none"
                    )}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div
                    className={cn(
                      "min-w-0 transition-all duration-300 ease-out",
                      isIssueRoute && showIssueBackButton ? "translate-x-8" : "translate-x-0"
                    )}
                  >
                    <div className="truncate text-sm font-semibold text-foreground font-heading">{shellTitle.title}</div>
                    <div className="hidden truncate text-xs text-muted-foreground sm:block">{shellTitle.subtitle}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <NotificationBell customerId={customer.id} customerSlug={customer.slug} />
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  )
}

function SidebarBrandLogo({ brandLabel }: { brandLabel: string }) {
  const [logoLoadError, setLogoLoadError] = useState(false)

  if (logoLoadError) {
    return <span className="text-sm font-semibold text-foreground font-heading">{brandLabel}</span>
  }

  return (
    <div className="h-5 flex items-center">
      <img
        src="https://cal.com/logo.svg"
        alt={brandLabel}
        className="h-4 w-auto dark:hidden"
        onError={() => setLogoLoadError(true)}
      />
      <img
        src="https://cal.com/logo-white.svg"
        alt={brandLabel}
        className="hidden h-4 w-auto dark:block"
        onError={() => setLogoLoadError(true)}
      />
    </div>
  )
}

function NotificationBell({ customerId, customerSlug }: { customerId: string; customerSlug: string }) {
  const t = useTranslations("PortalShell")
  const [isOpen, setIsOpen] = useState(false)
  if (!HAS_CONVEX) {
    return (
      <Button variant="outline" size="icon" disabled className="hidden sm:inline-flex">
        <Bell className="h-4 w-4" />
      </Button>
    )
  }

  const unreadResult = useQuery(api.portal.getUnreadActivityCountScoped, { customerId })
  const recentActivityResult = useQuery(api.portal.getRecentActivityScoped, isOpen ? { customerId, limit: 10 } : "skip")
  const clearRecentActivity = useMutation(api.portal.clearRecentActivityScoped)
  const recentActivity = recentActivityResult?.items ?? []
  const hasUnread = (unreadResult?.unreadLast12hCount ?? 0) > 0

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon" className="hidden sm:inline-flex relative" aria-label={t("notifications.ariaLabel")} />
        }
      >
        <Bell className="h-4 w-4" />
        {hasUnread ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500" /> : null}
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-foreground font-heading">{t("notifications.title")}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              void clearRecentActivity({ customerId })
            }}
            disabled={!recentActivityResult || recentActivity.length === 0}
          >
            {t("notifications.clear")}
          </Button>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-3 space-y-2">
          {!recentActivityResult ? (
            <div className="text-xs text-muted-foreground">{t("notifications.loading")}</div>
          ) : recentActivity.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t("notifications.empty")}</div>
          ) : (
            recentActivity.map((item: { id: unknown; message: string; createdAtIso: string; issueIdentifier: string }) => (
              <Link
                key={String(item.id)}
                href={`/${customerSlug}/issues/${item.issueIdentifier}`}
                className="block rounded-md border border-border/70 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="text-sm text-foreground">{item.message}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(item.createdAtIso), { addSuffix: true })}
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function LogoutAction() {
  const t = useTranslations("PortalShell")
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" className="w-full justify-start text-sm text-muted-foreground hover:text-foreground" />}
      >
        <LogOut className="h-4 w-4" />
        {t("actions.logOff")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("logoutDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("logoutDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>{t("logoutDialog.cancel")}</AlertDialogClose>
          <Button variant="destructive" render={<Link href="/api/auth/logout" />}>
            {t("actions.logOff")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function isNavItemActive(
  key: string,
  href: string,
  pathname: string,
  customerSlug: string
) {
  if (key === "tickets") {
    const base = `/${customerSlug}`
    return pathname === base || pathname.startsWith(`${base}/issues/`)
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function getShellTitle(pathname: string, customerSlug: string, t: ReturnType<typeof useTranslations>) {
  const base = `/${customerSlug}`

  if (pathname === `${base}/overview`) {
    return {
      title: t("titles.overview.title"),
      subtitle: t("titles.overview.subtitle"),
    }
  }

  if (pathname === base) {
    return {
      title: t("titles.tickets.title"),
      subtitle: t("titles.tickets.subtitle"),
    }
  }

  if (pathname.startsWith(`${base}/issues/`)) {
    return {
      title: t("titles.issueDetail.title"),
      subtitle: t("titles.issueDetail.subtitle"),
    }
  }

  if (pathname === `${base}/settings`) {
    return {
      title: t("titles.settings.title"),
      subtitle: t("titles.settings.subtitle"),
    }
  }

  return {
    title: t("titles.default.title"),
    subtitle: t("titles.default.subtitle"),
  }
}
