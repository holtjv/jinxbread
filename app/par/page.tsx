'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function ParPage() {
  const [products, setProducts] = useState([])
  const [deliveryWindows, setDeliveryWindows] = useState([])
  const [pars, setPars] = useState({})
  const [customerId, setCustomerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

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

      const { data: existingPars } = await supabase
        .from('customer_pars')
        .select('*')
        .eq('customer_id', customer.id)

      const parMap = {}
      windows?.forEach(w => {
        parMap[w.id] = {}
        prods?.forEach(p => {
          parMap[w.id][p.id] = { quantity: 0, sliced: false }
        })
      })
      existingPars?.forEach(par => {
        if (parMap[par.delivery_window_id]) {
          parMap[par.delivery_window_id][par.product_id] = {
            quantity: par.quantity,
            sliced: par.sliced,
          }
        }
      })

      setProducts(prods || [])
      setDeliveryWindows(windows || [])
      setPars(parMap)
      setLoading(false)
    }
    load()
  }, [])

  function updatePar(windowId, productId, field, value) {
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

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)

    const rows = []
    deliveryWindows.forEach(w => {
      products.forEach(p => {
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
      console.error('Delete error:', JSON.stringify(deleteError))
      setError('Delete failed: ' + deleteError.message)
      setSaving(false)
      return
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('customer_pars')
        .insert(rows)

      if (insertError) {
        console.error('Insert error:', JSON.stringify(insertError))
        setError('Save failed: ' + insertError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <main style={{ padding: 40 }}>Loading...</main>

  return (
    <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
      <h1>Standing order (par)</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Set your default quantities for each delivery day. These will be automatically
        submitted each week — you can adjust any individual order before the cutoff.
      </p>

      {deliveryWindows.map(w => (
        <div key={w.id} style={{ marginBottom: 40 }}>
          <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: 8 }}>{w.label}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#999', fontSize: 13 }}>
                <th style={{ padding: '6px 0', fontWeight: 'normal' }}>Bread</th>
                <th style={{ padding: '6px 0', fontWeight: 'normal' }}>Weekly qty</th>
                <th style={{ padding: '6px 0', fontWeight: 'normal' }}>Sliced</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '10px 0' }}>{p.name}</td>
                  <td style={{ padding: '10px 0' }}>
                    <input
                      type="number"
                      min="0"
                      value={pars[w.id]?.[p.id]?.quantity || 0}
                      onChange={e => updatePar(w.id, p.id, 'quantity', e.target.value)}
                      style={{ width: 70, padding: 4 }}
                    />
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    {p.can_be_sliced && (
                      <input
                        type="checkbox"
                        checked={pars[w.id]?.[p.id]?.sliced || false}
                        onChange={e => updatePar(w.id, p.id, 'sliced', e.target.checked)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 32px',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          {saving ? 'Saving...' : 'Save par'}
        </button>
        {saved && <span style={{ color: 'green' }}>Saved!</span>}
        {error && <span style={{ color: 'red' }}>{error}</span>}
      </div>
    </main>
  )
}