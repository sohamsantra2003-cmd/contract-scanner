import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SideNav } from "@/components/SideNav";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en">
      <body className={inter.className} style={{ overflow: "hidden" }}>
        <ErrorBoundary>
          <div
            style={{
              display: "flex",
              height: "100vh",
              overflow: "hidden",
              background: "#060609",
            }}
          >
            {showNav && <SideNav userEmail={userEmail} />}
            <main
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                height: "100vh",
                background: "#060609",
                width: showNav ? "calc(100vw - 240px)" : "100vw",
              }}
            >
              <div className="screen-enter" style={{ minHeight: "100%" }}>
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
