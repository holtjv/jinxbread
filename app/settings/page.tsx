'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [notifFriday, setNotifFriday] = useState(true)
  const [notifSunday, setNotifSunday] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: customer } = await supabase
        .from('customers')
        .select('id, notif_reminder_friday, notif_reminder_sunday')
        .eq('email', user.email)
        .single()
      if (!customer) return
      setCustomerId(customer.id)
      setNotifFriday(customer.notif_reminder_friday ?? true)
      setNotifSunday(customer.notif_reminder_sunday ?? true)
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (!customerId) return
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('customers')
      .update({
        notif_reminder_friday: notifFriday,
        notif_reminder_sunday: notifSunday,
      })
      .eq('id', customerId)
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div>
      <h1>Settings</h1>
      <p className="page-subtitle">Manage your notification preferences and account settings.</p>

      <div style={{ maxWidth: 480 }}>
        <h2 style={{ marginBottom: 16 }}>Email notifications</h2>

        <div style={{
          border: '1px solid var(--gray-200)', borderRadius: 8,
          overflow: 'hidden', marginBottom: 32,
        }}>
          {[
            {
              key: 'friday',
              label: 'Friday reminder',
              detail: 'Reminder every Friday at 9am to review your standing order before the Sunday cutoff.',
              value: notifFriday,
              setter: setNotifFriday,
            },
            {
              key: 'sunday',
              label: 'Sunday morning reminder',
              detail: 'A final nudge Sunday at 10am — a couple hours before the noon cutoff.',
              value: notifSunday,
              setter: setNotifSunday,
            },
          ].map((item, idx, arr) => (
            <div key={item.key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px',
              borderBottom: idx < arr.length - 1 ? '1px solid var(--gray-200)' : 'none',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.4 }}>{item.detail}</div>
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', cursor: 'pointer',
                marginLeft: 24, flexShrink: 0,
              }}>
                <div
                  onClick={() => item.setter(!item.value)}
                  style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: item.value ? 'var(--accent)' : 'var(--gray-300)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2,
                    left: item.value ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
              </label>
            </div>
          ))}
        </div>

        <h2 style={{ marginBottom: 16 }}>Account</h2>
        <div style={{
          border: '1px solid var(--gray-200)', borderRadius: 8,
          overflow: 'hidden', marginBottom: 32,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Password</div>
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Change your login password.</div>
            </div>
            <button
              onClick={() => router.push('/reset')}
              className="btn"
              style={{ background: 'var(--gray-100)', color: 'var(--gray-900)', padding: '8px 16px', fontSize: 13 }}
            >
              Reset password
            </button>
          </div>
        </div>

        {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {saved && (
            <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>
              ✓ Settings saved
            </span>
          )}
        </div>
      </div>
    </div>
  )
}