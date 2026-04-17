import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { debugCustomerBySlugResolution, getCustomerBySlugScoped } from "@/lib/data-store"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "NOT_FOUND", code: "NOT_FOUND" }, { status: 404 })
  }

  try {
    const session = await requireAuth()
    if (session.role !== "employee") {
      return NextResponse.json({ error: "FORBIDDEN", code: "FORBIDDEN" }, { status: 403 })
    }

    const { slug } = await params

    const debug = await debugCustomerBySlugResolution(session, slug)
    const scoped = await getCustomerBySlugScoped(session, slug)

    return NextResponse.json(
      {
        debug,
        scopedResult: {
          hasCustomer: Boolean(scoped.customer),
          customerId: scoped.customer?.id ?? null,
          customerSlug: scoped.customer?.slug ?? null,
          errorCode: scoped.errorCode ?? null,
          source: scoped.source,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED", code: "UNAUTHORIZED" }, { status: 401 })
  }
}
