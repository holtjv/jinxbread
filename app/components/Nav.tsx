'use client'

import { createClient } from '../../lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Nav() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: customer } = await supabase
        .from('customers')
        .select('is_admin')
        .eq('email', user.email)
        .single()
      setIsAdmin(customer?.is_admin || false)
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
        <img src="/logo.png" alt="Jinxbread" style={{ width: 120, height: 'auto' }} />
      </div>
      <nav className="sidebar-nav">
        <a href="/order" className={pathname === '/order' ? 'active' : ''}>
          Place an Order
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
        <a href="/settings" className={pathname === '/settings' ? 'active' : ''}>
          Settings
        </a>
      </nav>
      <div className="sidebar-footer">
        <button onClick={handleLogout}>Sign out</button>
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 12 }}>
          © Jinx Bread LLC 2026
        </div>
      </div>
    </aside>
  )
}