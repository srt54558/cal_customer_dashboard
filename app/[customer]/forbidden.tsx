import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"

export default async function CustomerForbiddenPage() {
  const t = await getTranslations("CustomerForbiddenPage")
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center text-center gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground max-w-md">
            {t("description")}
          </p>
        </div>
        <Button render={<Link href="/" />}>{t("backToHome")}</Button>
      </div>
    </div>
  )
}
