"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type DeleteResult = { error?: string };

type UploadResult =
  | { data: { id: string }; error?: never }
  | { error: string; data?: never };

export async function uploadContract(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file") as File | null;

  if (!file) return { error: "No file provided" };

  // MIME type validation
  if (file.type !== "application/pdf") {
    return { error: "Please upload a PDF file" };
  }

  // Size validation (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File must be under 10MB" };
  }

  // Get authenticated user via cookie-based client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Generate unique storage path
  const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
  const storagePath = `${user.id}/${filename}`;

  // Service role client for storage upload (bypasses RLS bucket policies)
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: storageError } = await adminSupabase.storage
    .from("contracts")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

  if (storageError) return { error: storageError.message };

  // Get public URL
  const { data: urlData } = adminSupabase.storage
    .from("contracts")
    .getPublicUrl(storagePath);

  // Insert contracts row via cookie-based client (enforces user_id RLS)
  const { data: contract, error: insertError } = await supabase
    .from("contracts")
    .insert({
      user_id: user.id,
      file_url: urlData.publicUrl,
      title: file.name,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  return { data: { id: contract.id } };
}

export async function deleteContract(contractId: string): Promise<DeleteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Fetch contract to get file_url and verify ownership
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, file_url, user_id")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .single();

  if (!contract) return { error: "Contract not found" };

  // Extract storage path and delete file
  const storagePath = contract.file_url.split("/storage/v1/object/public/contracts/")[1];
  if (storagePath) {
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await adminSupabase.storage.from("contracts").remove([storagePath]);
  }

  // Delete the DB row
  const { error: deleteError } = await supabase
    .from("contracts")
    .delete()
    .eq("id", contractId)
    .eq("user_id", user.id);

  if (deleteError) return { error: deleteError.message };

  return {};
}
