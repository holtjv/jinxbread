'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
      // If somehow a normal SIGNED_IN fires here (not a recovery), redirect away
      if (event === 'SIGNED_IN' && !ready) {
        router.push('/order')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (done) return // prevent double submit
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setLoading(false)
      // Sign out all other sessions so old passwords are fully invalidated
      await supabase.auth.signOut({ scope: 'others' })
      router.push('/order')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="Jinxbread" style={{ width: 100, height: 'auto', marginBottom: 24 }} />
        <h1 style={{ marginBottom: 4 }}>Set new password</h1>
        {!ready ? (
          <p style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 8 }}>
            Loading reset link... if this takes more than a few seconds,
            try clicking the link in your email again.
          </p>
        ) : done ? (
          <p style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 8 }}>
            Password updated. Redirecting...
          </p>
        ) : (
          <form onSubmit={handleReset} style={{ marginTop: 24 }}>
            <div className="form-field">
              <label className="form-label">New password</label>
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
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)', background: 'none',
                    border: 'none', cursor: 'pointer', color: '#717171',
                    fontSize: 16, padding: 0, lineHeight: 1,
                  }}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}