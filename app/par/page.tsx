'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../lib/supabase'

export default function ParPage() {
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [pars, setPars] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOthers, setShowOthers] = useState(false)

  const supabase = createClient()

  async function loadPars(targetCustomerId: string, prods: any[], windows: any[]) {
    const { data: existingPars } = await supabase
      .from('customer_pars')
      .select('*')
      .eq('customer_id', targetCustomerId)

    const parMap: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
    windows.forEach((w: any) => {
      parMap[w.id] = {}
      prods.forEach((p: any) => {
        parMap[w.id][p.id] = { quantity: 0, sliced: false }
      })
    })
    existingPars?.forEach((par: any) => {
      if (parMap[par.delivery_window_id]) {
        parMap[par.delivery_window_id][par.product_id] = {
          quantity: par.quantity,
          sliced: par.sliced,
        }
      }
    })
    setPars(parMap)
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

      if (customer.is_admin) {
        setIsAdmin(true)
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name')
          .eq('active', true)
          .order('name')
        setAllCustomers(customers || [])

        // Check sessionStorage for previously selected customer
        const stored = sessionStorage.getItem('adminSelectedCustomerId')
        const storedName = sessionStorage.getItem('adminSelectedCustomerName')
        const targetId = stored || customer.id
        const targetName = storedName || 'My account'
        setSelectedCustomerId(targetId)
        setSelectedCustomerName(targetName)
        await loadPars(targetId, prods, sortedWindows)
      } else {
        setSelectedCustomerId(customer.id)
        await loadPars(customer.id, prods, sortedWindows)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleCustomerChange(newId: string) {
    const customer = allCustomers.find(c => c.id === newId)
    setSelectedCustomerId(newId)
    setSelectedCustomerName(customer?.name || '')
    sessionStorage.setItem('adminSelectedCustomerId', newId)
    sessionStorage.setItem('adminSelectedCustomerName', customer?.name || '')
    setSaved(false)
    setError(null)
    await loadPars(newId, products, deliveryWindows)
  }

  const sortedProducts = useMemo(() => {
    const hasParQty = (productId: string) =>
      Object.values(pars).some(windowPars => (windowPars[productId]?.quantity || 0) > 0)
    const withPar = products.filter(p => hasParQty(p.id))
    const withoutPar = products.filter(p => !hasParQty(p.id))
    return { withPar, withoutPar }
  }, [products, pars])

  function updatePar(windowId: string, productId: string, field: string, value: any) {
    setPars(prev => ({
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

  function colTotal(windowId: string) {
    return Object.values(pars[windowId] || {}).reduce((t, l) => t + (l.quantity || 0), 0)
  }

  function weeklyTotal(productId: string): number {
    return deliveryWindows.reduce((t, w) => t + (pars[w.id]?.[productId]?.quantity || 0), 0)
  }

  async function handleSave() {
    if (!selectedCustomerId) return
    setError(null)

    const violations: string[] = []
    products.forEach(p => {
      const total = weeklyTotal(p.id)
      const min = p.minimum_quantity ?? 10
      if (total > 0 && total < min) {
        violations.push(`${p.name} requires a minimum of ${min}/week (you have ${total})`)
      }
    })
    if (violations.length > 0) {
      setError(violations.join(' · '))
      return
    }

    setSaving(true)
    setSaved(false)

    const rows: any[] = []
    deliveryWindows.forEach((w: any) => {
      products.forEach((p: any) => {
        const par = pars[w.id]?.[p.id]
        if (par && par.quantity > 0) {
          rows.push({
            customer_id: selectedCustomerId,
            delivery_window_id: w.id,
            product_id: p.id,
            quantity: par.quantity,
            sliced: par.sliced || false,
          })
        }
      })
    })

    const { error: deleteError } = await supabase
      .from('customer_pars')
      .delete()
      .eq('customer_id', selectedCustomerId)

    if (deleteError) {
      setError('Error saving: ' + deleteError.message)
      setSaving(false)
      return
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('customer_pars')
        .insert(rows)

      if (insertError) {
        setError('Error saving: ' + insertError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  }

  function renderRows(productList: any[]) {
    return productList.map(p => {
      const total = weeklyTotal(p.id)
      const min = p.minimum_quantity ?? 10
      const underMin = total > 0 && total < min
      return (
        <tr key={p.id}>
          <td>
            <div>{p.name}</div>
            {p.can_be_sliced && <div className="product-meta">sliceable</div>}
            <div style={{ fontSize: 11, color: underMin ? '#dc2626' : 'var(--gray-400)', marginTop: 2 }}>
              min {min}/week{total > 0 ? ` · ${total} set` : ''}
            </div>
          </td>
          {deliveryWindows.map(w => {
            const par = pars[w.id]?.[p.id]
            return (
              <td key={w.id} className="center">
                <input
                  type="number"
                  min="0"
                  value={par?.quantity || 0}
                  onChange={e => updatePar(w.id, p.id, 'quantity', e.target.value)}
                  className={`qty-input${par?.quantity > 0 ? ' has-value' : ''}`}
                  style={underMin ? { borderColor: '#dc2626' } : {}}
                />
                {p.can_be_sliced && par?.quantity > 0 && (
                  <label className="sliced-label">
                    <input
                      type="checkbox"
                      checked={par?.sliced || false}
                      onChange={e => updatePar(w.id, p.id, 'sliced', e.target.checked)}
                    />
                    sliced
                  </label>
                )}
              </td>
            )
          })}
        </tr>
      )
    })
  }

  return (
    <div>
      <h1>Standing Order</h1>

      {isAdmin && (
        <div style={{
          background: '#fffbeb', border: '1px solid #f59e0b',
          borderRadius: 8, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>
            Editing as:
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

      <p className="page-subtitle">
        Repeats every week until you change it. Set a quantity to 0 to remove a product.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Product</th>
              {deliveryWindows.map(w => (
                <th key={w.id} className="center" style={{ minWidth: 80 }}>
                  <div className="day-header">{dayShort[w.day_of_week]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.withPar.length === 0 ? (
              <tr>
                <td colSpan={1 + deliveryWindows.length} style={{ color: 'var(--gray-500)', fontStyle: 'italic', padding: '20px 0' }}>
                  No standing order set yet. Use "Add products" below to get started.
                </td>
              </tr>
            ) : (
              renderRows(sortedProducts.withPar)
            )}
            {sortedProducts.withPar.length > 0 && (
              <tr className="totals-row">
                <td>Total per week</td>
                {deliveryWindows.map(w => (
                  <td key={w.id} className="center">
                    {colTotal(w.id) > 0 ? colTotal(w.id) : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sortedProducts.withoutPar.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowOthers(!showOthers)}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)',
              fontWeight: 500, padding: 0, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{showOthers ? '−' : '+'}</span>
            {showOthers ? 'Hide other products' : `Add products (${sortedProducts.withoutPar.length} available)`}
          </button>
          {showOthers && (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className="data-table">
                <tbody>{renderRows(sortedProducts.withoutPar)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32, marginBottom: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving...' : 'Save standing order'}
        </button>
        {saved && (
          <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>
            ✓ Standing order updated — applies to all future weeks.
          </span>
        )}
        {error && (
          <span className="alert alert-error" style={{ margin: 0, padding: '6px 12px' }}>
            {error}
          </span>
        )}
      </div>
    </div>
  )
}