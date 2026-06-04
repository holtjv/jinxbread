'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [pars, setPars] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const supabase = createClient()

  async function loadOrders(targetId: string) {
    const [ordersRes, parsRes, prodsRes, windowsRes] = await Promise.all([
      supabase.from('orders').select(`
        id, delivery_date, delivery_window_id, status, is_par, customer_notes, submitted_at,
        delivery_window:delivery_windows (label, day_of_week),
        order_items (quantity, sliced, product:products (name, sku))
      `).eq('customer_id', targetId).order('delivery_date', { ascending: false }),
      supabase.from('customer_pars').select('product_id, delivery_window_id, quantity').eq('customer_id', targetId),
      supabase.from('products').select('id, name, sku').eq('active', true).order('sort_order'),
      supabase.from('delivery_windows').select('id, label, day_of_week, sort_order').eq('active', true).order('sort_order'),
    ])
    if (!ordersRes.error) setOrders(ordersRes.data || [])
    setPars(parsRes.data || [])
    setProducts(prodsRes.data || [])
    setDeliveryWindows((windowsRes.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order))
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: cu } = await supabase
        .from('customer_users')
        .select('customer_id, customers(id, is_admin)')
        .eq('email', user.email)
        .single()
      if (!cu) return
      const customer = cu.customers as any
      const cid = cu.customer_id
      let targetId = cid

      if (customer.is_admin) {
        setIsAdmin(true)
        const { data: customers } = await supabase.from('customers').select('id, name').eq('active', true).order('name')
        setAllCustomers(customers || [])
        const stored = sessionStorage.getItem('adminSelectedCustomerId')
        if (stored) targetId = stored
      }

      setSelectedCustomerId(targetId)
      await loadOrders(targetId)
      setLoading(false)
    }
    load()
  }, [])

  async function handleCustomerChange(newId: string) {
    const c = allCustomers.find(c => c.id === newId)
    setSelectedCustomerId(newId)
    sessionStorage.setItem('adminSelectedCustomerId', newId)
    sessionStorage.setItem('adminSelectedCustomerName', c?.name || '')
    setOrders([])
    setPars([])
    await loadOrders(newId)
  }

  function fmtDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  function statusColors(status: string) {
    switch (status) {
      case 'fulfilled': return { background: '#d4edda', color: '#155724' }
      case 'confirmed': case 'in_production': return { background: '#cce5ff', color: '#004085' }
      case 'cancelled': return { background: '#f8d7da', color: '#721c24' }
      default: return { background: '#fff3cd', color: '#856404' }
    }
  }

  function statusLabel(status: string, isPar: boolean) {
    const labels: Record<string, string> = {
      pending: 'Submitted', confirmed: 'Confirmed', in_production: 'In Production',
      fulfilled: 'Delivered', cancelled: 'Cancelled',
    }
    let label = labels[status] || status
    if (isPar && status === 'pending') label = 'Auto-submitted (par)'
    return label
  }

  function totalLoaves(order: any) {
    return order.order_items?.reduce((t: number, i: any) => t + i.quantity, 0) || 0
  }

  function getWeekTuesday(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00')
    const day = d.getDay()
    let tueDiff = 2 - day
    if (tueDiff > 0) tueDiff -= 7
    const tue = new Date(d)
    tue.setDate(d.getDate() + tueDiff)
    return tue
  }

  function getWeekKey(dateStr: string) {
    const tue = getWeekTuesday(dateStr)
    const mon = new Date(tue)
    mon.setDate(tue.getDate() + 6)
    const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(tue)}–${fmt(mon)}`
  }

  function isEditable(dateStr: string) {
    const tue = getWeekTuesday(dateStr)
    const cutoff = new Date(tue)
    cutoff.setDate(tue.getDate() - 2)
    cutoff.setHours(12, 0, 0, 0)
    return new Date() < cutoff
  }

  function getEditUrl(dateStr: string) {
    return '/order?tue=' + getWeekTuesday(dateStr).toISOString().split('T')[0]
  }

  function toggleWeek(key: string) {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function weekStatusSummary(weekOrders: any[]) {
    if (weekOrders.every(o => o.status === 'fulfilled')) return { label: 'Delivered', ...statusColors('fulfilled') }
    if (weekOrders.some(o => o.status === 'in_production')) return { label: 'In Production', ...statusColors('in_production') }
    if (weekOrders.some(o => o.status === 'confirmed')) return { label: 'Confirmed', ...statusColors('confirmed') }
    if (weekOrders.some(o => o.status === 'cancelled')) return { label: 'Cancelled', ...statusColors('cancelled') }
    return { label: 'Submitted', ...statusColors('pending') }
  }

  function getUpcomingTuesday(): Date {
    const today = new Date()
    const day = today.getDay()
    let tueDiff = 2 - day
    if (tueDiff <= 0) tueDiff += 7
    if (day === 0 && today.getHours() >= 12) tueDiff += 7
    const tue = new Date(today)
    tue.setDate(today.getDate() + tueDiff)
    tue.setHours(0, 0, 0, 0)
    return tue
  }

  function getUpcomingWeekKey(): string {
    const tue = getUpcomingTuesday()
    const mon = new Date(tue)
    mon.setDate(tue.getDate() + 6)
    const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(tue)}–${fmt(mon)}`
  }

  function getUpcomingSunday(): Date {
    const tue = getUpcomingTuesday()
    const sun = new Date(tue)
    sun.setDate(tue.getDate() - 2)
    return sun
  }

  function hasPars(): boolean {
    return pars.some(p => p.quantity > 0)
  }

  function upcomingWeekHasOrders(): boolean {
    const upcomingKey = getUpcomingWeekKey()
    return orders.some(o => getWeekKey(o.delivery_date) === upcomingKey && o.is_par === true)
  }

  const grouped: Record<string, any[]> = {}
  orders.forEach(o => {
    const key = getWeekKey(o.delivery_date)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(o)
  })
  Object.keys(grouped).forEach(key => grouped[key].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date)))

  const showParPreview = hasPars() && !upcomingWeekHasOrders()
  const upcomingWeekKey = getUpcomingWeekKey()
  const upcomingSunday = getUpcomingSunday()

  const parByWindow: Record<string, { windowLabel: string; items: { name: string; quantity: number }[] }> = {}
  deliveryWindows.forEach(w => {
    const items = pars
      .filter(p => p.delivery_window_id === w.id && p.quantity > 0)
      .map(p => ({
        name: products.find(pr => pr.id === p.product_id)?.name || p.product_id,
        quantity: p.quantity,
      }))
    if (items.length > 0) {
      parByWindow[w.id] = { windowLabel: w.label || w.day_of_week, items }
    }
  })
  const parTotalLoaves = pars.reduce((t, p) => t + (p.quantity || 0), 0)

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div>
      <h1>My Orders</h1>

      {isAdmin && (
        <div style={{
          background: '#fffbeb', border: '1px solid #f59e0b',
          borderRadius: 8, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>Viewing as:</span>
          <select
            value={selectedCustomerId || ''}
            onChange={e => handleCustomerChange(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', fontFamily: 'var(--font)', color: 'var(--gray-900)', cursor: 'pointer' }}
          >
            {allCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <p className="page-subtitle">Your submitted orders by week.</p>

      <div style={{ marginTop: 24 }}>

        {/* Par preview card */}
        {showParPreview && (
          <div style={{ border: '2px dashed var(--gray-300)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--gray-50)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Week of {upcomingWeekKey}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{parTotalLoaves} loaves</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                    Standing order — submits Sunday at 1pm
                  </span>
                </div>
              </div>
              <a href="/par" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Edit standing order →
              </a>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {Object.values(parByWindow).map((win, idx) => (
                <div key={idx} style={{ marginBottom: idx < Object.values(parByWindow).length - 1 ? 12 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {win.windowLabel}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {win.items.map((item, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '4px 0', fontSize: 13 }}>{item.name}</td>
                          <td style={{ padding: '4px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>×{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12, marginBottom: 0 }}>
                Submits automatically on {upcomingSunday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at 1:00pm.
              </p>
            </div>
          </div>
        )}

        {orders.length === 0 && !showParPreview ? (
          <p style={{ color: 'var(--gray-500)' }}>
            No orders yet.{' '}
            <a href="/order" style={{ color: 'var(--accent)' }}>Place your first order →</a>
          </p>
        ) : (
          Object.entries(grouped).map(([weekLabel, weekOrders]) => {
            const isExpanded = expandedWeeks.has(weekLabel)
            const editable = weekOrders.some(o => isEditable(o.delivery_date))
            const totalForWeek = weekOrders.reduce((t, o) => t + totalLoaves(o), 0)
            const editUrl = getEditUrl(weekOrders[0].delivery_date)
            const summary = weekStatusSummary(weekOrders)

            return (
              <div key={weekLabel} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--gray-50)', borderBottom: isExpanded ? '1px solid var(--gray-200)' : 'none' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Week of {weekLabel}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                        {totalForWeek} loaves · {weekOrders.length} {weekOrders.length === 1 ? 'delivery' : 'deliveries'}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: summary.background, color: summary.color, fontWeight: 500 }}>
                        {summary.label}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editable && (
                      <a href={editUrl} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', textDecoration: 'none', padding: '7px 16px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        Edit order
                      </a>
                    )}
                    <button
                      onClick={() => toggleWeek(weekLabel)}
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', background: '#fff', border: '1px solid var(--gray-200)', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)' }}
                    >
                      {isExpanded ? 'Hide details' : 'View details'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div>
                    {weekOrders.map((order, idx) => {
                      const colors = statusColors(order.status)
                      return (
                        <div key={order.id} style={{ padding: '14px 20px', borderTop: idx > 0 ? '1px solid var(--gray-100)' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{fmtDate(order.delivery_date)}</div>
                              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                                {order.is_par ? 'Standing order' : 'One-time order'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{totalLoaves(order)} loaves</span>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', ...colors }}>
                                {statusLabel(order.status, order.is_par)}
                              </span>
                            </div>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {order.order_items?.map((item: any, i: number) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--gray-100)' }}>
                                  <td style={{ padding: '4px 0', fontSize: 13 }}>{item.product.name}</td>
                                  <td style={{ padding: '4px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>×{item.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {order.customer_notes && (
                            <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '8px 0 0 0' }}>Note: {order.customer_notes}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}