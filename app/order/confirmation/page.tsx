'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const week = searchParams.get('week') || ''

  return (
    <main style={{ maxWidth: 600, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
      <h1 style={{ marginBottom: 8 }}>Order submitted</h1>
      {week && (
        <p style={{ color: '#888', fontSize: 15, marginBottom: 32 }}>
          Your order for {week} has been received.
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