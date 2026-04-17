import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

function getFriendlyLoginError(code: string | undefined, t: Awaited<ReturnType<typeof getTranslations>>) {
  switch (code) {
    case "OAUTH_DENIED":
      return t("errors.oauthDenied");
    case "AUTH_SESSION_EXPIRED":
      return t("errors.authSessionExpired");
    case "AUTH_NO_CODE":
      return t("errors.authNoCode");
    case "AUTH_FAILED":
      return t("errors.authFailed");
    default:
      return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const t = await getTranslations("LoginPage");
  const params = await searchParams;

  if (session) {
    redirect(session.accessDeniedReason ? "/access-denied" : "/");
  }
  const friendlyError = getFriendlyLoginError(params.error, t);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px] flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="rounded-lg p-8">
          <div className="flex flex-col gap-6">
            {friendlyError && (
              <Badge
                variant="error"
                className="flex items-center gap-3 p-3 text-xs font-bold rounded"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{friendlyError}</span>
              </Badge>
            )}

            <div className="flex flex-col gap-4">
              <Link
                href="/api/auth/login"
                className="inline-flex justify-center"
              >
                <picture>
                  <source
                    media="(prefers-color-scheme: dark)"
                    srcSet="https://app.cal.com/continue-with-calcom-dark-rounded.svg"
                  />
                  <img
                    src="https://app.cal.com/continue-with-calcom-light-rounded.svg"
                    alt={t("continueWithCal")}
                    className="h-11 w-auto"
                  />
                </picture>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
