'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function WelcomePage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [logoUrl, setLogoUrl] = useState('/logo.png')
  const [bakeryName, setBakeryName] = useState('Your Bakery')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('bakery_settings')
      .select('logo_url, bakery_name')
      .single()
      .then(({ data }) => {
        if (!data) return
        if (data.logo_url) setLogoUrl(data.logo_url)
        if (data.bakery_name) setBakeryName(data.bakery_name)
      })
    // Process the hash tokens and establish the session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setReady(true)
      }
    })
  }, [])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

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

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src={logoUrl} alt={bakeryName} style={{ width: 100, height: 'auto', marginBottom: 24 }} />
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logoUrl} alt={bakeryName} style={{ width: 100, height: 'auto', marginBottom: 24 }} />
        <h1 style={{ marginBottom: 4 }}>Create your account</h1>
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
      </div>
    </div>
  )
}
