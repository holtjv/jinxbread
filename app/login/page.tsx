'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Listen for auth state changes. If user is authenticated, redirect to /welcome
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        router.replace('/welcome')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/order')
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email address above first.')
      return
    }
    setResetLoading(true)
    setError(null)

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://jinxbread.vercel.app/reset',
    })

    setResetLoading(false)
    setResetSent(true)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="Jinxbread" style={{ width: 100, height: 'auto', marginBottom: 24 }} />
        <p className="tagline">Wholesale ordering</p>
        <form onSubmit={handleLogin}>
          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="text-input"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="text-input"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#717171',
                  fontSize: 16,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {resetSent && (
            <div className="alert alert-success">
              Password reset email sent — check your inbox.
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#717171' }}>
          Forgot your password?{' '}
          <button
            onClick={handleForgotPassword}
            disabled={resetLoading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 13,
              padding: 0,
              fontFamily: 'var(--font)',
            }}
          >
            {resetLoading ? 'Sending...' : 'Send reset email'}
          </button>
        </p>
      </div>
    </div>
  )
}// Build test - testing post-build session handling
