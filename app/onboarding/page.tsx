'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'

function formatCutoffTime(raw: string): string {
  const [h, m] = raw.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState('/logo.png')
  const [bakeryName, setBakeryName] = useState('Your Bakery')
  const [cutoffDay, setCutoffDay] = useState('Sunday')
  const [cutoffTime, setCutoffTime] = useState('12:00 PM')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('bakery_settings')
      .select('logo_url, bakery_name, cutoff_day, cutoff_time')
      .single()
      .then(({ data }) => {
        if (!data) return
        if (data.logo_url) setLogoUrl(data.logo_url)
        if (data.bakery_name) setBakeryName(data.bakery_name)
        if (data.cutoff_day) setCutoffDay(data.cutoff_day)
        if (data.cutoff_time) setCutoffTime(formatCutoffTime((data.cutoff_time as string).slice(0, 5)))
      })
  }, [])

  const steps = [
    {
      title: 'Place an Order',
      detail: 'Submit a one-time order for any upcoming week. Adjust quantities, add products, confirm.',
    },
    {
      title: 'Standing Order',
      detail: 'Set your weekly quantities once. They submit automatically every week — no action needed.',
    },
    {
      title: 'My Orders',
      detail: 'See all your submitted orders. Edit anything up until the cutoff.',
    },
    {
      title: 'One important thing',
      detail: `Orders cut off every ${cutoffDay} at ${cutoffTime}. After that, the week locks — get your order in before then.`,
    },
  ]

  function handleNext() {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      router.push('/par')
    }
  }

  const isLast = step === steps.length - 1

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <img src={logoUrl} alt={bakeryName} style={{ width: 80, height: 'auto', marginBottom: 28 }} />

        <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--gray-200)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <h1 style={{ fontSize: 26, marginBottom: 16 }}>{steps[step].title}</h1>
        {steps[step].detail.split('\n\n').map((para, i) => (
          <p key={i} style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: i < steps[step].detail.split('\n\n').length - 1 ? 12 : 0 }}>
            {para}
          </p>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 48 }}>
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              style={{ background: 'none', border: 'none', color: 'var(--gray-500)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)', padding: 0 }}
            >
              ← Back
            </button>
          ) : <div />}
          <button onClick={handleNext} className="btn btn-primary">
            {isLast ? 'Set my standing order →' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}