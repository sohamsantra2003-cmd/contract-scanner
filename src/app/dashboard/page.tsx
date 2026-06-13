import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, LogOut, Upload, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Contract Scanner</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-2 rounded-md hover:bg-accent transition-colors outline-none">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground hidden sm:block max-w-[160px] truncate">
                {email}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium truncate">{email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <form action={signOut} className="w-full">
                  <button type="submit" className="w-full flex items-center gap-2 cursor-pointer">
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-lg border-border/50 border-dashed bg-card/30">
            <CardContent className="flex flex-col items-center gap-6 py-16 px-10 text-center">
              <div className="rounded-full bg-primary/10 p-5">
                <FileText className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-3">
                <CardTitle className="text-3xl font-bold">Upload your first contract</CardTitle>
                <CardDescription className="text-base leading-relaxed max-w-sm">
                  We&apos;ll scan it for risky clauses, explain them in plain English,
                  and suggest safer alternatives — instantly.
                </CardDescription>
              </div>
              <Button className="gap-2 w-full sm:w-auto mt-2" size="lg" disabled>
                <Upload className="h-4 w-4" />
                Upload contract
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
