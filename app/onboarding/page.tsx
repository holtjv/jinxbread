'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const steps = [
  {
    title: 'Welcome to Jinx Bread ordering',
    content: (
      <div style={{ marginTop: 16 }}>
        <p style={{ color: 'var(--gray-600)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          Here's how the system works. You've got three pages:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          {[
            { path: '/order', label: 'Place an Order', desc: 'Submit a one-time order for a specific week. Adjust quantities, add products, confirm.' },
            { path: '/par', label: 'Standing Order', desc: 'Set your weekly quantities. These submit automatically every Sunday at 1pm — no action needed.' },
            { path: '/my-orders', label: 'My Orders', desc: 'See all your submitted orders. Edit anything up until the Sunday noon cutoff.' },
          ].map(item => (
            <div key={item.path} style={{
              background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
              borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>
                  {item.path}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'When orders happen',
    content: (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          {[
            { label: 'Order week', detail: 'Tuesday through Monday' },
            { label: 'Cutoff', detail: 'Sunday at noon — standing orders submit automatically at 1pm' },
            { label: 'Manual orders', detail: 'Place or edit any time before the Sunday noon cutoff' },
            { label: 'After cutoff', detail: 'Orders lock. Contact Jinx Bread directly for changes.' },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex', gap: 16, alignItems: 'flex-start',
              padding: '12px 0', borderBottom: '1px solid var(--gray-100)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 14, minWidth: 120, color: 'var(--gray-700)' }}>{item.label}</div>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.5 }}>{item.detail}</div>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Next up: set your standing order. You can change it any time.
        </p>
      </div>
    ),
  },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const router = useRouter()

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
      <div className="login-card" style={{ maxWidth: 520 }}>
        <img src="/logo.png" alt="Jinx Bread" style={{ width: 80, height: 'auto', marginBottom: 20 }} />

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--gray-200)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <h1 style={{ marginBottom: 0, fontSize: 20 }}>{steps[step].title}</h1>
        {steps[step].content}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
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