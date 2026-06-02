'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    detail: 'Orders cut off every Sunday at noon. After that, the week locks. Get your order in before then.',
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
      <div className="login-card" style={{ maxWidth: 480 }}>
        <img src="/logo.png" alt="Jinx Bread" style={{ width: 80, height: 'auto', marginBottom: 28 }} />

        {/* Step indicator */}
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
        <p style={{ fontSize: 15, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 0 }}>
          {steps[step].detail}
        </p>

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