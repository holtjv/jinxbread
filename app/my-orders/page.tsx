'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [pars, setPars] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [expandedFutureWeeks, setExpandedFutureWeeks] = useState<Set<string>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const supabase = createClient()

  async function loadOrders(targetId: string) {
    const [ordersRes, parsRes, prodsRes, windowsRes] = await Promise.all([
      supabase.from('orders').select(`
        id, delivery_date, delivery_window_id, status, is_par, customer_notes, submitted_at,
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

  function fmtWeekRange(tuesdayDate: Date): string {
    const mon = new Date(tuesdayDate)
    mon.setDate(tuesdayDate.getDate() + 6)
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(tuesdayDate)}–${fmt(mon)}`
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

  function isThisWeek(dateStr: string): boolean {
    const d = new Date(dateStr + 'T12:00:00')
    return d >= getCurrentTuesday() && d <= getCurrentMonday()
  }

  function isFutureWeek(dateStr: string): boolean {
    const d = new Date(dateStr + 'T12:00:00')
    return d > getCurrentMonday()
  }

  function isPastWeek(dateStr: string): boolean {
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

  function toggleOrder(id: string) {
    setExpandedOrders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFutureWeek(key: string) {
    setExpandedFutureWeeks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Build upcoming week delivery rows by merging pars + submitted one-time orders
  function buildUpcomingRows() {
    const tue = getCurrentTuesday()
    const thisWeekManualOrders = orders.filter(o => isThisWeek(o.delivery_date) && !o.is_par)

    return deliveryWindows.map(w => {
      // Par quantities for this window
      const windowPars = pars.filter(p => p.delivery_window_id === w.id && p.quantity > 0)
      const parItems: { name: string; quantity: number }[] = windowPars.map(p => ({
        name: products.find(pr => pr.id === p.product_id)?.name || '',
        quantity: p.quantity,
      })).filter(i => i.name)
      const parTotal = parItems.reduce((t, i) => t + i.quantity, 0)

      // One-time order for this window this week
      const manualOrder = thisWeekManualOrders.find(o => o.delivery_window_id === w.id)
      const addedItems: { name: string; quantity: number }[] = manualOrder?.order_items
        ?.map((item: any) => ({ name: item.product?.name || '', quantity: item.quantity }))
        ?.filter((i: any) => i.name) || []
      const addedTotal = addedItems.reduce((t, i) => t + i.quantity, 0)

      const combinedTotal = parTotal + addedTotal

      if (combinedTotal === 0) return null

      // Delivery date for this window
      const offsets: Record<string, number> = {
        tuesday: 0, wednesday: 1, thursday: 2,
        friday: 3, saturday: 4, sunday: 5, monday: 6,
      }
      const deliveryDate = new Date(tue)
      deliveryDate.setDate(tue.getDate() + (offsets[w.day_of_week] ?? 0))
      const dateStr = deliveryDate.toISOString().split('T')[0]

      return {
        windowId: w.id,
        dateStr,
        dateLabel: fmtDate(dateStr),
        parItems,
        parTotal,
        addedItems,
        addedTotal,
        combinedTotal,
        manualOrderId: manualOrder?.id || null,
        status: manualOrder?.status || 'pending',
        editable: isEditable(dateStr),
        editUrl: getEditUrl(dateStr),
        customerNotes: manualOrder?.customer_notes || null,
      }
    }).filter(Boolean)
  }

  const upcomingRows = buildUpcomingRows()
  const hasPars = pars.some(p => p.quantity > 0)
  const cutoffSunday = getNextCutoffSunday()

  const futureOrders = orders.filter(o => isFutureWeek(o.delivery_date))
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
  const futureByWeek: Record<string, any[]> = {}
  futureOrders.forEach(o => {
    const tue = getWeekTuesday(o.delivery_date)
    const key = fmtWeekRange(tue)
    if (!futureByWeek[key]) futureByWeek[key] = []
    futureByWeek[key].push(o)
  })

  const pastOrders = orders.filter(o => isPastWeek(o.delivery_date))
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))

  const hasUpcoming = upcomingRows.length > 0 || futureOrders.length > 0
  const hasAnyContent = hasUpcoming || pastOrders.length > 0

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

  function PastOrderRow({ order }: { order: any }) {
    const expanded = expandedOrders.has(order.id)
    const loaves = totalLoaves(order)
    const colors = statusColors(order.status)
    const editable = isEditable(order.delivery_date)
    return (
      <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
        <div
          onClick={() => toggleOrder(order.id)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: 'var(--gray-50)' }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 2 }}>
              {fmtDate(order.delivery_date)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              {order.is_par ? 'Standing order' : 'One-time order'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{loaves} loaves</span>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, ...colors }}>
              {statusLabel(order.status, order.is_par)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--gray-400)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
          </div>
        </div>
        {expanded && (
          <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--gray-100)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {order.order_items?.map((item: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--gray-100)' : 'none' }}>
                    <td style={{ padding: '4px 0', fontSize: 13 }}>{item.product.name}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>×{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.customer_notes && (
              <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '8px 0 0 0' }}>Note: {order.customer_notes}</p>
            )}
            {editable && (
              <a href={getEditUrl(order.delivery_date)} style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                Edit order →
              </a>
            )}
          </div>
        )}
      </div>
    )
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

      {!hasAnyContent && !hasPars ? (
        <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
          No orders yet.{' '}
          <a href="/order" style={{ color: 'var(--accent)' }}>Place your first order →</a>
        </p>
      ) : (
        <>
          {/* Upcoming section */}
          {(upcomingRows.length > 0 || futureOrders.length > 0) && (
            <>
              <div style={{ ...dividerStyle, marginTop: 8 }}>
                <span style={dividerLabelStyle}>Upcoming</span>
                <div style={dividerLineStyle} />
                <span style={{ fontSize: 11, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
                  Cutoff {cutoffSunday.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at noon
                </span>
              </div>

              {/* This week — merged par + manual rows */}
              {upcomingRows.map((row: any) => {
                const expanded = expandedOrders.has(row.windowId)
                return (
                  <div key={row.windowId} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleOrder(row.windowId)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: 'var(--gray-50)' }}
                    >
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-900)', marginBottom: 2 }}>
                          {row.dateLabel}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                          {row.parTotal > 0 && row.addedTotal > 0
                            ? `${row.parTotal} standing · ${row.addedTotal} added`
                            : row.parTotal > 0
                            ? 'Standing order'
                            : 'One-time order'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{row.combinedTotal} loaves</span>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#fff3cd', color: '#856404' }}>
                          Submitted
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--gray-400)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--gray-100)' }}>
                        {/* Standing items */}
                        {row.parItems.length > 0 && (
                          <>
                            {row.addedTotal > 0 && (
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Standing</div>
                            )}
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: row.addedTotal > 0 ? 10 : 0 }}>
                              <tbody>
                                {row.parItems.map((item: any, i: number) => (
                                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--gray-100)' : 'none' }}>
                                    <td style={{ padding: '4px 0', fontSize: 13 }}>{item.name}</td>
                                    <td style={{ padding: '4px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>×{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                        {/* Added items */}
                        {row.addedItems.length > 0 && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Added</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <tbody>
                                {row.addedItems.map((item: any, i: number) => (
                                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--gray-100)' : 'none' }}>
                                    <td style={{ padding: '4px 0', fontSize: 13 }}>{item.name}</td>
                                    <td style={{ padding: '4px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>×{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                        {row.customerNotes && (
                          <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: '8px 0 0 0' }}>Note: {row.customerNotes}</p>
                        )}
                        {row.editable && (
                          <a href={row.editUrl} style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                            Edit order →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Future weeks — collapsed by week */}
              {Object.entries(futureByWeek).map(([weekLabel, weekOrders]) => {
                const expanded = expandedFutureWeeks.has(weekLabel)
                const loaves = weekOrders.reduce((t, o) => t + totalLoaves(o), 0)
                const editable = weekOrders.some(o => isEditable(o.delivery_date))
                const editUrl = getEditUrl(weekOrders[0].delivery_date)
                return (
                  <div key={weekLabel} style={{ border: '1px dashed var(--gray-300)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleFutureWeek(weekLabel)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: 'var(--gray-50)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)' }}>{weekLabel}</span>
                        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                          {weekOrders.length} {weekOrders.length === 1 ? 'order' : 'orders'} · {loaves} loaves
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1' }}>
                          Submitted
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--gray-400)', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ borderTop: '1px solid var(--gray-100)' }}>
                        {weekOrders.map((order, idx) => (
                          <div key={order.id} style={{ padding: '10px 16px', borderBottom: idx < weekOrders.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)' }}>{fmtDate(order.delivery_date)}</div>
                                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{order.is_par ? 'Standing order' : 'One-time order'}</div>
                              </div>
                              <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{totalLoaves(order)} loaves</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <tbody>
                                {order.order_items?.map((item: any, i: number) => (
                                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--gray-100)' : 'none' }}>
                                    <td style={{ padding: '3px 0', fontSize: 13 }}>{item.product.name}</td>
                                    <td style={{ padding: '3px 0', textAlign: 'right', fontSize: 13, fontWeight: 500 }}>×{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {editable && (
                              <a href={editUrl} style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                                Edit order →
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Previous weeks */}
          {pastOrders.length > 0 && (
            <>
              <div style={dividerStyle}>
                <span style={dividerLabelStyle}>Previous weeks</span>
                <div style={dividerLineStyle} />
              </div>
              {pastOrders.map(order => (
                <PastOrderRow key={order.id} order={order} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}