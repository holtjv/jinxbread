'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .single()

      if (!customer) return

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          delivery_date,
          delivery_window_id,
          status,
          is_par,
          customer_notes,
          submitted_at,
          delivery_window:delivery_windows (label, day_of_week),
          order_items (
            quantity,
            sliced,
            product:products (name, sku)
          )
        `)
        .eq('customer_id', customer.id)
        .order('delivery_date', { ascending: false })

      if (!error) setOrders(data || [])
      setLoading(false)
    }
    load()
  }, [])

  function fmtDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    })
  }

  function statusLabel(status: string, isPar: boolean) {
    const labels: Record<string, string> = {
      pending: 'Submitted',
      confirmed: 'Confirmed',
      in_production: 'In Production',
      fulfilled: 'Delivered',
      cancelled: 'Cancelled',
      par_pending: 'Standing Order',
    }
    let label = labels[status] || status
    if (isPar && status === 'pending') label = 'Auto-submitted (par)'
    return label
  }

  function statusColors(status: string): { background: string; color: string } {
    switch (status) {
      case 'fulfilled':
        return { background: '#d4edda', color: '#155724' }
      case 'confirmed':
      case 'in_production':
        return { background: '#cce5ff', color: '#004085' }
      case 'cancelled':
        return { background: '#f8d7da', color: '#721c24' }
      default:
        return { background: '#fff3cd', color: '#856404' }
    }
  }

  function totalLoaves(order: any): number {
    return order.order_items?.reduce((t: number, i: any) => t + i.quantity, 0) || 0
  }

  function getWeekKey(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00')
    const day = d.getDay()
    let tueDiff = 2 - day
    if (tueDiff > 0) tueDiff -= 7
    const tue = new Date(d)
    tue.setDate(d.getDate() + tueDiff)
    const mon = new Date(tue)
    mon.setDate(tue.getDate() + 6)
    const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(tue)}–${fmt(mon)}`
  }

  const grouped: Record<string, any[]> = {}
  orders.forEach(o => {
    const key = getWeekKey(o.delivery_date)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(o)
  })

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div>
      <h1>My Orders</h1>
      <p className="page-subtitle">
        All your submitted orders, most recent first.
      </p>

      {orders.length === 0 ? (
        <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
          No orders yet.{' '}
          <a href="/order" style={{ color: 'var(--accent)' }}>Place your first order →</a>
        </p>
      ) : (
        Object.entries(grouped).map(([weekLabel, weekOrders]) => (
          <div key={weekLabel} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12, color: 'var(--gray-600)' }}>
              Week of {weekLabel}
            </h2>
            {weekOrders.map(order => {
              const colors = statusColors(order.status)
              return (
                <div key={order.id} style={{
                  border: '1px solid var(--gray-200)',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {fmtDate(order.delivery_date)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                        {totalLoaves(order)} loaves
                        {order.customer_notes && ` · "${order.customer_notes}"`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 12,
                      padding: '3px 10px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      marginLeft: 12,
                      ...colors,
                    }}>
                      {statusLabel(order.status, order.is_par)}
                    </span>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {order.order_items?.map((item: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '4px 0', fontSize: 13 }}>{item.product.name}</td>
                          <td style={{ padding: '4px 0', fontSize: 12, color: 'var(--gray-500)' }}>
                            {item.sliced ? 'sliced' : ''}
                          </td>
                          <td style={{ padding: '4px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>
                            ×{item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}