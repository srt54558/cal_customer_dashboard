import { requireAuth } from "@/lib/auth"
import { SettingsPageClient } from "@/components/settings-page-client"

interface SettingsPageProps {
  params: Promise<{ customer: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  await requireAuth()
  const { customer: customerSlug } = await params
  return <SettingsPageClient customerSlug={customerSlug} />
}
