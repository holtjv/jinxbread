'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Tab = 'orders' | 'pricing'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [customerProducts, setCustomerProducts] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceSaved, setPriceSaved] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [ordersRes, customersRes, productsRes, cpRes] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id,
            delivery_date,
            status,
            is_par,
            customer:customers (name, type),
            order_items (
              quantity,
              sliced,
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

      setLoading(false)
    }
    load()
  }, [])

  // When selected customer changes, populate price inputs
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

  // ── Orders tab logic ──────────────────────────────────────────
  const dates = [...new Set(orders.map((o: any) => o.delivery_date))].sort()
  const dateOrders = orders.filter((o: any) => o.delivery_date === selectedDate)

  const totals: Record<string, any> = {}
  dateOrders.forEach((order: any) => {
    order.order_items?.forEach((line: any) => {
      const key = `${line.product.sku}|${line.sliced}`
      if (!totals[key]) {
        totals[key] = {
          name: line.product.name,
          sku: line.product.sku,
          sliced: line.sliced,
          quantity: 0,
        }
      }
      totals[key].quantity += line.quantity
    })
  })

  const totalsList = Object.values(totals).sort((a: any, b: any) =>
    a.name.localeCompare(b.name)
  )

  // ── Pricing tab logic ─────────────────────────────────────────
  async function handleSavePrices() {
    if (!selectedCustomerId) return
    setSavingPrices(true)
    setPriceSaved(false)
    setPriceError(null)

    // Delete existing custom prices for this customer
    const { error: deleteError } = await supabase
      .from('customer_products')
      .delete()
      .eq('customer_id', selectedCustomerId)

    if (deleteError) {
      setPriceError('Error saving: ' + deleteError.message)
      setSavingPrices(false)
      return
    }

    // Insert rows where a custom price was entered
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

    // Update local state
    setCustomerProducts(prev => [
      ...prev.filter(cp => cp.customer_id !== selectedCustomerId),
      ...rows,
    ])

    setSavingPrices(false)
    setPriceSaved(true)
    setTimeout(() => setPriceSaved(false), 4000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div>
      <h1>Admin</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '2px solid var(--gray-200)' }}>
        {(['orders', 'pricing'] as Tab[]).map(t => (
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
              textTransform: 'capitalize',
            }}
          >
            {t === 'orders' ? 'Orders' : 'Customer Pricing'}
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

      {/* ── PRICING TAB ── */}
      {tab === 'pricing' && (
        <div style={{ maxWidth: 640 }}>
          <p className="page-subtitle">
            Set custom prices per customer. Leave blank to use the default product price.
          </p>

          {/* Customer selector */}
          <div style={{ marginBottom: 32 }}>
            <label className="form-label">Customer</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {customers.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  style={{
                    padding: '8px 16px',
                    background: selectedCustomerId === c.id ? 'var(--accent)' : 'var(--gray-100)',
                    color: selectedCustomerId === c.id ? '#fff' : 'var(--gray-900)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    fontSize: 13,
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Price table */}
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