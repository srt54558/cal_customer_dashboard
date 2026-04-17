"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, LayoutDashboard, ChevronRight, Menu, X, User } from "lucide-react"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { CalUser } from "@/lib/auth"
import type { Customer, Role } from "@/lib/models"

interface PortalHeaderProps {
  user: CalUser
  role: Role
  customer?: Customer | null
}

export function PortalHeader({ user, role, customer }: PortalHeaderProps) {
  const t = useTranslations("PortalHeader")
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full transition-all duration-200 border-b",
      scrolled 
        ? "bg-background/80 backdrop-blur-md py-2" 
        : "bg-background py-3"
    )}>
      <div className="container max-w-5xl px-4 md:px-6">
        <div className="flex h-10 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-lg">
                P
              </div>
              <span className="font-bold tracking-tight hidden sm:inline-block text-base">{t("brand")}</span>
            </Link>

            <nav className="hidden md:flex items-center text-sm font-medium">
              <div className="flex items-center gap-1">
                <Link 
                  href="/" 
                  className={cn(
                    "px-3 py-1.5 rounded transition-colors",
                    pathname === "/" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t("dashboard")}
                </Link>
                
                {customer && (
                  <>
                    <ChevronRight className="h-4 w-4 text-border" />
                    <Link 
                      href={`/${customer.slug}`}
                      className={cn(
                        "px-3 py-1.5 rounded transition-colors flex items-center gap-2",
                        pathname.startsWith(`/${customer.slug}`) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {customer.name}
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center">
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {role === "employee" ? t("roleStaff") : t("roleClient")}
              </Badge>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full p-0 overflow-hidden"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-full border border-border">
                  <AvatarImage src={user.avatarUrl} alt={user.name} />
                  <AvatarFallback className="bg-muted text-foreground text-xs font-bold">
                    {user.name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1 rounded-lg shadow-lg border-border bg-cal-bg-emphasis">
                <DropdownMenuLabel className="font-normal p-3">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-bold leading-none">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem className="rounded p-2 cursor-pointer hover:bg-accent text-sm">
                  <User className="mr-2 h-4 w-4 opacity-70" />
                  <span>{t("profileSettings")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded p-2 cursor-pointer hover:bg-accent text-sm">
                  <LayoutDashboard className="mr-2 h-4 w-4 opacity-70" />
                  <span>{t("personalWorkspace")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="rounded p-2 cursor-pointer text-destructive hover:bg-destructive/10 text-sm"
                  render={<Link href="/api/auth/logout" />}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden h-8 w-8 rounded"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-background border-b border-border py-4 z-50">
          <nav className="container flex flex-col gap-1 px-4">
            <Link 
              href="/" 
              className="px-4 py-2 rounded font-medium hover:bg-muted flex items-center gap-3 text-sm"
              onClick={() => setIsMenuOpen(false)}
            >
              <LayoutDashboard className="h-4 w-4 opacity-70" />
              {t("dashboard")}
            </Link>
            {customer && (
              <Link 
                href={`/${customer.slug}`} 
                className="px-4 py-2 rounded font-medium hover:bg-muted flex items-center gap-3 text-sm"
                onClick={() => setIsMenuOpen(false)}
              >
                <div className="h-4 w-4 flex items-center justify-center bg-primary rounded text-[10px] font-bold text-primary-foreground">
                  {customer.name[0]}
                </div>
                {customer.name}
              </Link>
            )}
            <Link 
              href="/api/auth/logout" 
              className="px-4 py-2 rounded font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 text-sm"
              onClick={() => setIsMenuOpen(false)}
            >
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
