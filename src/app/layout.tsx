import type { Metadata } from "next";
import { Syne, Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SideNav } from "@/components/SideNav";
import { createClient } from "@/lib/supabase/server";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Contract Scanner — AI Contract Risk Analysis",
  description: "Upload a contract and get instant AI-powered risk analysis in plain English.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch {
    // On login/signup pages, no session exists — that's fine
  }

  const showNav = !!userEmail;

  return (
    <html lang="en" className={`${syne.variable} ${jakarta.variable} ${dmMono.variable}`}>
      <body style={{ overflow: "hidden" }}>
        <ErrorBoundary>
          <div
            style={{
              display: "flex",
              height: "100vh",
              overflow: "hidden",
              background: "var(--bg-base)",
            }}
          >
            {showNav && <SideNav userEmail={userEmail} />}
            <main
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                height: "100vh",
                background: "transparent",
                width: showNav ? "calc(100vw - 228px)" : "100vw",
              }}
            >
              <div className="page-anim" style={{ minHeight: "100%" }}>
                {children}
              </div>
            </main>
          </div>
        </ErrorBoundary>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
