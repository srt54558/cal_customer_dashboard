import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getTranslations } from "next-intl/server"

export default async function CustomerLoading() {
  const t = await getTranslations("CustomerLoading")
  const columns = [t("columns.backlog"), t("columns.unstarted"), t("columns.inProgress"), t("columns.completed"), t("columns.canceled")]
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <div className="relative">
        <Skeleton className="h-10 w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 items-start">
        {columns.map((column) => (
          <section key={column} className="rounded-lg border bg-muted/20 p-3 flex flex-col gap-3 min-h-[220px]">
            <header className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-6" />
            </header>
            <div className="flex flex-col gap-3">
              <Card>
                <CardHeader className="gap-3 pb-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="gap-3 pb-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-11/12" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
