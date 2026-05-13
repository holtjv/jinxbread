'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function OrderPage() {
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({})
  const [lines, setLines] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('email', user.email)
          .single()

        if (customer) {
          setCustomerId(customer.id)

          const { data: prices } = await supabase
            .from('customer_products')
            .select('product_id, price_cents')
            .eq('customer_id', customer.id)

          const priceMap: Record<string, number> = {}
          prices?.forEach((p: any) => {
            priceMap[p.product_id] = p.price_cents
          })
          setCustomerPrices(priceMap)
        }
      }

      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('sort_order')

      const { data: windows } = await supabase
        .from('delivery_windows')
        .select('*')
        .eq('active', true)
        .order('sort_order')

      setProducts(prods || [])
      setDeliveryWindows((windows || []).sort((a: any, b: any) => a.sort_order - b.sort_order))

      const initial: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
      windows?.forEach((w: any) => {
        initial[w.id] = {}
        prods?.forEach((p: any) => {
          initial[w.id][p.id] = { quantity: 0, sliced: false }
        })
      })
      setLines(initial)
      setLoading(false)
    }
    load()
  }, [])

  function getPrice(product: any) {
    const cents = customerPrices[product.id] ?? product.price_cents
    if (!cents) return null
    return (cents / 100).toFixed(2)
  }

  function getNextDeliveryDate(dayOfWeek: string) {
    const dayIndex: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 }
    const target = dayIndex[dayOfWeek]
    const today = new Date()
    const current = today.getDay()

    let tueDiff = 2 - current
    if (tueDiff <= 0) tueDiff += 7

    const nextTue = new Date(today)
    nextTue.setDate(today.getDate() + tueDiff)

    const tuWeekOrder: Record<string, number> = { tuesday:0, wednesday:1, thursday:2, friday:3, saturday:4, sunday:5, monday:6 }
    const offset = tuWeekOrder[dayOfWeek]

    const result = new Date(nextTue)
    result.setDate(nextTue.getDate() + offset)
    return result
  }

  function isOrderingOpen() {
    const now = new Date()
    const day = now.getDay()
    const daysUntilSunday = day === 0 ? 7 : 7 - day
    const sunday = new Date(now)
    sunday.setDate(now.getDate() + daysUntilSunday)
    sunday.setHours(12, 0, 0, 0)
    return now < sunday
  }

  function updateQuantity(windowId: string, productId: string, value: string) {
    setLines(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        [productId]: {
          ...prev[windowId][productId],
          quantity: Math.max(0, parseInt(value) || 0)
        }
      }
    }))
  }

  function updateSliced(windowId: string, productId: string, value: boolean) {
    setLines(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        [productId]: {
          ...prev[windowId][productId],
          sliced: value
        }
      }
    }))
  }

  function colTotal(windowId: string) {
    return Object.values(lines[windowId] || {}).reduce((t, l) => t + (l.quantity || 0), 0)
  }

  function totalItems() {
    return deliveryWindows.reduce((t, w) => t + colTotal(w.id), 0)
  }

  async function handleSubmit() {
    if (!customerId) {
      setError('No customer account found. Please contact the bakery.')
      return
    }
    if (totalItems() === 0) {
      setError('Please add at least one item before submitting.')
      return
    }

    setSubmitting(true)
    setError(null)

    const windowsWithItems = deliveryWindows.filter(w => colTotal(w.id) > 0)

    for (const w of windowsWithItems) {
      const deliveryDate = getNextDeliveryDate(w.day_of_week)
      const dateStr = deliveryDate.toISOString().split('T')[0]

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: customerId,
          delivery_window_id: w.id,
          delivery_date: dateStr,
          status: 'pending',
          is_par: false,
        })
        .select()
        .single()

      if (orderError) {
        setError(orderError.message)
        setSubmitting(false)
        return
      }

      const orderLines = Object.entries(lines[w.id])
        .filter(([_, line]) => line.quantity > 0)
        .map(([productId, line]) => ({
          order_id: order.id,
          product_id: productId,
          quantity: line.quantity,
          sliced: line.sliced,
        }))

      const { error: linesError } = await supabase
        .from('order_lines')
        .insert(orderLines)

      if (linesError) {
        setError(linesError.message)
        setSubmitting(false)
        return
      }
    }

    router.push('/order/confirmation')
  }

  if (loading) return <main style={{ padding: 40 }}>Loading...</main>

  const orderingOpen = isOrderingOpen()

  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  }

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px' }}>
      <h1>Place an Order</h1>

      {!orderingOpen && (
        <p style={{
          background: '#fff3cd',
          color: '#856404',
          padding: '12px 16px',
          borderRadius: 6,
          marginBottom: 24,
        }}>
          Orders for this week are closed. Ordering opens Monday and closes Sunday at noon.
        </p>
      )}

      <p style={{ color: '#666', marginBottom: 24 }}>
        Enter quantities for each day. Leave empty to skip. Orders close Sunday at noon.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', minWidth: 200 }}>
                Product
              </th>
              <th style={{ textAlign: 'right', padding: '8px 16px 8px 0', minWidth: 60, color: '#999', fontWeight: 'normal', fontSize: 13 }}>
                Price
              </th>
              {deliveryWindows.map(w => (
                <th key={w.id} style={{ padding: '8px 8px', textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontWeight: 600 }}>{dayShort[w.day_of_week]}</div>
                  <div style={{ fontSize: 11, color: '#999', fontWeight: 'normal' }}>
                    {getNextDeliveryDate(w.day_of_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '6px 12px 6px 0', fontSize: 14 }}>
                  {p.name}
                  {p.can_be_sliced && (
                    <span style={{ fontSize: 11, color: '#bbb', marginLeft: 6 }}>sliceable</span>
                  )}
                </td>
                <td style={{ padding: '6px 16px 6px 0', textAlign: 'right', fontSize: 13, color: '#666' }}>
                  {getPrice(p) ? `$${getPrice(p)}` : '—'}
                </td>
                {deliveryWindows.map(w => (
                  <td key={w.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      value={lines[w.id]?.[p.id]?.quantity || 0}
                      onChange={e => updateQuantity(w.id, p.id, e.target.value)}
                      disabled={!orderingOpen}
                      style={{
                        width: 54,
                        padding: '4px 6px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        textAlign: 'center',
                        fontSize: 14,
                        background: lines[w.id]?.[p.id]?.quantity > 0 ? '#f0f7ff' : '#fff',
                      }}
                    />
                    {p.can_be_sliced && lines[w.id]?.[p.id]?.quantity > 0 && (
                      <div style={{ fontSize: 11, marginTop: 2 }}>
                        <label style={{ color: '#666', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={lines[w.id]?.[p.id]?.sliced || false}
                            onChange={e => updateSliced(w.id, p.id, e.target.checked)}
                            disabled={!orderingOpen}
                            style={{ marginRight: 3 }}
                          />
                          sliced
                        </label>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}

            <tr style={{ borderTop: '2px solid #eee', fontWeight: 600 }}>
              <td style={{ padding: '8px 12px 8px 0', fontSize: 13, color: '#666' }}>Total loaves</td>
              <td></td>
              {deliveryWindows.map(w => (
                <td key={w.id} style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>
                  {colTotal(w.id) > 0 ? colTotal(w.id) : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {error && <p style={{ color: 'red', margin: '16px 0' }}>{error}</p>}

      <div style={{ marginTop: 24, marginBottom: 60 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !orderingOpen}
          style={{
            padding: '12px 40px',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: orderingOpen ? 'pointer' : 'not-allowed',
            fontSize: 16,
          }}
        >
          {submitting ? 'Submitting...' : `Submit order (${totalItems()} loaves)`}
        </button>
      </div>
    </main>
  )
}
