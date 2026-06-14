import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { contractId } = await req.json();

  // Ownership check
  const { data: contract } = await supabase
    .from("contracts")
    .select("id")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .single();

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await supabase
    .from("contracts")
    .update({ status: "pending" })
    .eq("id", contractId);

  return NextResponse.json({ success: true });
}
