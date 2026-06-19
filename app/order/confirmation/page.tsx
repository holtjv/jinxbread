'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const week = searchParams.get('week') || ''
  const emailFailed = searchParams.get('emailFailed') === '1'

  return (
    <main style={{ maxWidth: 600, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
      <h1 style={{ marginBottom: 8 }}>Order submitted</h1>
      {week && (
        <p style={{ color: '#888', fontSize: 15, marginBottom: emailFailed ? 16 : 32 }}>
          Your order for {week} has been received.
        </p>
      )}
      {emailFailed && (
        <p style={{ color: '#856404', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 16px', fontSize: 14, marginBottom: 32 }}>
          Your order was submitted, but we couldn't send a confirmation email — contact us if you don't hear from us.
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <a href="/my-orders" className="btn btn-primary">View my orders</a>
        <a href="/order" className="btn" style={{ background: 'var(--gray-100)', color: 'var(--gray-900)' }}>Place another order</a>
      </div>
    </main>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <ConfirmationContent />
    </Suspense>
  )
}