"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useTranslations } from "next-intl"
import { ExternalLink, TriangleAlert } from "lucide-react"
import { useTheme } from "next-themes"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Frame, FrameDescription, FramePanel, FrameTitle } from "@/components/ui/frame"
import { Switch } from "@/components/ui/switch"
import { getSessionQuerySnapshot, setSessionQuerySnapshot } from "@/lib/session-query-cache"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type ThemeValue = "light" | "dark" | "system"

export function SettingsPageClient({ customerSlug }: { customerSlug: string }) {
  const t = useTranslations("SettingsPage")
  const settingsResult = useQuery(api.account.getSettingsByCustomerSlugScoped, { slug: customerSlug })
  const cacheKey = `settings:${customerSlug}`
  const cachedResult = getSessionQuerySnapshot<typeof settingsResult>(cacheKey)
  const currentResult = settingsResult ?? cachedResult
  const customerId = currentResult?.customer?.id
  const setNotificationPreferences = useMutation(api.account.setNotificationPreferencesScoped)
  const setAppearance = useMutation(api.account.setAppearanceScoped)
  const deleteAccount = useMutation(api.account.deleteAccountScoped)
  const { setTheme } = useTheme()

  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    ticketUpdates: true,
    supportComments: true,
    weeklyDigest: false,
  })
  const [themeValue, setThemeValue] = useState<ThemeValue>("system")

  useEffect(() => {
    if (!currentResult?.notificationPreferences) return
    setPrefs(currentResult.notificationPreferences)
  }, [currentResult?.notificationPreferences])

  useEffect(() => {
    if (!currentResult?.appearance?.theme) return
    const theme = currentResult.appearance.theme as ThemeValue
    setThemeValue(theme)
    setTheme(theme)
  }, [setTheme, currentResult?.appearance?.theme])

  useEffect(() => {
    if (settingsResult !== undefined) {
      setSessionQuerySnapshot(cacheKey, settingsResult)
    }
  }, [cacheKey, settingsResult])

  if (!currentResult) {
    return (
      <div className="mx-auto w-full max-w-4xl text-sm text-muted-foreground">
        {t("loading")}
      </div>
    )
  }

  if (currentResult.errorCode === "UNAUTHORIZED") {
    return (
      <div className="mx-auto w-full max-w-4xl text-sm text-muted-foreground">
        {t("unauthorized")}
      </div>
    )
  }

  if (!currentResult.customer || currentResult.errorCode === "FORBIDDEN") {
    return (
      <div className="mx-auto w-full max-w-4xl text-sm text-destructive">
        {t("forbidden")}
      </div>
    )
  }

  async function updatePreference<K extends keyof typeof prefs>(key: K, value: boolean) {
    if (!customerId) return
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setIsSaving(true)
    try {
      await setNotificationPreferences({
        customerId,
        emailNotifications: next.emailNotifications,
        ticketUpdates: next.ticketUpdates,
        supportComments: next.supportComments,
        weeklyDigest: next.weeklyDigest,
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function updateTheme(nextTheme: ThemeValue) {
    setThemeValue(nextTheme)
    setTheme(nextTheme)
    await setAppearance({ theme: nextTheme })
  }

  async function handleDeleteAccount() {
    setIsDeleting(true)
    try {
      await deleteAccount({})
      window.location.href = "/api/auth/logout"
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Card className="p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground font-heading">{t("notifications.title")}</div>
          <div className="text-xs text-muted-foreground">{t("notifications.subtitle")}</div>
        </div>

        <div className="flex flex-col divide-y divide-border">
          <SwitchRow
            title={t("notifications.emailNotifications.title")}
            description={t("notifications.emailNotifications.description")}
            checked={prefs.emailNotifications}
            disabled={isSaving}
            onChange={(checked) => updatePreference("emailNotifications", checked)}
          />
          <SwitchRow
            title={t("notifications.ticketUpdates.title")}
            description={t("notifications.ticketUpdates.description")}
            checked={prefs.ticketUpdates}
            disabled={isSaving || !prefs.emailNotifications}
            onChange={(checked) => updatePreference("ticketUpdates", checked)}
          />
          <SwitchRow
            title={t("notifications.supportComments.title")}
            description={t("notifications.supportComments.description")}
            checked={prefs.supportComments}
            disabled={isSaving || !prefs.emailNotifications}
            onChange={(checked) => updatePreference("supportComments", checked)}
          />
          <SwitchRow
            title={t("notifications.weeklyDigest.title")}
            description={t("notifications.weeklyDigest.description")}
            checked={prefs.weeklyDigest}
            disabled={isSaving || !prefs.emailNotifications}
            onChange={(checked) => updatePreference("weeklyDigest", checked)}
          />
        </div>
      </Card>

      <Frame>
        <FramePanel className="p-5">
          <div className="mb-4">
            <FrameTitle className="text-sm text-foreground font-heading">{t("profile.title")}</FrameTitle>
            <FrameDescription className="text-xs">{t("profile.subtitle")}</FrameDescription>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground font-heading">{t("profile.calSettingsTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("profile.calSettingsDescription")}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href="https://app.cal.com/settings/my-account/profile"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("profile.openProfileSettings")}
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <Card className="p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground font-heading">{t("appearance.title")}</div>
          <div className="text-xs text-muted-foreground">{t("appearance.subtitle")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ThemeButton
            label={t("appearance.light")}
            selected={themeValue === "light"}
            onClick={() => updateTheme("light")}
          />
          <ThemeButton
            label={t("appearance.dark")}
            selected={themeValue === "dark"}
            onClick={() => updateTheme("dark")}
          />
          <ThemeButton
            label={t("appearance.system")}
            selected={themeValue === "system"}
            onClick={() => updateTheme("system")}
          />
        </div>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5 p-5">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <TriangleAlert className="h-4 w-4" />
          <span className="text-sm font-semibold font-heading">{t("danger.title")}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground font-heading">{t("danger.deleteAccountTitle")}</div>
            <div className="text-xs text-muted-foreground">
              {t("danger.deleteAccountDescription")}
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive-outline" size="sm" />}>
              {t("danger.deleteAccountButton")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("danger.dialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("danger.dialogDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="outline" disabled={isDeleting} />}>
                  {t("danger.cancel")}
                </AlertDialogClose>
                <Button variant="destructive" disabled={isDeleting} onClick={() => void handleDeleteAccount()}>
                  {isDeleting ? t("danger.deleting") : t("danger.deleteAccountButton")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </div>
  )
}

function ThemeButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <Button variant={selected ? "default" : "outline"} size="sm" onClick={onClick}>
      {label}
    </Button>
  )
}

function SwitchRow({
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground font-heading">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
