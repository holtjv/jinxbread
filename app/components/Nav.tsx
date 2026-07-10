'use client'

import { createClient } from '../../lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Nav() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bakeryName, setBakeryName] = useState<string>('Jinxbread')
  const [sidebarColor, setSidebarColor] = useState<'dark' | 'light'>('dark')
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const [userRes, settingsRes] = await Promise.all([
        supabase
          .from('customer_users')
          .select('customer_id, customers(is_admin)')
          .eq('email', user.email)
          .single(),
        supabase
          .from('bakery_settings')
          .select('logo_url, bakery_name, sidebar_color')
          .single(),
      ])
      setIsAdmin((userRes.data?.customers as any)?.is_admin || false)
      setLogoUrl(settingsRes.data?.logo_url ?? null)
      setBakeryName(settingsRes.data?.bakery_name ?? 'Jinxbread')
      setSidebarColor(settingsRes.data?.sidebar_color === 'light' ? 'light' : 'dark')
      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return null
  if (pathname === '/login') return null
  if (pathname === '/welcome') return null
  if (pathname === '/onboarding') return null

  const isLight = sidebarColor === 'light'

  const sidebarStyle = isLight
    ? { background: '#fff', color: 'var(--gray-900)', borderRight: '1px solid var(--gray-200)' }
    : {}

  const logoDivStyle = isLight
    ? { borderBottom: '1px solid var(--gray-200)' }
    : {}

  const linkStyle = (active: boolean) => isLight
    ? {
        color: active ? 'var(--accent)' : 'var(--gray-700)',
        background: active ? 'rgba(0,0,0,0.04)' : undefined,
        borderLeft: active ? '3px solid var(--accent)' : undefined,
        paddingLeft: active ? 17 : undefined,
      }
    : {}

  const footerStyle = isLight ? { borderTop: '1px solid var(--gray-200)' } : {}

  const settingsLinkStyle = isLight
    ? {
        color: pathname === '/settings' ? 'var(--accent)' : 'var(--gray-600)',
        fontWeight: pathname === '/settings' ? 600 : 400,
      }
    : {
        color: pathname === '/settings' ? '#fff' : 'rgba(255,255,255,0.65)',
        fontWeight: pathname === '/settings' ? 600 : 400,
      }

  const signOutButtonStyle = isLight
    ? { border: '1px solid var(--gray-300)', color: 'var(--gray-700)' }
    : {}

  const copyrightStyle = isLight
    ? { color: 'var(--gray-500)' }
    : { color: 'rgba(255,255,255,0.4)' }

  return (
    <aside className="sidebar" style={sidebarStyle}>
      <div className="sidebar-logo" style={logoDivStyle}>
        <img
          src={logoUrl ?? '/logo.png'}
          alt={bakeryName}
          style={{ width: 120, height: 'auto' }}
          onError={e => { (e.currentTarget as HTMLImageElement).src = '/logo.png' }}
        />
      </div>
      <nav className="sidebar-nav">
        <a href="/order" className={pathname === '/order' ? 'active' : ''} style={linkStyle(pathname === '/order')}>
          One-time Order
        </a>
        <a href="/par" className={pathname === '/par' ? 'active' : ''} style={linkStyle(pathname === '/par')}>
          Standing Order
        </a>
        <a href="/my-orders" className={pathname === '/my-orders' ? 'active' : ''} style={linkStyle(pathname === '/my-orders')}>
          My Orders
        </a>
        {isAdmin && (
          <a href="/admin" className={pathname.startsWith('/admin') ? 'active' : ''} style={linkStyle(pathname.startsWith('/admin'))}>
            Admin
          </a>
        )}
      </nav>
      <div className="sidebar-footer" style={footerStyle}>
        <a
          href="/settings"
          style={{
            display: 'block',
            fontSize: 13,
            textDecoration: 'none',
            marginBottom: 12,
            ...settingsLinkStyle,
          }}
        >
          Settings
        </a>
        <button onClick={handleLogout} style={signOutButtonStyle}>Sign out</button>
        <div style={{ fontSize: 11, marginTop: 12, ...copyrightStyle }}>
          © BakersBoss 2026
        </div>
      </div>
    </aside>
  )
}
