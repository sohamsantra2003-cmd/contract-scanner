import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, title, status, created_at, file_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardContent
      email={email}
      initials={initials}
      contracts={contracts ?? []}
    />
  );
}
