'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../lib/supabase'

export default function ParPage() {
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [pars, setPars] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setCustomerId(customer.id)

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

      const { data: existingPars } = await supabase
        .from('customer_pars')
        .select('*')
        .eq('customer_id', customer.id)

      const parMap: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
      sortedWindows.forEach((w: any) => {
        parMap[w.id] = {}
        prods?.forEach((p: any) => {
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

      setProducts(prods || [])
      setDeliveryWindows(sortedWindows)
      setPars(parMap)
      setLoading(false)
    }
    load()
  }, [])

  // Dynamically sort products: those with any par quantity float to top
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

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)

    const rows: any[] = []
    deliveryWindows.forEach((w: any) => {
      products.forEach((p: any) => {
        const par = pars[w.id]?.[p.id]
        if (par && par.quantity > 0) {
          rows.push({
            customer_id: customerId,
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
      .eq('customer_id', customerId)

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

  if (loading) return <main style={{ padding: 40 }}>Loading...</main>

  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  }

  function renderRows(productList: any[]) {
    return productList.map(p => (
      <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
        <td style={{ padding: '6px 12px 6px 0', fontSize: 14 }}>
          <div>{p.name}</div>
          {p.can_be_sliced && (
            <div style={{ fontSize: 11, color: '#bbb' }}>sliceable</div>
          )}
        </td>
        {deliveryWindows.map(w => {
          const par = pars[w.id]?.[p.id]
          return (
            <td key={w.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
              <input
                type="number"
                min="0"
                value={par?.quantity || 0}
                onChange={e => updatePar(w.id, p.id, 'quantity', e.target.value)}
                style={{
                  width: 54,
                  padding: '4px 6px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  textAlign: 'center',
                  fontSize: 14,
                  color: '#000',
                  background: par?.quantity > 0 ? '#f0f7ff' : '#fff',
                }}
              />
              {p.can_be_sliced && par?.quantity > 0 && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <label style={{ color: '#666', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={par?.sliced || false}
                      onChange={e => updatePar(w.id, p.id, 'sliced', e.target.checked)}
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
      <h1 style={{ marginBottom: 4 }}>Standing Order</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        Repeats every week until you change it. Set a quantity to 0 to remove a product.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', minWidth: 200 }}>Product</th>
              {deliveryWindows.map(w => (
                <th key={w.id} style={{ padding: '8px 8px', textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontWeight: 600 }}>{dayShort[w.day_of_week]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.withPar.length > 0 && (
              <>
                {renderRows(sortedProducts.withPar)}
                {sortedProducts.withoutPar.length > 0 && (
                  <tr>
                    <td
                      colSpan={1 + deliveryWindows.length}
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
                )}
              </>
            )}
            {renderRows(sortedProducts.withoutPar)}

            <tr style={{ borderTop: '2px solid #eee', fontWeight: 600 }}>
              <td style={{ padding: '8px 12px 8px 0', fontSize: 13, color: '#666' }}>Total per week</td>
              {deliveryWindows.map(w => (
                <td key={w.id} style={{ padding: '8px', textAlign: 'center', fontSize: 14 }}>
                  {colTotal(w.id) > 0 ? colTotal(w.id) : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 32, marginBottom: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 40px',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          {saving ? 'Saving...' : 'Save standing order'}
        </button>
        {saved && (
          <span style={{ color: 'green', fontSize: 14 }}>
            ✓ Standing order updated — this will apply to all future weeks.
          </span>
        )}
        {error && <span style={{ color: 'red', fontSize: 14 }}>{error}</span>}
      </div>
    </main>
  )
}
