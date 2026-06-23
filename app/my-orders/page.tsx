'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [pars, setPars] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false)
  const supabase = createClient()

  async function loadOrders(targetId: string) {
    const [ordersRes, parsRes, prodsRes, windowsRes] = await Promise.all([
      supabase.from('orders').select(`
        id, delivery_date, delivery_window_id, status, is_par, customer_notes, submitted_at, updated_at,
        delivery_window:delivery_windows (label, day_of_week),
        order_items (quantity, sliced, product_id, product:products (name, sku))
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
      } else {
        sessionStorage.removeItem('adminSelectedCustomerId')
        sessionStorage.removeItem('adminSelectedCustomerName')
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

  function statusLabel(status: string, isPar: boolean) {
    const labels: Record<string, string> = {
      pending: 'Submitted', confirmed: 'Confirmed', in_production: 'In Production',
      fulfilled: 'Delivered', cancelled: 'Cancelled',
    }
    if (isPar && status === 'pending') return 'Standing order'
    return labels[status] || status
  }

  function totalLoaves(order: any) {
    return order.order_items?.reduce((t: number, i: any) => t + i.quantity, 0) || 0
  }

  function getWeekTuesday(dateStr: string): Date {
    const d = new Date(dateStr + 'T12:00:00')
    const day = d.getDay()
    let tueDiff = 2 - day
    if (tueDiff > 0) tueDiff -= 7
    const tue = new Date(d)
    tue.setDate(d.getDate() + tueDiff)
    tue.setHours(0, 0, 0, 0)
    return tue
  }

  function getCurrentTuesday(): Date {
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

  function getCurrentMonday(): Date {
    const tue = getCurrentTuesday()
    const mon = new Date(tue)
    mon.setDate(tue.getDate() + 6)
    mon.setHours(23, 59, 59, 999)
    return mon
  }

  function getNextCutoffSunday(): Date {
    const tue = getCurrentTuesday()
    const sun = new Date(tue)
    sun.setDate(tue.getDate() + 5)
    return sun
  }

  function isUpcoming(dateStr: string): boolean {
    const d = new Date(dateStr + 'T12:00:00')
    return d >= getCurrentTuesday()
  }

  function isPast(dateStr: string): boolean {
    const d = new Date(dateStr + 'T12:00:00')
    return d < getCurrentTuesday()
  }

  function isEditable(dateStr: string): boolean {
    const tue = getWeekTuesday(dateStr)
    const cutoff = new Date(tue)
    cutoff.setDate(tue.getDate() - 2)
    cutoff.setHours(12, 0, 0, 0)
    return new Date() < cutoff
  }

  function getEditUrl(dateStr: string): string {
    return '/order?tue=' + getWeekTuesday(dateStr).toISOString().split('T')[0]
  }

  function toggleRow(key: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function fmtCancelledAt(updatedAt: string) {
    return new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  async function handleCancelOrder() {
    if (!cancellingOrderId) return
    setIsCancelSubmitting(true)
    try {
      const res = await fetch('/api/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [cancellingOrderId] }),
      })
      if (res.ok) {
        setOrders(orders.map(o => o.id === cancellingOrderId ? { ...o, status: 'cancelled' } : o))
        setCancellingOrderId(null)
      }
    } finally {
      setIsCancelSubmitting(false)
    }
  }

  function buildUpcomingRows() {
    const tue = getCurrentTuesday()
    const upcomingManualOrders = orders.filter(o => isUpcoming(o.delivery_date) && !o.is_par)
    const rows: any[] = []
    const weeksToShow = 4

    for (let weekIdx = 0; weekIdx < weeksToShow; weekIdx++) {
      const weekTue = new Date(tue)
      weekTue.setDate(tue.getDate() + weekIdx * 7)
      const weekMon = new Date(weekTue)
      weekMon.setDate(weekTue.getDate() + 6)
      weekMon.setHours(23, 59, 59, 999)

      const offsets: Record<string, number> = {
        tuesday: 0, wednesday: 1, thursday: 2,
        friday: 3, saturday: 4, sunday: 5, monday: 6,
      }

      deliveryWindows.forEach(w => {
        const deliveryDate = new Date(weekTue)
        deliveryDate.setDate(weekTue.getDate() + (offsets[w.day_of_week] ?? 0))
        const dateStr = deliveryDate.toISOString().split('T')[0]

        const windowPars = pars.filter(p => p.delivery_window_id === w.id && p.quantity > 0)
        const parItems = windowPars.map(p => ({
          name: products.find(pr => pr.id === p.product_id)?.name || '',
          quantity: p.quantity,
        })).filter(i => i.name)
        const parTotal = parItems.reduce((t, i) => t + i.quantity, 0)

        const manualOrders = upcomingManualOrders.filter(o => {
          const od = new Date(o.delivery_date + 'T12:00:00')
          return o.delivery_window_id === w.id && od >= weekTue && od <= weekMon
        })

        // Active (non-cancelled) order merges with PAR items into the primary row
        const activeOrder = manualOrders.find(o => o.status !== 'cancelled') || null
        const addedItems = activeOrder?.order_items
          ?.map((item: any) => ({ name: item.product?.name || '', quantity: item.quantity }))
          ?.filter((i: any) => i.name) || []
        const addedTotal = addedItems.reduce((t: number, i: any) => t + i.quantity, 0)
        const combinedTotal = parTotal + addedTotal

        if (combinedTotal > 0 || activeOrder) {
          rows.push({
            key: activeOrder ? `order-${activeOrder.id}` : `${weekIdx}-${w.id}`,
            dateStr,
            dateLabel: fmtDate(dateStr),
            parItems,
            parTotal,
            addedItems,
            addedTotal,
            combinedTotal,
            manualOrderId: activeOrder?.id || null,
            status: activeOrder?.status || null,
            isCancelled: false,
            cancelledAt: null,
            editable: isEditable(dateStr),
            editUrl: getEditUrl(dateStr),
            customerNotes: activeOrder?.customer_notes || null,
          })
        }

        // Cancelled orders each get their own separate row
        manualOrders.filter(o => o.status === 'cancelled').forEach(cancelled => {
          rows.push({
            key: `order-${cancelled.id}`,
            dateStr,
            dateLabel: fmtDate(dateStr),
            parItems: [],
            parTotal: 0,
            addedItems: [],
            addedTotal: 0,
            combinedTotal: 0,
            manualOrderId: cancelled.id,
            status: 'cancelled',
            isCancelled: true,
            cancelledAt: cancelled.updated_at,
            editable: false,
            editUrl: getEditUrl(dateStr),
            customerNotes: null,
          })
        })
      })
    }

    return rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr))
  }

  const upcomingRows = buildUpcomingRows()
  const cutoffSunday = getNextCutoffSunday()
  const pastOrders = orders.filter(o => isPast(o.delivery_date))
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))
  const hasAnyContent = upcomingRows.length > 0 || pastOrders.length > 0

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const dividerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px',
  }
  const dividerLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--gray-500)',
    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
  }
  const dividerLineStyle: React.CSSProperties = {
    flex: 1, height: 1, background: 'var(--gray-200)',
  }

  return (
    <div>
      <h1>My Orders</h1>

      {isAdmin && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>Viewing as:</span>
          <select
            value={selectedCustomerId || ''}
            onChange={e => handleCustomerChange(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', fontFamily: 'var(--font)', color: 'var(--gray-900)', cursor: 'pointer' }}
          >
            {allCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {!hasAnyContent ? (
        <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
          No orders yet.{' '}
          <a href="/order" style={{ color: 'var(--accent)' }}>Place your first order →</a>
        </p>
      ) : (
        <>
          {upcomingRows.length > 0 && (
            <>
              <div style={{ ...dividerStyle, marginTop: 8 }}>
                <span style={dividerLabelStyle}>Upcoming</span>
                <div style={dividerLineStyle} />
                <span style={{ fontSize: 11, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
                  Cutoff {cutoffSunday.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at noon
                </span>
              </div>

              {upcomingRows.map(row => {
                const expanded = expandedRows.has(row.key)
                return (
                  <div key={row.key} style={{ border: `1px solid ${row.isCancelled ? 'var(--gray-200)' : 'var(--gray-200)'}`, borderRadius: 8, marginBottom: 6, overflow: 'hidden', opacity: row.isCancelled ? 0.6 : 1 }}>
                    <div
                      onClick={() => toggleRow(row.key)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: row.isCancelled ? 'var(--gray-100)' : 'var(--gray-50)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: 'var(--gray-400)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', minWidth: 10 }}>›</span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: row.isCancelled ? 'var(--gray-500)' : 'var(--gray-900)', marginBottom: 2 }}>
                            {row.dateLabel}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                            {row.isCancelled
                              ? (row.cancelledAt ? `Cancelled ${fmtCancelledAt(row.cancelledAt)}` : 'Cancelled')
                              : row.parTotal > 0 && row.addedTotal > 0
                                ? `${row.parTotal} standing · ${row.addedTotal} added`
                                : row.parTotal > 0 ? 'Standing order'
                                : 'One-time order'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {row.isCancelled
                          ? <span style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#fee2e2', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.03em' }}>Cancelled</span>
                          : <>
                              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{row.combinedTotal} loaves</span>
                              {row.editable
                                ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <a href={row.editUrl} onClick={e => e.stopPropagation()} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Edit</a>
                                    <a onClick={e => { e.stopPropagation(); setCancellingOrderId(row.manualOrderId) }} style={{ fontSize: 13, color: '#dc2626', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}>Cancel</a>
                                  </div>
                                : <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>Submitted</span>
                              }
                            </>
                        }
                      </div>
                    </div>
                    {expanded && !row.isCancelled && (
                      <div style={{ padding: '8px 16px 12px 36px', borderTop: '1px solid var(--gray-100)' }}>
                        {row.parItems.length > 0 && (
                          <>
                            {row.addedTotal > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4, marginBottom: 2 }}>Standing</div>
                            )}
                            {row.parItems.map((item: any, i: number) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-600)', padding: '2px 0' }}>
                                <span>{item.name}</span>
                                <span>×{item.quantity}</span>
                              </div>
                            ))}
                          </>
                        )}
                        {row.addedItems.length > 0 && (
                          <>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 8, marginBottom: 2 }}>Added</div>
                            {row.addedItems.map((item: any, i: number) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-600)', padding: '2px 0' }}>
                                <span>{item.name}</span>
                                <span>×{item.quantity}</span>
                              </div>
                            ))}
                          </>
                        )}
                        {row.customerNotes && (
                          <p style={{ fontSize: 11, color: 'var(--gray-500)', margin: '6px 0 0 0' }}>Note: {row.customerNotes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {pastOrders.length > 0 && (
            <>
              <div style={dividerStyle}>
                <span style={dividerLabelStyle}>Previous weeks</span>
                <div style={dividerLineStyle} />
              </div>
              {pastOrders.map(order => {
                const expanded = expandedRows.has(order.id)
                const loaves = totalLoaves(order)
                const isCancelled = order.status === 'cancelled'
                const editable = isEditable(order.delivery_date) && !isCancelled
                return (
                  <div key={order.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: 6, overflow: 'hidden', opacity: isCancelled ? 0.6 : 1 }}>
                    <div
                      onClick={() => toggleRow(order.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: isCancelled ? 'var(--gray-100)' : 'var(--gray-50)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: 'var(--gray-400)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', minWidth: 10 }}>›</span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: isCancelled ? 'var(--gray-500)' : 'var(--gray-900)', marginBottom: 2 }}>
                            {fmtDate(order.delivery_date)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                            {isCancelled
                              ? (order.updated_at ? `Cancelled ${fmtCancelledAt(order.updated_at)}` : 'Cancelled')
                              : order.is_par ? 'Standing order' : 'One-time order'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {isCancelled
                          ? <span style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#fee2e2', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.03em' }}>Cancelled</span>
                          : <>
                              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{loaves} loaves</span>
                              {editable
                                ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <a href={getEditUrl(order.delivery_date)} onClick={e => e.stopPropagation()} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Edit</a>
                                    <a onClick={e => { e.stopPropagation(); setCancellingOrderId(order.id) }} style={{ fontSize: 13, color: '#dc2626', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}>Cancel</a>
                                  </div>
                                : <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>{statusLabel(order.status, order.is_par)}</span>
                              }
                            </>
                        }
                      </div>
                    </div>
                    {expanded && !isCancelled && (
                      <div style={{ padding: '8px 16px 12px 36px', borderTop: '1px solid var(--gray-100)' }}>
                        {order.order_items?.map((item: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-600)', padding: '2px 0' }}>
                            <span>{item.product.name}</span>
                            <span>×{item.quantity}</span>
                          </div>
                        ))}
                        {order.customer_notes && (
                          <p style={{ fontSize: 11, color: 'var(--gray-500)', margin: '6px 0 0 0' }}>Note: {order.customer_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {cancellingOrderId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px 0', color: 'var(--gray-900)' }}>Cancel order?</h2>
            <p style={{ fontSize: 14, color: 'var(--gray-600)', margin: '0 0 24px 0' }}>Are you sure you want to cancel this order? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCancellingOrderId(null)}
                disabled={isCancelSubmitting}
                style={{ fontSize: 14, padding: '8px 16px', borderRadius: 6, border: '1px solid var(--gray-300)', background: 'white', color: 'var(--gray-700)', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Keep order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={isCancelSubmitting}
                style={{ fontSize: 14, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: 'white', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                {isCancelSubmitting ? 'Cancelling...' : 'Cancel order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}