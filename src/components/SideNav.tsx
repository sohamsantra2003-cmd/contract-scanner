'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/app/actions/auth'

function ShieldLogo({ size = 28 }: { size?: number }) {
  const id = 'sl-' + size
  return (
    <svg width={size} height={Math.round(size * 1.17)}
      viewBox="0 0 24 28" fill="none">
      <defs>
        <linearGradient id={id} x1="2" y1="1" x2="22" y2="27"
          gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD080"/>
          <stop offset="100%" stopColor="#FF9500"/>
        </linearGradient>
      </defs>
      <path d="M12 1L2 5.5V13c0 6.35 4.5 12.28 10 13.88C17.5 25.28 22 19.35 22 13V5.5L12 1z"
        fill={"url(#"+id+")"} fillOpacity=".18"
        stroke={"url(#"+id+")"} strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="7.5" y1="12" x2="16.5" y2="12"
        stroke={"url(#"+id+")"} strokeWidth="1.5" strokeLinecap="round" opacity=".95"/>
      <line x1="7.5" y1="15.8" x2="14.2" y2="15.8"
        stroke={"url(#"+id+")"} strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="7.5" y1="19.5" x2="11.5" y2="19.5"
        stroke={"url(#"+id+")"} strokeWidth="1.5" strokeLinecap="round" opacity=".45"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard',
    icon: <svg viewBox="0 0 20 20" fill="none" width="16" height="16"><rect x="2" y="2" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="11" y="2" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="11" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/><rect x="11" y="11" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { id: 'contracts', label: 'Contracts', href: '/dashboard',
    icon: <svg viewBox="0 0 20 20" fill="none" width="16" height="16"><path d="M4 3h8l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="14" x2="11" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: 'calendar', label: 'Calendar', href: '/dashboard/calendar',
    icon: <svg viewBox="0 0 20 20" fill="none" width="16" height="16"><rect x="2" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><line x1="6" y1="2" x2="6" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="14" y1="2" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="9" x2="18" y2="9" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { id: 'rulebook', label: 'Rulebook', href: '/dashboard/rulebook',
    icon: <svg viewBox="0 0 20 20" fill="none" width="16" height="16"><path d="M3 4c0-.6.4-1 1-1h4c1.1 0 2 .9 2 2v11c0-1.1-.9-2-2-2H4a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M17 4c0-.6-.4-1-1-1h-4c-1.1 0-2 .9-2 2v11c0-1.1.9-2 2-2h4a1 1 0 001-1V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
  { id: 'chat', label: 'Chat', href: '/dashboard/chat',
    icon: <svg viewBox="0 0 20 20" fill="none" width="16" height="16"><path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H7l-4 3V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
]

function NavBtn({
  item, active, onClick
}: {
  item: typeof NAV_ITEMS[0]
  active: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 'var(--r-sm)',
        background: active ? 'var(--ac-bg)' : hovered ? 'rgba(255,255,255,.04)' : 'transparent',
        border: 'none', cursor: 'pointer', width: '100%',
        color: active ? 'var(--ac)' : hovered ? 'var(--tx-primary)' : 'var(--tx-secondary)',
        fontFamily: 'var(--ff-body)', fontSize: 14,
        fontWeight: active ? 600 : 500,
        transition: 'all .15s', textAlign: 'left',
      }}
    >
      {item.icon}
      {item.label}
    </button>
  )
}

export function SideNav({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()

  const activeId = (() => {
    if (pathname === '/dashboard') return 'dashboard'
    if (pathname.startsWith('/dashboard/contracts')) return 'contracts'
    if (pathname.startsWith('/dashboard/calendar')) return 'calendar'
    if (pathname.startsWith('/dashboard/rulebook')) return 'rulebook'
    if (pathname.startsWith('/dashboard/chat')) return 'chat'
    return 'dashboard'
  })()

  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : 'CS'

  return (
    <aside style={{
      width: 228, flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--bd-subtle)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'relative', zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldLogo size={28} />
        <div>
          <div style={{ fontFamily: 'var(--ff-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-.01em', lineHeight: 1.2, color: 'var(--tx-primary)' }}>Contract</div>
          <div style={{ fontFamily: 'var(--ff-display)', fontWeight: 800, fontSize: 15, letterSpacing: '-.01em', color: 'var(--ac)', lineHeight: 1.2 }}>Scanner</div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--bd-subtle)', margin: '0 16px 10px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <NavBtn
            key={item.id}
            item={item}
            active={activeId === item.id}
            onClick={() => router.push(item.href)}
          />
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '10px 10px 14px', borderTop: '1px solid var(--bd-subtle)' }}>
        <NavBtn
          item={{
            id: 'settings', label: 'Settings', href: '#',
            icon: <svg viewBox="0 0 20 20" fill="none" width="16" height="16"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.41 1.41M14.37 14.37l1.41 1.41M4.22 15.78l1.41-1.41M14.37 5.63l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          }}
          active={false}
          onClick={() => {}}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginTop: 4 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--ff-display)', fontSize: 11, fontWeight: 700, color: 'white',
          }}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx-primary)' }}>
              {userEmail ?? 'Account'}
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', padding: 4, borderRadius: 4, transition: 'color .15s', flexShrink: 0 }}
            >
              <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
                <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M13 14l4-4-4-4M17 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
