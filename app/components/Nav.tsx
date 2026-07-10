'use client'

import { createClient } from '../../lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Nav() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bakeryName, setBakeryName] = useState<string>('Jinxbread')
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
          .select('logo_url, bakery_name')
          .single(),
      ])
      setIsAdmin((userRes.data?.customers as any)?.is_admin || false)
      setLogoUrl(settingsRes.data?.logo_url ?? null)
      setBakeryName(settingsRes.data?.bakery_name ?? 'Jinxbread')
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

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img
          src={logoUrl ?? '/logo.png'}
          alt={bakeryName}
          style={{ width: 120, height: 'auto' }}
          onError={e => { (e.currentTarget as HTMLImageElement).src = '/logo.png' }}
        />
      </div>
      <nav className="sidebar-nav">
        <a href="/order" className={pathname === '/order' ? 'active' : ''}>
          One-time Order
        </a>
        <a href="/par" className={pathname === '/par' ? 'active' : ''}>
          Standing Order
        </a>
        <a href="/my-orders" className={pathname === '/my-orders' ? 'active' : ''}>
          My Orders
        </a>
        {isAdmin && (
          <a href="/admin" className={pathname.startsWith('/admin') ? 'active' : ''}>
            Admin
          </a>
        )}
      </nav>
      <div className="sidebar-footer">
        <a href="/settings"
          style={{
            display: 'block',
            fontSize: 13,
            textDecoration: 'none',
            marginBottom: 12,
            fontWeight: pathname === '/settings' ? 600 : 400,
            color: pathname === '/settings' ? '#fff' : 'rgba(255,255,255,0.65)',
          }}
        >
          Settings
        </a>
        <button onClick={handleLogout}>Sign out</button>
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 12 }}>
          © BakersBoss 2026
        </div>
      </div>
    </aside>
  )
}
