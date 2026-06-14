"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  BookOpen,
  MessageSquare,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "contracts", label: "Contracts", icon: FileText, href: "/dashboard" },
  { id: "calendar", label: "Calendar", icon: Calendar, href: "/dashboard/calendar" },
  { id: "rulebook", label: "Rulebook", icon: BookOpen, href: "/dashboard/rulebook" },
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/dashboard/chat" },
];

interface SideNavProps {
  userEmail?: string | null;
}

export function SideNav({ userEmail }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/contracts");
    }
    return pathname.startsWith(href);
  };

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "US";

  return (
    <nav
      data-sidenav
      style={{
        width: 240,
        minWidth: 240,
        height: "100vh",
        background: "#0a0a12",
        borderRight: "0.5px solid rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
        padding: "0 10px",
        position: "sticky",
        top: 0,
        zIndex: 40,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "24px 10px 28px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, #5b4fff, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(91,79,255,0.45)",
            flexShrink: 0,
          }}
        >
          <Shield size={15} color="white" strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          Contract<br />Scanner
        </span>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <NavItem
              key={item.id}
              label={item.label}
              icon={<Icon size={18} strokeWidth={active ? 2 : 1.5} />}
              active={active}
              onClick={() => router.push(item.href)}
            />
          );
        })}
      </div>

      {/* Bottom */}
      <div style={{ paddingBottom: 16 }}>
        <div style={{ height: "0.5px", background: "rgba(255,255,255,0.05)", marginBottom: 10 }} />

        <NavItem
          label="Settings"
          icon={<Settings size={18} strokeWidth={1.5} />}
          active={false}
          onClick={() => {}}
        />

        {/* User row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginTop: 4 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "linear-gradient(135deg, #5b4fff, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "white",
              flexShrink: 0, letterSpacing: "0.02em",
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12, color: "rgba(255,255,255,0.5)",
                overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", letterSpacing: "-0.01em",
              }}
            >
              {userEmail ?? "Account"}
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center",
                borderRadius: 6, transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.25)"; }}
            >
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        height: 40, padding: "0 12px", width: "100%",
        borderRadius: 10,
        background: active ? "rgba(91,79,255,0.12)" : hov ? "rgba(255,255,255,0.04)" : "transparent",
        border: "none",
        borderLeft: `2px solid ${active ? "#5b4fff" : "transparent"}`,
        color: active ? "#ffffff" : hov ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.38)",
        fontSize: 14, fontWeight: active ? 500 : 400,
        letterSpacing: "-0.01em",
        cursor: "pointer", textAlign: "left",
        transition: "all 0.18s cubic-bezier(0.25,0.1,0.25,1)",
        fontFamily: "inherit",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
