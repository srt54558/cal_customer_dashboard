import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import './globals.css'
import { Inter } from "next/font/google"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"
import { ConvexClientProvider } from "@/components/convex-client-provider"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata")
  return {
    title: t("title"),
    description: t("description"),
    generator: 'v0.app',
    icons: {
      icon: "/favicon.png",
      apple: "/favicon.png",
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn("font-sans antialiased h-full", inter.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
