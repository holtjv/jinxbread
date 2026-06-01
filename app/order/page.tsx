'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../lib/supabase'

function OrderPageInner() {
  const searchParams = useSearchParams()
  const tueParam = searchParams.get('tue')

  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({})
  const [parQtyMap, setParQtyMap] = useState<Record<string, Record<string, number>>>({})
  const [parSlicedMap, setParSlicedMap] = useState<Record<string, Record<string, boolean>>>({})
  const [additions, setAdditions] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [existingOrders, setExistingOrders] = useState<any[]>([])
  const [notes, setNotes] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'order' | 'confirm'>('order')
  const [weekOffset, setWeekOffset] = useState(0)
  const supabase = createClient()

  function isPastCutoff(): boolean {
    const now = new Date()
    return now.getDay() === 0 && now.getHours() >= 12
  }

  function getBaseTuesday(): Date {
    if (tueParam) {
      const d = new Date(tueParam + 'T12:00:00')
      d.setHours(0, 0, 0, 0)
      return d
    }
    const today = new Date()
    const day = today.getDay()
    let tueDiff = 2 - day
    if (tueDiff <= 0) tueDiff += 7
    if (isPastCutoff()) tueDiff += 7
    const tue = new Date(today)
    tue.setDate(today.getDate() + tueDiff)
    tue.setHours(0, 0, 0, 0)
    return tue
  }

  function getSelectedTuesday(): Date {
    const base = getBaseTuesday()
    const tue = new Date(base)
    tue.setDate(base.getDate() + weekOffset * 7)
    return tue
  }

  function getDeliveryDate(dayOfWeek: string, tuesday?: Date): Date {
    const tue = tuesday || getSelectedTuesday()
    const offsets: Record<string, number> = {
      tuesday: 0, wednesday: 1, thursday: 2,
      friday: 3, saturday: 4, sunday: 5, monday: 6,
    }
    const d = new Date(tue)
    d.setDate(tue.getDate() + (offsets[dayOfWeek] ?? 0))
    return d
  }

  function getSelectedSunday(): Date {
    const tue = getSelectedTuesday()
    const sun = new Date(tue)
    sun.setDate(tue.getDate() - 2)
    return sun
  }

  function getWeekRange(tuesday?: Date): string {
    const tue = tuesday || getSelectedTuesday()
    const mon = getDeliveryDate('monday', tue)
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(tue)}–${fmt(mon)}`
  }

  function getCutoffString(): string {
    const sunday = getSelectedSunday()
    return sunday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  function getWeekStart(): string {
    return getSelectedTuesday().toISOString().split('T')[0]
  }

  function getWeekEnd(): string {
    return getDeliveryDate('monday').toISOString().split('T')[0]
  }

  function getExistingOrderForWindow(windowId: string): any | null {
    const weekStart = getWeekStart()
    const weekEnd = getWeekEnd()
    return existingOrders.find(o =>
      o.delivery_window_id === windowId &&
      o.delivery_date >= weekStart &&
      o.delivery_date <= weekEnd
    ) || null
  }

  function hasExistingOrderThisWeek(): boolean {
    const weekStart = getWeekStart()
    const weekEnd = getWeekEnd()
    return existingOrders.some(o =>
      o.delivery_date >= weekStart &&
      o.delivery_date <= weekEnd
    )
  }

  async function loadCustomerData(targetId: string, prods: any[], windows: any[]) {
    const [pricesRes, parsRes, ordersRes] = await Promise.all([
      supabase.from('customer_products').select('product_id, price_cents').eq('customer_id', targetId),
      supabase.from('customer_pars').select('product_id, delivery_window_id, quantity, sliced').eq('customer_id', targetId),
      supabase.from('orders').select(`
        id, delivery_date, delivery_window_id, status, is_par, customer_notes,
        order_items (product_id, quantity, sliced)
      `).eq('customer_id', targetId),
    ])

    const priceMap: Record<string, number> = {}
    pricesRes.data?.forEach((p: any) => { priceMap[p.product_id] = p.price_cents })
    setCustomerPrices(priceMap)

    const pqMap: Record<string, Record<string, number>> = {}
    const psMap: Record<string, Record<string, boolean>> = {}
    parsRes.data?.forEach((p: any) => {
      if (!pqMap[p.delivery_window_id]) pqMap[p.delivery_window_id] = {}
      if (!psMap[p.delivery_window_id]) psMap[p.delivery_window_id] = {}
      pqMap[p.delivery_window_id][p.product_id] = p.quantity
      psMap[p.delivery_window_id][p.product_id] = p.sliced
    })
    setParQtyMap(pqMap)
    setParSlicedMap(psMap)
    setExistingOrders(ordersRes.data || [])

    const initAdditions: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
    windows.forEach((w: any) => {
      initAdditions[w.id] = {}
      prods.forEach((p: any) => {
        initAdditions[w.id][p.id] = { quantity: 0, sliced: false }
      })
    })
    setAdditions(initAdditions)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('id, is_admin')
        .eq('email', user.email)
        .single()

      if (!customer) return
      setCustomerId(customer.id)

      const [prodsRes, windowsRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('sort_order'),
        supabase.from('delivery_windows').select('*').eq('active', true).order('sort_order'),
      ])

      const sortedWindows = (windowsRes.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
      const prods = prodsRes.data || []
      setProducts(prods)
      setDeliveryWindows(sortedWindows)

      let targetId = customer.id

      if (customer.is_admin) {
        setIsAdmin(true)
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name')
          .eq('active', true)
          .order('name')
        setAllCustomers(customers || [])
        const stored = sessionStorage.getItem('adminSelectedCustomerId')
        if (stored) targetId = stored
      }

      setSelectedCustomerId(targetId)
      await loadCustomerData(targetId, prods, sortedWindows)

      if (!tueParam) {
        const baseTue = (() => {
          const today = new Date()
          const day = today.getDay()
          let tueDiff = 2 - day
          if (tueDiff <= 0) tueDiff += 7
          if (today.getDay() === 0 && today.getHours() >= 12) tueDiff += 7
          const tue = new Date(today)
          tue.setDate(today.getDate() + tueDiff)
          tue.setHours(0, 0, 0, 0)
          return tue
        })()
        const baseWeekStart = baseTue.toISOString().split('T')[0]
        const baseWeekEnd = new Date(new Date(baseTue).setDate(baseTue.getDate() + 6)).toISOString().split('T')[0]
        const hasOrderThisWeek = (await supabase.from('orders').select('id, delivery_date')
          .eq('customer_id', targetId)
          .gte('delivery_date', baseWeekStart)
          .lte('delivery_date', baseWeekEnd)).data?.length ?? 0
        if (hasOrderThisWeek > 0) setWeekOffset(1)
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!products.length || !deliveryWindows.length || !selectedCustomerId) return

    const newAdditions: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
    deliveryWindows.forEach((w: any) => {
      newAdditions[w.id] = {}
      products.forEach((p: any) => {
        newAdditions[w.id][p.id] = { quantity: 0, sliced: false }
      })
      const existingOrder = getExistingOrderForWindow(w.id)
      if (existingOrder) {
        existingOrder.order_items?.forEach((item: any) => {
          const parQty = parQtyMap[w.id]?.[item.product_id] || 0
          const additionalQty = Math.max(0, item.quantity - parQty)
          newAdditions[w.id][item.product_id] = {
            quantity: additionalQty,
            sliced: item.sliced,
          }
        })
      }
    })
    setAdditions(newAdditions)
    setNotes(existingOrders.find(o => {
      const ws = getWeekStart()
      const we = getWeekEnd()
      return o.delivery_date >= ws && o.delivery_date <= we && o.customer_notes
    })?.customer_notes || '')
    setStep('order')
    setError(null)
  }, [weekOffset, existingOrders, products, deliveryWindows, selectedCustomerId])

  async function handleCustomerChange(newId: string) {
    const customer = allCustomers.find(c => c.id === newId)
    setSelectedCustomerId(newId)
    sessionStorage.setItem('adminSelectedCustomerId', newId)
    sessionStorage.setItem('adminSelectedCustomerName', customer?.name || '')
    setWeekOffset(0)
    setStep('order')
    setError(null)
    await loadCustomerData(newId, products, deliveryWindows)
  }

  function getPriceCents(product: any): number | null {
    return customerPrices[product.id] ?? product.price_cents ?? null
  }

  function getPrice(product: any): string | null {
    const cents = getPriceCents(product)
    if (!cents) return null
    return (cents / 100).toFixed(2)
  }

  function fmtMoney(cents: number): string {
    return '$' + (cents / 100).toFixed(2)
  }

  function weeklyLineTotalCents(product: any): number {
    const cents = getPriceCents(product)
    if (!cents) return 0
    return cents * weeklyMergedTotal(product.id)
  }

  function orderWeekTotalCents(): number {
    return products.reduce((t, p) => t + weeklyLineTotalCents(p), 0)
  }

  function windowLineTotalCents(windowId: string, product: any): number {
    const cents = getPriceCents(product)
    if (!cents) return 0
    return cents * mergedQty(windowId, product.id)
  }

  function windowTotalCents(windowId: string): number {
    return products.reduce((t, p) => t + windowLineTotalCents(windowId, p), 0)
  }

  function updateAddition(windowId: string, productId: string, field: 'quantity' | 'sliced', value: any) {
    setAdditions(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        [productId]: {
          ...prev[windowId][productId],
          [field]: field === 'quantity' ? Math.max(0, parseInt(value) || 0) : value,
        }
      }
    }))
  }

  function mergedQty(windowId: string, productId: string): number {
    return (parQtyMap[windowId]?.[productId] || 0) + (additions[windowId]?.[productId]?.quantity || 0)
  }

  function mergedSliced(windowId: string, productId: string): boolean {
    return (parSlicedMap[windowId]?.[productId] || false) || (additions[windowId]?.[productId]?.sliced || false)
  }

  function weeklyMergedTotal(productId: string): number {
    return deliveryWindows.reduce((t, w) => t + mergedQty(w.id, productId), 0)
  }

  function hasAnyPar(): boolean {
    return Object.values(parQtyMap).some(w => Object.values(w).some(q => q > 0))
  }

  function colParTotal(windowId: string): number {
    return Object.values(parQtyMap[windowId] || {}).reduce((t, q) => t + q, 0)
  }

  function colAddTotal(windowId: string): number {
    return Object.values(additions[windowId] || {}).reduce((t, l) => t + (l.quantity || 0), 0)
  }

  function colMergedTotal(windowId: string): number {
    return colParTotal(windowId) + colAddTotal(windowId)
  }

  function totalMergedItems(): number {
    return deliveryWindows.reduce((t, w) => t + colMergedTotal(w.id), 0)
  }

  function mergedOrderLines(windowId: string) {
    return products.filter(p => mergedQty(windowId, p.id) > 0)
  }

  async function handleSubmit() {
    if (!selectedCustomerId) {
      setError('No customer selected.')
      return
    }
    if (totalMergedItems() === 0) {
      setError('No items in your order.')
      return
    }

    const violations: string[] = []
    products.forEach(p => {
      const total = weeklyMergedTotal(p.id)
      const min = p.minimum_quantity ?? 10
      if (total > 0 && total < min) {
        violations.push(`${p.name} requires a minimum of ${min}/week (you have ${total})`)
      }
    })
    if (violations.length > 0) {
      setError(violations.join(' · '))
      setSubmitting(false)
      return
    }

    setSubmitting(true)
    setError(null)

    const weekStart = getWeekStart()
    const weekEnd = getWeekEnd()
    const windowsWithItems = deliveryWindows.filter(w => colMergedTotal(w.id) > 0)

    for (const w of windowsWithItems) {
      const deliveryDate = getDeliveryDate(w.day_of_week)
      const dateStr = deliveryDate.toISOString().split('T')[0]

      const existingOrder = getExistingOrderForWindow(w.id) || await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', selectedCustomerId)
        .eq('delivery_window_id', w.id)
        .gte('delivery_date', weekStart)
        .lte('delivery_date', weekEnd)
        .maybeSingle()
        .then(r => r.data)

      let orderId: string

      if (existingOrder?.id) {
        orderId = existingOrder.id
        await supabase.from('order_items').delete().eq('order_id', orderId)
        await supabase.from('orders').update({
          status: 'pending',
          is_par: false,
          delivery_date: dateStr,
          customer_notes: notes || null,
          submitted_at: new Date().toISOString(),
        }).eq('id', orderId)
      } else {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id: selectedCustomerId,
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

      const orderItems = products
        .filter(p => mergedQty(w.id, p.id) > 0)
        .map(p => ({
          order_id: orderId,
          customer_id: selectedCustomerId,
          product_id: p.id,
          delivery_window_id: w.id,
          quantity: mergedQty(w.id, p.id),
          sliced: mergedSliced(w.id, p.id),
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

    const cutoffSunday = getSelectedSunday()
    const cutoffStr = cutoffSunday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    fetch('/api/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: selectedCustomerId,
        week_start: getWeekStart(),
        week_end: getWeekEnd(),
        week_range: getWeekRange(),
        cutoff_string: cutoffStr,
        is_editing: isEditing,
      }),
    }).catch(err => console.error('Confirmation email error:', err))

    window.location.href = `/order/confirmation?week=${encodeURIComponent(getWeekRange())}`
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const weekRange = getWeekRange()
  const cutoffString = getCutoffString()
  const isEditing = hasExistingOrderThisWeek()
  const weekTotal = orderWeekTotalCents()

  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  }

  if (step === 'confirm') {
    return (
      <div>
        <h1 style={{ marginBottom: 4 }}>Confirm your order</h1>
        <p className="page-subtitle">
          Review your order for {weekRange} before submitting.
          {hasAnyPar() && ' Standing order quantities are included.'}
        </p>

        {isAdmin && (
          <div style={{
            background: '#fffbeb', border: '1px solid #f59e0b',
            borderRadius: 8, padding: '10px 16px', marginBottom: 20,
            fontSize: 13, color: '#92400e', fontWeight: 600,
          }}>
            Submitting as: {allCustomers.find(c => c.id === selectedCustomerId)?.name}
          </div>
        )}

        {deliveryWindows.filter(w => colMergedTotal(w.id) > 0).map(w => {
          const winTotal = windowTotalCents(w.id)
          return (
            <div key={w.id} style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h2 style={{ fontSize: 15, margin: 0 }}>
                  {dayShort[w.day_of_week]}, {getDeliveryDate(w.day_of_week).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </h2>
                {winTotal > 0 && (
                  <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{fmtMoney(winTotal)}</span>
                )}
              </div>
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="center">Standing</th>
                    <th className="center">Additional</th>
                    <th className="center">Total</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedOrderLines(w.id).map(p => {
                    const lineCents = windowLineTotalCents(w.id, p)
                    return (
                      <tr key={p.id}>
                        <td>
                          <div>{p.name}</div>
                          {mergedSliced(w.id, p.id) && <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>sliced</div>}
                          {getPrice(p) && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>${getPrice(p)} each</div>}
                        </td>
                        <td className="center" style={{ color: 'var(--gray-500)' }}>
                          {parQtyMap[w.id]?.[p.id] || '—'}
                        </td>
                        <td className="center" style={{ color: 'var(--gray-500)' }}>
                          {additions[w.id]?.[p.id]?.quantity || '—'}
                        </td>
                        <td className="center" style={{ fontWeight: 600 }}>
                          {mergedQty(w.id, p.id)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--gray-600)' }}>
                          {lineCents > 0 ? fmtMoney(lineCents) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="totals-row">
                    <td>Total</td>
                    <td className="center">{colParTotal(w.id) || '—'}</td>
                    <td className="center">{colAddTotal(w.id) || '—'}</td>
                    <td className="center">{colMergedTotal(w.id)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {winTotal > 0 ? fmtMoney(winTotal) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}

        {weekTotal > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 0', borderTop: '2px solid var(--gray-200)', marginBottom: 24,
          }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Week total</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{fmtMoney(weekTotal)}</span>
          </div>
        )}

        {notes && (
          <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 24 }}>
            Notes: {notes}
          </p>
        )}

        {error && <p style={{ color: 'red', marginBottom: 16 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 60 }}>
          <button onClick={() => setStep('order')} className="btn" style={{ background: 'var(--gray-100)', color: 'var(--gray-900)' }}>
            ← Edit order
          </button>
          <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary">
            {submitting ? 'Submitting...' : `${isEditing ? 'Update' : 'Submit'} order (${totalMergedItems()} loaves)`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Place an Order</h1>

      {isAdmin && (
        <div style={{
          background: '#fffbeb', border: '1px solid #f59e0b',
          borderRadius: 8, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>
            Ordering as:
          </span>
          <select
            value={selectedCustomerId || ''}
            onChange={e => handleCustomerChange(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 6,
              border: '1px solid #f59e0b', background: '#fff',
              fontFamily: 'var(--font)', color: 'var(--gray-900)', cursor: 'pointer',
            }}
          >
            {allCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
          disabled={weekOffset === 0}
          style={{
            background: 'none', border: '1px solid var(--gray-200)', borderRadius: 6,
            padding: '6px 12px', cursor: weekOffset === 0 ? 'default' : 'pointer',
            color: weekOffset === 0 ? 'var(--gray-300)' : 'var(--gray-700)', fontSize: 16,
          }}
        >
          ‹
        </button>
        <div style={{ textAlign: 'center', minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{weekRange}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
            {weekOffset === 0 ? `Closes ${cutoffString} at noon` : `Week ${weekOffset + 1} out`}
          </div>
        </div>
        <button
          onClick={() => setWeekOffset(o => Math.min(3, o + 1))}
          disabled={weekOffset === 3}
          style={{
            background: 'none', border: '1px solid var(--gray-200)', borderRadius: 6,
            padding: '6px 12px', cursor: weekOffset === 3 ? 'default' : 'pointer',
            color: weekOffset === 3 ? 'var(--gray-300)' : 'var(--gray-700)', fontSize: 16,
          }}
        >
          ›
        </button>
        {isEditing && (
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 4, background: '#cce5ff', color: '#004085' }}>
            Order submitted — editing
          </span>
        )}
      </div>

      <div style={{
        background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
        borderRadius: 8, padding: 16, marginBottom: 32,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasAnyPar() ? 12 : 0 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>Standing Order</h2>
          <a href="/par" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
            Edit standing order →
          </a>
        </div>
        {!hasAnyPar() ? (
          <p style={{ color: 'var(--gray-500)', fontSize: 13, margin: 0 }}>
            No standing order set.{' '}
            <a href="/par" style={{ color: 'var(--accent)' }}>Set one up →</a>
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', fontWeight: 500, padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product</th>
                {deliveryWindows.map(w => (
                  <th key={w.id} style={{ textAlign: 'center', fontSize: 11, color: 'var(--gray-500)', fontWeight: 500, padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {dayShort[w.day_of_week]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.filter(p => deliveryWindows.some(w => (parQtyMap[w.id]?.[p.id] || 0) > 0)).map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '6px 0', fontSize: 13 }}>
                    {p.name}
                    {deliveryWindows.some(w => parSlicedMap[w.id]?.[p.id]) && (
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 6 }}>sliced</span>
                    )}
                  </td>
                  {deliveryWindows.map(w => (
                    <td key={w.id} style={{ textAlign: 'center', padding: '6px 8px', fontSize: 13 }}>
                      {parQtyMap[w.id]?.[p.id] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--gray-200)' }}>
                <td style={{ padding: '6px 0', fontSize: 12, color: 'var(--gray-500)', fontWeight: 600 }}>Total</td>
                {deliveryWindows.map(w => (
                  <td key={w.id} style={{ textAlign: 'center', padding: '6px 8px', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>
                    {colParTotal(w.id) || '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ fontSize: 15, marginBottom: 8 }}>
        {isEditing ? 'Edit additional items' : 'Additional items this week'}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
        Add extra loaves on top of your standing order. Changes here won't affect your standing order.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--gray-200)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', minWidth: 200 }}>Product</th>
              <th style={{ textAlign: 'right', padding: '8px 16px 8px 0', minWidth: 60, color: 'var(--gray-400)', fontWeight: 'normal', fontSize: 13 }}>Price</th>
              {deliveryWindows.map(w => (
                <th key={w.id} style={{ padding: '8px', textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontWeight: 600 }}>{dayShort[w.day_of_week]}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 'normal' }}>
                    {getDeliveryDate(w.day_of_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </th>
              ))}
              <th style={{ textAlign: 'right', padding: '8px 0 8px 8px', minWidth: 70, color: 'var(--gray-400)', fontWeight: 'normal', fontSize: 13 }}>Week total</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const wkTotal = weeklyMergedTotal(p.id)
              const min = p.minimum_quantity ?? 10
              const underMin = wkTotal > 0 && wkTotal < min
              const lineTotal = weeklyLineTotalCents(p)
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '6px 12px 6px 0', fontSize: 14 }}>
                    <div>{p.name}</div>
                    {p.can_be_sliced && <div style={{ fontSize: 11, color: 'var(--gray-300)' }}>sliceable</div>}
                    <div style={{ fontSize: 11, color: underMin ? '#dc2626' : 'var(--gray-400)', marginTop: 1 }}>
                      min {min}/week{wkTotal > 0 ? ` · ${wkTotal} ordered` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '6px 16px 6px 0', textAlign: 'right', fontSize: 13, color: 'var(--gray-400)' }}>
                    {getPrice(p) ? `$${getPrice(p)}` : '—'}
                  </td>
                  {deliveryWindows.map(w => {
                    const add = additions[w.id]?.[p.id]
                    const hasValue = (add?.quantity || 0) > 0
                    return (
                      <td key={w.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={add?.quantity || ''}
                          placeholder="0"
                          onChange={e => updateAddition(w.id, p.id, 'quantity', e.target.value)}
                          style={{
                            width: 54, padding: '6px',
                            border: `1px solid ${underMin ? '#dc2626' : hasValue ? 'var(--accent)' : 'var(--gray-200)'}`,
                            borderRadius: 4, textAlign: 'center', fontSize: 14,
                            color: 'var(--gray-900)',
                            background: hasValue ? 'var(--accent-light, #f0f7ff)' : 'var(--gray-50)',
                            outline: 'none', appearance: 'textfield' as any,
                          }}
                        />
                        {p.can_be_sliced && hasValue && (
                          <div style={{ fontSize: 11, marginTop: 2 }}>
                            <label style={{ color: 'var(--gray-500)', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={add?.sliced || false}
                                onChange={e => updateAddition(w.id, p.id, 'sliced', e.target.checked)}
                                style={{ marginRight: 3 }}
                              />
                              sliced
                            </label>
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', fontSize: 13, color: wkTotal > 0 ? 'var(--gray-700)' : 'var(--gray-300)' }}>
                    {lineTotal > 0 ? fmtMoney(lineTotal) : '—'}
                  </td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '2px solid var(--gray-200)', fontWeight: 600 }}>
              <td style={{ padding: '8px 12px 8px 0', fontSize: 13, color: 'var(--gray-500)' }}>Additional total</td>
              <td></td>
              {deliveryWindows.map(w => (
                <td key={w.id} style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>
                  {colAddTotal(w.id) > 0 ? colAddTotal(w.id) : '—'}
                </td>
              ))}
              <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>
                {weekTotal > 0 ? fmtMoney(weekTotal) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--gray-600)' }}>
          Notes / special instructions (optional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. back door delivery, skip the rye this week..."
          rows={3}
          style={{
            width: '100%', padding: 10, border: '1px solid var(--gray-200)',
            borderRadius: 6, fontSize: 14, color: 'var(--gray-900)', resize: 'vertical',
          }}
        />
      </div>

      {error && <p style={{ color: 'red', margin: '16px 0' }}>{error}</p>}

      <div style={{ marginTop: 24, marginBottom: 60 }}>
        <button
          onClick={() => {
            if (totalMergedItems() === 0) {
              setError('Please add at least one item before continuing.')
              return
            }
            const violations: string[] = []
            products.forEach(p => {
              const total = weeklyMergedTotal(p.id)
              const min = p.minimum_quantity ?? 10
              if (total > 0 && total < min) {
                violations.push(`${p.name} requires a minimum of ${min}/week (you have ${total})`)
              }
            })
            if (violations.length > 0) {
              setError(violations.join(' · '))
              return
            }
            setError(null)
            setStep('confirm')
          }}
          className="btn btn-primary"
        >
          Review order ({totalMergedItems()} loaves) →
        </button>
      </div>
    </div>
  )
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <OrderPageInner />
    </Suspense>
  )
}