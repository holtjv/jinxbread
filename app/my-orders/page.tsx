'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())

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

      if (!error) {
        setOrders(data || [])
        // Auto-expand the most recent week
        if (data && data.length > 0) {
          const firstWeek = getWeekKey(data[0].delivery_date)
          setExpandedWeeks(new Set([firstWeek]))
        }
      }
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

  function getWeekTuesday(dateStr: string): Date {
    const d = new Date(dateStr + 'T12:00:00')
    const day = d.getDay()
    let tueDiff = 2 - day
    if (tueDiff > 0) tueDiff -= 7
    const tue = new Date(d)
    tue.setDate(d.getDate() + tueDiff)
    return tue
  }

  function getWeekKey(dateStr: string): string {
    const tue = getWeekTuesday(dateStr)
    const mon = new Date(tue)
    mon.setDate(tue.getDate() + 6)
    const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(tue)}–${fmt(mon)}`
  }

  function isEditable(dateStr: string): boolean {
    const tue = getWeekTuesday(dateStr)
    const cutoffSunday = new Date(tue)
    cutoffSunday.setDate(tue.getDate() - 2)
    cutoffSunday.setHours(12, 0, 0, 0)
    return new Date() < cutoffSunday
  }

  function getEditUrl(dateStr: string): string {
    const tue = getWeekTuesday(dateStr)
    const tueStr = tue.toISOString().split('T')[0]
    return `/order?tue=${tueStr}`
  }

  function toggleWeek(weekKey: string) {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(weekKey)) {
        next.delete(weekKey)
      } else {
        next.add(weekKey)
      }
      return next
    })
  }

  // Group and sort orders by week
  const grouped: Record<string, any[]> = {}
  orders.forEach(o => {
    const key = getWeekKey(o.delivery_date)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(o)
  })
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
  })

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div>
      <h1>My Orders</h1>
      <p className="page-subtitle">Your submitted orders by week.</p>

      {orders.length === 0 ? (
        <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
          No orders yet.{' '}
          <a href="/order" style={{ color: 'var(--accent)' }}>Place your first order →</a>
        </p>
      ) : (
        <div style={{ marginTop: 24 }}>
          {Object.entries(grouped).map(([weekLabel, weekOrders]) => {
            const isExpanded = expandedWeeks.has(weekLabel)
            const editable = weekOrders.some(o => isEditable(o.delivery_date))
            const totalForWeek = weekOrders.reduce((t, o) => t + totalLoaves(o), 0)
            const editUrl = getEditUrl(weekOrders[0].delivery_date)

            return (
              <div key={weekLabel} style={{
                border: '1px solid var(--gray-200)',
                borderRadius: 8,
                marginBottom: 8,
                overflow: 'hidden',
              }}>
                {/* Week header row */}
                <div
                  onClick={() => toggleWeek(weekLabel)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--gray-50)' : '#fff',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      Week of {weekLabel}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                      {totalForWeek} loaves · {weekOrders.length} {weekOrders.length === 1 ? 'delivery' : 'deliveries'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editable && (
                      
                        href={editUrl}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        style={{
                          fontSize: 12,
                          color: 'var(--accent)',
                          fontWeight: 500,
                          textDecoration: 'none',
                          padding: '3px 10px',
                          border: '1px solid var(--accent)',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Edit order
                      </a>
                    )}
                  </div>
                </div>

                {/* Expanded order details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--gray-100)', padding: '12px 16px' }}>
                    {weekOrders.map(order => {
                      const colors = statusColors(order.status)
                      return (
                        <div key={order.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--gray-100)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>
                              {fmtDate(order.delivery_date)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                                {totalLoaves(order)} loaves
                              </span>
                              <span style={{
                                fontSize: 12, padding: '2px 8px', borderRadius: 4,
                                whiteSpace: 'nowrap', ...colors,
                              }}>
                                {statusLabel(order.status, order.is_par)}
                              </span>
                            </div>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {order.order_items?.map((item: any, i: number) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--gray-100)' }}>
                                  <td style={{ padding: '3px 0', fontSize: 13 }}>{item.product.name}</td>
                                  <td style={{ padding: '3px 0', fontSize: 12, color: 'var(--gray-500)' }}>
                                    {item.sliced ? 'sliced' : ''}
                                  </td>
                                  <td style={{ padding: '3px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>
                                    ×{item.quantity}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {order.customer_notes && (
                            <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '8px 0 0 0' }}>
                              Note: {order.customer_notes}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}