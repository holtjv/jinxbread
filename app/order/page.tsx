'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function OrderPage() {
  const [products, setProducts] = useState<any[]>([])
  const [parProductIds, setParProductIds] = useState<Set<string>>(new Set())
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({})
  const [lines, setLines] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [notes, setNotes] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

      let parQtyMap: Record<string, Record<string, number>> = {}
      let parIds = new Set<string>()

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
          prices?.forEach((p: any) => { priceMap[p.product_id] = p.price_cents })
          setCustomerPrices(priceMap)

          const { data: pars } = await supabase
            .from('customer_pars')
            .select('product_id, delivery_window_id, quantity')
            .eq('customer_id', customer.id)

          parIds = new Set<string>(pars?.map((p: any) => p.product_id) || [])
          pars?.forEach((p: any) => {
            if (!parQtyMap[p.delivery_window_id]) parQtyMap[p.delivery_window_id] = {}
            parQtyMap[p.delivery_window_id][p.product_id] = p.quantity
          })
          setParProductIds(parIds)
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

      const sortedWindows = (windows || []).sort((a: any, b: any) => a.sort_order - b.sort_order)

      setProducts(prods || [])
      setDeliveryWindows(sortedWindows)

      const initial: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
      sortedWindows.forEach((w: any) => {
        initial[w.id] = {}
        prods?.forEach((p: any) => {
          initial[w.id][p.id] = {
            quantity: parQtyMap[w.id]?.[p.id] || 0,
            sliced: false,
          }
        })
      })

      setLines(initial)
      setLoading(false)
    }
    load()
  }, [])

  function getNextDeliveryDate(dayOfWeek: string): Date {
    const today = new Date()
    const current = today.getDay()
    let tueDiff = 2 - current
    if (tueDiff <= 0) tueDiff += 7
    const nextTue = new Date(today)
    nextTue.setDate(today.getDate() + tueDiff)
    const tuWeekOrder: Record<string, number> = {
      tuesday: 0, wednesday: 1, thursday: 2,
      friday: 3, saturday: 4, sunday: 5, monday: 6,
    }
    const result = new Date(nextTue)
    result.setDate(nextTue.getDate() + tuWeekOrder[dayOfWeek])
    return result
  }

  function getUpcomingSunday(): Date {
    // The Sunday before the delivery week (cutoff day)
    const tuesday = getNextDeliveryDate('tuesday')
    const sunday = new Date(tuesday)
    sunday.setDate(tuesday.getDate() - 2)
    return sunday
  }

  function getWeekRange(): string {
    const start = getNextDeliveryDate('tuesday')
    const end = getNextDeliveryDate('monday')
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(start)}–${fmt(end)}`
  }

  function getCutoffString(): string {
    const sunday = getUpcomingSunday()
    return sunday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  function isOrderingOpen(): boolean {
    const now = new Date()
    const sunday = getUpcomingSunday()
    const cutoff = new Date(sunday)
    cutoff.setHours(12, 0, 0, 0)
    return now < cutoff
  }

  function getPrice(product: any) {
    const cents = customerPrices[product.id] ?? product.price_cents
    if (!cents) return null
    return (cents / 100).toFixed(2)
  }

  function updateQuantity(windowId: string, productId: string, value: string) {
    setLines(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        [productId]: { ...prev[windowId][productId], quantity: Math.max(0, parseInt(value) || 0) }
      }
    }))
  }

  function updateSliced(windowId: string, productId: string, value: boolean) {
    setLines(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        [productId]: { ...prev[windowId][productId], sliced: value }
      }
    }))
  }

  function colTotal(windowId: string) {
    return Object.values(lines[windowId] || {}).reduce((t, l) => t + (l.quantity || 0), 0)
  }

  function totalItems() {
    return deliveryWindows.reduce((t, w) => t + colTotal(w.id), 0)
  }

  const parProducts = products.filter(p => parProductIds.has(p.id))
  const otherProducts = products.filter(p => !parProductIds.has(p.id))

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

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', customerId)
        .eq('delivery_window_id', w.id)
        .eq('delivery_date', dateStr)
        .maybeSingle()

      let orderId: string

      if (existingOrder) {
        orderId = existingOrder.id
        await supabase.from('order_items').delete().eq('order_id', orderId)
        await supabase
          .from('orders')
          .update({
            status: 'pending',
            is_par: false,
            customer_notes: notes || null,
            submitted_at: new Date().toISOString(),
          })
          .eq('id', orderId)
      } else {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id: customerId,
            delivery_window_id: w.id,
            delivery_date: dateStr,
            status: 'pending',
            is_par: false,
            customer_notes: notes || null,
            submitted_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (orderError || !order) {
          setError(orderError?.message || 'Error creating order')
          setSubmitting(false)
          return
        }

        orderId = order.id
      }

      const orderItems = Object.entries(lines[w.id])
        .filter(([_, line]) => line.quantity > 0)
        .map(([productId, line]) => ({
          order_id: orderId,
          customer_id: customerId,
          product_id: productId,
          delivery_window_id: w.id,
          quantity: line.quantity,
          sliced: line.sliced,
        }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) {
        setError(itemsError.message)
        setSubmitting(false)
        return
      }
    }

    router.push(`/order/confirmation?week=${encodeURIComponent(getWeekRange())}`)
  }

  if (loading) return <main style={{ padding: 40 }}>Loading...</main>

  const orderingOpen = isOrderingOpen()
  const weekRange = getWeekRange()
  const cutoffString = getCutoffString()

  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  }

  function renderProductRows(productList: any[]) {
    return productList.map(p => (
      <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
        <td style={{ padding: '6px 12px 6px 0', fontSize: 14 }}>
          <div>{p.name}</div>
          {p.can_be_sliced && (
            <div style={{ fontSize: 11, color: '#bbb' }}>sliceable</div>
          )}
        </td>
        <td style={{ padding: '6px 16px 6px 0', textAlign: 'right', fontSize: 13, color: '#666' }}>
          {getPrice(p) ? `$${getPrice(p)}` : '—'}
        </td>
        {deliveryWindows.map(w => {
          const line = lines[w.id]?.[p.id]
          return (
            <td key={w.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
              <input
                type="number"
                min="0"
                value={line?.quantity || 0}
                onChange={e => updateQuantity(w.id, p.id, e.target.value)}
                disabled={!orderingOpen}
                style={{
                  width: 54,
                  padding: '4px 6px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  textAlign: 'center',
                  fontSize: 14,
                  color: '#000',
                  background: line?.quantity > 0 ? '#f0f7ff' : '#fff',
                }}
              />
              {p.can_be_sliced && line?.quantity > 0 && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <label style={{ color: '#666', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={line?.sliced || false}
                      onChange={e => updateSliced(w.id, p.id, e.target.checked)}
                      disabled={!orderingOpen}
                      style={{ marginRight: 3 }}
                    />
                    sliced
                  </label>
                </div>
              )}
            </td>
          )
        })}
      </tr>
    ))
  }

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ marginBottom: 4 }}>This Week's Order</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        Deliveries for {weekRange}. Changes here won't affect your standing order.
        Orders close {cutoffString} at noon.
      </p>

      {!orderingOpen && (
        <p style={{
          background: '#fff3cd',
          color: '#856404',
          padding: '12px 16px',
          borderRadius: 6,
          marginBottom: 24,
        }}>
          Orders for {weekRange} are closed — the {cutoffString} noon deadline has passed.
          Showing the following week below.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', minWidth: 200 }}>Product</th>
              <th style={{ textAlign: 'right', padding: '8px 16px 8px 0', minWidth: 60, color: '#999', fontWeight: 'normal', fontSize: 13 }}>Price</th>
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
            {parProducts.length > 0 && (
              <>
                {renderProductRows(parProducts)}
                <tr>
                  <td
                    colSpan={2 + deliveryWindows.length}
                    style={{
                      padding: '6px 0',
                      fontSize: 11,
                      color: '#999',
                      borderBottom: '1px dashed #ddd',
                      borderTop: '1px dashed #ddd',
                    }}
                  >
                    Other products
                  </td>
                </tr>
              </>
            )}
            {renderProductRows(otherProducts)}
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

      <div style={{ marginTop: 24 }}>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: '#444' }}>
          Notes / special instructions (optional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={!orderingOpen}
          placeholder="e.g. back door delivery, skip the rye this week..."
          rows={3}
          style={{
            width: '100%',
            padding: 10,
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
            color: '#000',
            resize: 'vertical',
          }}
        />
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