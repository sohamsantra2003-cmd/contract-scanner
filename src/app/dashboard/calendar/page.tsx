import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ padding: "48px 40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 52px)", gap: 16, textAlign: "center" }}>
      <div style={{ fontSize: 56, lineHeight: 1 }}>📅</div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", margin: 0 }}>
        Contract Calendar
      </h1>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, maxWidth: 360, margin: 0 }}>
        Track renewal dates, notice periods, and key contract milestones in one timeline view.
      </p>
      <span style={{ marginTop: 8, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b4fff", background: "rgba(91,79,255,0.12)", border: "0.5px solid rgba(91,79,255,0.25)", borderRadius: 9999, padding: "4px 12px" }}>
        Coming soon
      </span>
    </div>
  );
}
