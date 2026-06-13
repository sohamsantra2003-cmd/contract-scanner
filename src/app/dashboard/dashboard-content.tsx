"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquare,
  PenLine,
  LogOut,
  FileText,
  ChevronRight,
  FilePlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/actions/auth";
import { UploadZone } from "@/components/UploadZone";
import { formatDistanceToNow } from "date-fns";

interface Contract {
  id: string;
  title: string;
  status: string;
  created_at: string;
  file_url: string;
}

const featureCards = [
  { Icon: Search, label: "Risk detection" },
  { Icon: MessageSquare, label: "Plain English explanations" },
  { Icon: PenLine, label: "Safer rewrites" },
];

const statusStyles: Record<string, React.CSSProperties> = {
  uploaded: {
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.4)",
    border: "0.5px solid rgba(255,255,255,0.1)",
  },
  scanning: {
    background: "rgba(234,179,8,0.1)",
    color: "#fbbf24",
    border: "0.5px solid rgba(234,179,8,0.2)",
  },
  complete: {
    background: "rgba(34,197,94,0.1)",
    color: "#4ade80",
    border: "0.5px solid rgba(34,197,94,0.2)",
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    color: "#f87171",
    border: "0.5px solid rgba(239,68,68,0.2)",
  },
};

function Navbar({ email, initials }: { email: string; initials: string }) {
  return (
    <header
      className="sticky top-0 flex items-center justify-between z-50"
      style={{
        height: 64,
        background: "rgba(7,7,13,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "0.5px solid rgba(255,255,255,0.06)",
        padding: "0 2rem",
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.01em" }}>
          Contract Scanner
        </span>
      </div>

      <div className="flex items-center" style={{ gap: 12 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
            background: "rgba(99,102,241,0.12)",
            color: "#818cf8",
            border: "0.5px solid rgba(99,102,241,0.25)",
            borderRadius: 6,
            padding: "4px 10px",
          }}
        >
          Free plan
        </span>

        <span
          className="hidden sm:block truncate"
          style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", maxWidth: 200, letterSpacing: "-0.01em" }}
        >
          {email}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger style={{ all: "unset", cursor: "pointer" }}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.35)",
                fontSize: 11,
                fontWeight: 500,
                color: "#818cf8",
                cursor: "pointer",
              }}
            >
              {initials}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ minWidth: 200 }}>
            <div style={{ padding: "6px 8px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {email}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}
              onClick={() => signOut()}
            >
              <LogOut size={14} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function CompactUploadZone() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    if (file.size > 10 * 1024 * 1024) return;

    const { uploadContract } = await import("@/app/actions/contracts");
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadContract(formData);
    if (result.data) {
      router.push(`/dashboard/contracts/${result.data.id}`);
    }
  }

  return (
    <div
      className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => fileInputRef.current?.click()}
      style={{
        border: "1px dashed rgba(99,102,241,0.25)",
        borderRadius: 12,
        padding: "14px 20px",
        background: "rgba(99,102,241,0.03)",
      }}
    >
      <FilePlus size={18} color="#818cf8" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
        Upload another contract
      </span>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}

export function DashboardContent({
  email,
  initials,
  contracts,
}: {
  email: string;
  initials: string;
  contracts: Contract[];
}) {
  const router = useRouter();
  const hasContracts = contracts.length > 0;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#07070d", position: "relative", overflow: "hidden" }}
    >
      {/* Grid texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(79,70,229,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          zIndex: 0,
        }}
      />

      {/* Glow orb */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 500,
          top: 40,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(79,70,229,0.09)",
          filter: "blur(100px)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <Navbar email={email} initials={initials} />

      {hasContracts ? (
        /* ── Populated state ── */
        <main className="flex-1 relative z-10 px-4 py-8 mx-auto w-full" style={{ maxWidth: 760 }}>
          {/* Section header */}
          <div className="flex items-center justify-between" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: "#ffffff", letterSpacing: "-0.01em" }}>
              Your contracts
            </h2>
          </div>

          {/* Contract rows */}
          <div className="flex flex-col" style={{ gap: 8, marginBottom: "2rem" }}>
            {contracts.map((contract) => (
              <div
                key={contract.id}
                className="flex items-center hover:opacity-90 transition-opacity"
                onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  cursor: "pointer",
                  gap: 12,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)";
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: "rgba(99,102,241,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FileText size={18} color="#818cf8" />
                </div>

                {/* Title + date */}
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate"
                    style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 500, marginBottom: 3 }}
                  >
                    {contract.title}
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
                    {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Status badge + arrow */}
                <div className="flex items-center flex-shrink-0" style={{ gap: 10 }}>
                  <span
                    style={{
                      ...(statusStyles[contract.status] ?? statusStyles.uploaded),
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 6,
                      padding: "3px 9px",
                      textTransform: "capitalize",
                    }}
                  >
                    {contract.status}
                  </span>
                  <ChevronRight size={16} color="rgba(255,255,255,0.2)" />
                </div>
              </div>
            ))}
          </div>

          {/* Compact upload zone */}
          <CompactUploadZone />
        </main>
      ) : (
        /* ── Empty state ── */
        <>
          <main className="flex-1 flex items-center justify-center relative z-10 px-4 py-12">
            <UploadZone />
          </main>
          <div className="relative z-10 flex justify-center pb-12 px-4">
            <div className="flex justify-center flex-wrap" style={{ gap: 12, maxWidth: 560 }}>
              {featureCards.map(({ Icon, label }) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "0.5px solid rgba(255,255,255,0.05)",
                    borderRadius: 10,
                    padding: "14px 14px",
                    maxWidth: 140,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: "rgba(99,102,241,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Icon size={14} color="#818cf8" />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
