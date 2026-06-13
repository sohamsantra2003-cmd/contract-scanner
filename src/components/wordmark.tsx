import { ShieldCheck } from "lucide-react";

export function Wordmark({ variant = "login" }: { variant?: "login" | "navbar" }) {
  const isLogin = variant === "login";
  return (
    <div className="flex items-center gap-2.5">
      <div
        style={{
          width: isLogin ? 34 : 28,
          height: isLogin ? 34 : 28,
          borderRadius: isLogin ? 9 : 7,
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          ...(isLogin && {
            boxShadow:
              "0 0 0 1px rgba(99,88,242,0.4), 0 8px 24px rgba(79,70,229,0.35)",
          }),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <ShieldCheck size={isLogin ? 17 : 14} color="white" strokeWidth={2} />
      </div>
      <span
        style={{
          fontSize: isLogin ? 15 : 13.5,
          fontWeight: 500,
          color: isLogin ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.85)",
          letterSpacing: "-0.01em",
        }}
      >
        Contract Scanner
      </span>
    </div>
  );
}
