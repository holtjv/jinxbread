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
      if (!user) {
        setLoading(false)
        return
      }
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

  return (
    <nav style={{
      display: 'flex',
      gap: 24,
      alignItems: 'center',
      padding: '12px 32px',
      borderBottom: '1px solid #ccc',
      marginBottom: 8,
      background: '#fff',
      color: '#000',
    }}>
      <span style={{ fontWeight: 'bold', marginRight: 8 }}>Jinxbread</span>
      <a href="/order" style={{ color: '#000', textDecoration: 'none' }}>Order</a>
      <a href="/par" style={{ color: '#000', textDecoration: 'none' }}>Standing order</a>
      {isAdmin && (
        <a href="/admin" style={{ color: '#000', textDecoration: 'none' }}>Admin</a>
      )}
      <button
        onClick={handleLogout}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: '1px solid #ccc',
          borderRadius: 4,
          padding: '4px 12px',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </nav>
  )
}