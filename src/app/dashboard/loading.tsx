import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div style={{ padding: "2rem" }}>
      <Skeleton style={{ height: 40, width: 200, marginBottom: 16 }} />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ height: 64, borderRadius: 10, marginBottom: 8 }} />
      ))}
    </div>
  );
}
