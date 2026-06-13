import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

  const { data: profile } = await supabase
    .from("users")
    .select("tier, scans_used")
    .eq("id", user.id)
    .single();

  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();
  const tier = profile?.tier ?? "free";
  const scansUsed = profile?.scans_used ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Contract Scanner</span>
          </div>

          {/* User menu */}
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
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium truncate">{email}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={tier === "pro" ? "default" : "secondary"}
                      className="text-xs h-4 px-1.5"
                    >
                      {tier === "pro" ? "Pro" : "Free"}
                    </Badge>
                    {tier === "free" && (
                      <span className="text-xs text-muted-foreground">
                        {scansUsed}/1 scan used
                      </span>
                    )}
                  </div>
                </div>
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
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          {/* Empty state */}
          <Card className="w-full max-w-md border-border/50 border-dashed bg-card/30">
            <CardContent className="flex flex-col items-center gap-5 py-12 px-8 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1.5">
                <CardTitle className="text-lg">Upload your first contract</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  We&apos;ll scan it for risky clauses, explain them in plain English,
                  and suggest safer alternatives.
                </CardDescription>
              </div>
              <Button className="gap-2 w-full sm:w-auto" size="lg" disabled>
                <Upload className="h-4 w-4" />
                Upload contract
                <Badge variant="secondary" className="ml-1 text-xs">
                  Coming Day 2
                </Badge>
              </Button>
              {tier === "free" && (
                <p className="text-xs text-muted-foreground">
                  Free tier · {1 - scansUsed} scan remaining
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
