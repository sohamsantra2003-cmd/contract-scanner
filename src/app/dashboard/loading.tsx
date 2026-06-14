import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div style={{ padding: "40px" }}>
      <Skeleton style={{ height: 38, width: 180, marginBottom: 8, borderRadius: 10 }} />
      <Skeleton style={{ height: 20, width: 240, marginBottom: 32, borderRadius: 8 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 120, borderRadius: 20 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ height: 76, borderRadius: 14, marginBottom: 8 }} />
      ))}
    </div>
  );
}
