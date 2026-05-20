'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Tab = 'orders' | 'thisweek' | 'pricing'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [customerProducts, setCustomerProducts] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceSaved, setPriceSaved] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const supabase = createClient()

  // Returns the upcoming delivery week (Tue–Mon) and each day's exact date
  function getUpcomingWeek() {
    const today = new Date()
    const day = today.getDay()
    let tueDiff = 2 - day
    if (tueDiff <= 0) tueDiff += 7
    const tuesday = new Date(today)
    tuesday.setDate(today.getDate() + tueDiff)
    tuesday.setHours(0, 0, 0, 0)

    const monday = new Date(tuesday)
    monday.setDate(tuesday.getDate() + 6)
    monday.setHours(23, 59, 59, 999)

    // Upcoming Sunday (cutoff day)
    const sunday = new Date(tuesday)
    sunday.setDate(tuesday.getDate() - 2)

    return { tuesday, monday, sunday }
  }

  // Given a delivery window's day_of_week, return its exact date this week
  function getWindowDate(dayOfWeek: string, tuesday: Date): Date {
    const offsets: Record<string, number> = {
      tuesday: 0, wednesday: 1, thursday: 2,
      friday: 3, saturday: 4, sunday: 5, monday: 6,
    }
    const d = new Date(tuesday)
    d.setDate(tuesday.getDate() + (offsets[dayOfWeek] ?? 0))
    return d
  }

  function fmtDate(d: Date, opts?: Intl.DateTimeFormatOptions) {
    return d.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric' })
  }

  function fmtDateFull(d: Date) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  useEffect(() => {
    async function load() {
      const [ordersRes, customersRes, productsRes, cpRes, windowsRes] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id,
            delivery_date,
            delivery_window_id,
            status,
            is_par,
            customer_id,
            customer:customers (id, name, type),
            order_items (
              quantity,
              sliced,
              product_id,
              product:products (name, sku)
            )
          `)
          .order('delivery_date', { ascending: true }),
        supabase
          .from('customers')
          .select('id, name')
          .eq('active', true)
          .order('name'),
        supabase
          .from('products')
          .select('id, name, sku, price_cents, unit_label')
          .eq('active', true)
          .order('sort_order'),
        supabase
          .from('customer_products')
          .select('customer_id, product_id, price_cents'),
        supabase
          .from('delivery_windows')
          .select('*')
          .eq('active', true)
          .order('sort_order'),
      ])

      if (ordersRes.data) {
        setOrders(ordersRes.data)
        if (ordersRes.data.length > 0) {
          setSelectedDate(ordersRes.data[0].delivery_date)
        }
      }
      if (customersRes.data) {
        setCustomers(customersRes.data)
        setSelectedCustomerId(customersRes.data[0]?.id || null)
      }
      if (productsRes.data) setProducts(productsRes.data)
      if (cpRes.data) setCustomerProducts(cpRes.data)
      if (windowsRes.data) setDeliveryWindows(windowsRes.data)

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedCustomerId) return
    const map: Record<string, string> = {}
    customerProducts
      .filter(cp => cp.customer_id === selectedCustomerId)
      .forEach(cp => {
        map[cp.product_id] = (cp.price_cents / 100).toFixed(2)
      })
    setPrices(map)
  }, [selectedCustomerId, customerProducts])

  // ── Orders tab ────────────────────────────────────────────────
  const dates = [...new Set(orders.map((o: any) => o.delivery_date))].sort()
  const dateOrders = orders.filter((o: any) => o.delivery_date === selectedDate)

  const totals: Record<string, any> = {}
  dateOrders.forEach((order: any) => {
    order.order_items?.forEach((line: any) => {
      const key = `${line.product.sku}|${line.sliced}`
      if (!totals[key]) {
        totals[key] = { name: line.product.name, sku: line.product.sku, sliced: line.sliced, quantity: 0 }
      }
      totals[key].quantity += line.quantity
    })
  })
  const totalsList = Object.values(totals).sort((a: any, b: any) => a.name.localeCompare(b.name))

  // ── This Week tab ─────────────────────────────────────────────
  const { tuesday, monday, sunday } = getUpcomingWeek()

  const thisWeekOrders = orders.filter((o: any) => {
    const d = new Date(o.delivery_date + 'T12:00:00')
    return d >= tuesday && d <= monday
  })

  const weekOrderMap: Record<string, Record<string, any>> = {}
  thisWeekOrders.forEach((o: any) => {
    if (!weekOrderMap[o.customer_id]) weekOrderMap[o.customer_id] = {}
    weekOrderMap[o.customer_id][o.delivery_window_id] = o
  })

  const thisWeekCustomerIds = [...new Set(thisWeekOrders.map((o: any) => o.customer_id))]
  const thisWeekCustomers = customers.filter(c => thisWeekCustomerIds.includes(c.id))

  // ── Pricing tab ───────────────────────────────────────────────
  async function handleSavePrices() {
    if (!selectedCustomerId) return
    setSavingPrices(true)
    setPriceSaved(false)
    setPriceError(null)

    const { error: deleteError } = await supabase
      .from('customer_products')
      .delete()
      .eq('customer_id', selectedCustomerId)

    if (deleteError) {
      setPriceError('Error saving: ' + deleteError.message)
      setSavingPrices(false)
      return
    }

    const rows = Object.entries(prices)
      .filter(([_, val]) => val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > 0)
      .map(([productId, val]) => ({
        customer_id: selectedCustomerId,
        product_id: productId,
        price_cents: Math.round(parseFloat(val) * 100),
      }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('customer_products')
        .insert(rows)

      if (insertError) {
        setPriceError('Error saving: ' + insertError.message)
        setSavingPrices(false)
        return
      }
    }

    setCustomerProducts(prev => [
      ...prev.filter(cp => cp.customer_id !== selectedCustomerId),
      ...rows,
    ])

    setSavingPrices(false)
    setPriceSaved(true)
    setTimeout(() => setPriceSaved(false), 4000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const tabLabels: Record<Tab, string> = {
    orders: 'Orders',
    thisweek: 'This Week',
    pricing: 'Customer Pricing',
  }

  return (
    <div>
      <h1>Admin</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '2px solid var(--gray-200)' }}>
        {(['orders', 'thisweek', 'pricing'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              fontSize: 14,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--gray-500)',
            }}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* ── ORDERS TAB ── */}
      {tab === 'orders' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            {dates.map((date: any) => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                style={{
                  padding: '8px 16px',
                  background: selectedDate === date ? 'var(--accent)' : 'var(--gray-100)',
                  color: selectedDate === date ? '#fff' : 'var(--gray-900)',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  fontSize: 13,
                }}
              >
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric'
                })}
              </button>
            ))}
          </div>

          {selectedDate && (
            <>
              <h2>Production totals</h2>
              {totalsList.length === 0 ? (
                <p style={{ color: 'var(--gray-500)' }}>No orders for this date.</p>
              ) : (
                <table className="data-table" style={{ marginBottom: 40 }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Sliced</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalsList.map((t: any, i: number) => (
                      <tr key={i}>
                        <td>{t.name}</td>
                        <td style={{ color: 'var(--gray-500)' }}>{t.sku}</td>
                        <td>{t.sliced ? 'Yes' : '—'}</td>
                        <td style={{ fontWeight: 600 }}>{t.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h2>Orders ({dateOrders.length})</h2>
              {dateOrders.map((order: any) => (
                <div key={order.id} style={{
                  border: '1px solid var(--gray-200)',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>{order.customer.name}</strong>
                    <span style={{
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: order.status === 'confirmed' ? '#d4edda' : '#fff3cd',
                      color: order.status === 'confirmed' ? '#155724' : '#856404',
                    }}>
                      {order.status}{order.is_par ? ' (par)' : ''}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {order.order_items?.map((line: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '4px 0' }}>{line.product.name}</td>
                          <td style={{ padding: '4px 0', color: 'var(--gray-500)', fontSize: 13 }}>
                            {line.sliced ? 'sliced' : ''}
                          </td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}>x{line.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ── THIS WEEK TAB ── */}
      {tab === 'thisweek' && (
        <>
          <p className="page-subtitle">
            Orders for {fmtDate(tuesday)} – {fmtDate(monday)}.
            Cutoff is {fmtDateFull(sunday)} at noon.
          </p>

          {thisWeekCustomers.length === 0 ? (
            <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
              No orders yet for {fmtDate(tuesday)} – {fmtDate(monday)}.
              Standing orders will auto-submit {fmtDateFull(sunday)} at 1:00pm.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Customer</th>
                    {deliveryWindows.map(w => {
                      const winDate = getWindowDate(w.day_of_week, tuesday)
                      return (
                        <th key={w.id} className="center" style={{ minWidth: 120 }}>
                          <div>{winDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
                          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--gray-500)' }}>
                            {fmtDate(winDate, { month: 'short', day: 'numeric' })}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {thisWeekCustomers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      {deliveryWindows.map(w => {
                        const order = weekOrderMap[c.id]?.[w.id]
                        if (!order) {
                          return (
                            <td key={w.id} className="center" style={{ color: 'var(--gray-300)' }}>
                              —
                            </td>
                          )
                        }
                        const total = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0
                        return (
                          <td key={w.id} className="center">
                            <div style={{ fontWeight: 600 }}>{total} loaves</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                              {order.is_par ? 'par' : 'manual'}
                            </div>
                            <div style={{ marginTop: 6 }}>
                              {order.order_items?.map((item: any, i: number) => (
                                <div key={i} style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.4 }}>
                                  {item.quantity}× {item.product.sku}
                                  {item.sliced ? ' (sl)' : ''}
                                </div>
                              ))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── PRICING TAB ── */}
      {tab === 'pricing' && (
        <div style={{ maxWidth: 640 }}>
          <p className="page-subtitle">
            Set custom prices per customer. Leave blank to use the default product price.
          </p>

          <div style={{ marginBottom: 32 }}>
            <label className="form-label">Customer</label>
            <select
              value={selectedCustomerId || ''}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="text-input"
              style={{ maxWidth: 320, marginTop: 8 }}
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedCustomerId && (
            <>
              <table className="data-table" style={{ marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Default price</th>
                    <th style={{ textAlign: 'right' }}>Custom price</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{p.sku}</div>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--gray-500)' }}>
                        {p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={p.price_cents ? (p.price_cents / 100).toFixed(2) : '0.00'}
                            value={prices[p.id] ?? ''}
                            onChange={e => setPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="qty-input"
                            style={{ width: 80, textAlign: 'right' }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  onClick={handleSavePrices}
                  disabled={savingPrices}
                  className="btn btn-primary"
                >
                  {savingPrices ? 'Saving...' : 'Save prices'}
                </button>
                {priceSaved && (
                  <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>
                    ✓ Prices saved
                  </span>
                )}
                {priceError && (
                  <span className="alert alert-error" style={{ margin: 0, padding: '6px 12px' }}>
                    {priceError}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}