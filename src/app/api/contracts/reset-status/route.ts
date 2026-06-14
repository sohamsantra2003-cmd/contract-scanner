import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json();
  const { contractId } = body;

  if (!contractId) {
    return NextResponse.json({ error: "contractId is required" }, { status: 400 });
  }

  // Ownership check — user can only reset their own contracts
  const { data: contract, error: fetchError } = await supabase
    .from("contracts")
    .select("id, title, status")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // If already scanning, do not reset — return 409
  if (contract.status === "scanning") {
    return NextResponse.json({ error: "Scan already in progress" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("contracts")
    .update({ status: "pending" })
    .eq("id", contractId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to reset contract status" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, contractId: contract.id });
}
