import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth";

export default async function AccessDeniedPage() {
  const t = await getTranslations("AccessDeniedPage");
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.accessDeniedReason) {
    redirect("/");
  }

  const description =
    session.accessDeniedReason === "BLACKLISTED_EMAIL_DOMAIN"
      ? t("descriptionBlacklisted")
      : t("descriptionNoMapping");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground/90">{t("supportHint")}</p>
          <div className="pt-4">
            <Link
              href="/api/auth/logout?purge=1"
              className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-5 text-sm font-semibold text-destructive-foreground hover:opacity-90"
            >
              {t("logOff")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
