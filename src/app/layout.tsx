import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { BottomTabBar } from "@/components/BottomTabBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Supremacy Desk",
  description: "World Cup 2026 knockout goal-supremacy trading desk.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full bg-background text-foreground">
          <ConvexClientProvider>
            <div className="mx-auto flex min-h-dvh max-w-md flex-col">
              <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
                <span className="text-base font-semibold tracking-tight">
                  Supremacy&nbsp;Desk
                </span>
                <span className="text-xs text-muted-foreground">WC2026 Knockouts</span>
              </header>

              {/* pb-20 leaves room for the fixed bottom tab bar */}
              <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
            </div>
            <BottomTabBar />
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
