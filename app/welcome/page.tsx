'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function WelcomePage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setReady(true)
        const { data: cu } = await supabase
          .from('customer_users')
          .select('customer_id, customers(name)')
          .eq('email', session.user.email)
          .single()
        if (cu) setCustomerName((cu.customers as any)?.name || null)
        return
      }

      // No session yet - wait for auth state change
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          setReady(true)
          supabase
            .from('customer_users')
            .select('customer_id, customers(name)')
            .eq('email', session.user.email)
            .single()
            .then(({ data: cu }) => {
              if (cu) setCustomerName((cu.customers as any)?.name || null)
            })
        }
      })

      return () => subscription.unsubscribe()
    }

    const unsubscribe = checkSession()
    return () => {
      if (unsubscribe instanceof Promise) {
        unsubscribe.then(unsub => unsub?.())
      } else if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="Jinx Bread" style={{ width: 100, height: 'auto', marginBottom: 24 }} />
        {!ready ? (
          <>
            <h1 style={{ marginBottom: 8 }}>Create your account</h1>
            <p style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 8 }}>
              Loading... if this takes more than a few seconds, try clicking the link in your email again.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: 4 }}>
              {customerName ? `Welcome, ${customerName}` : 'Create your account'}
            </h1>
            <p style={{ color: 'var(--gray-500)', fontSize: 14, marginTop: 4, marginBottom: 24 }}>
              Set a password to finish creating your account.
            </p>
            <form onSubmit={handleSetPassword}>
              <div className="form-field" style={{ marginBottom: 16 }}>
                <label className="form-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="text-input"
                    style={{ paddingRight: 40 }}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#717171', fontSize: 16, padding: 0, lineHeight: 1 }}>
                    {showPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
                {loading ? 'Saving...' : 'Create account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
