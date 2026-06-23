'use client'
import { useState, useEffect, Fragment } from 'react'
import { createClient } from '../../lib/supabase'

export default function ParPage() {
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [pars, setPars] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [savedPars, setSavedPars] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({})
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasSavedOnce, setHasSavedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function loadFavorites(targetId: string) {
    const { data } = await supabase
      .from('customer_favorites')
      .select('product_id')
      .eq('customer_id', targetId)
    setFavorites(new Set((data || []).map((f: any) => f.product_id)))
  }

  async function toggleFavorite(productId: string) {
    if (!selectedCustomerId) return
    const isFav = favorites.has(productId)
    if (isFav) {
      await supabase.from('customer_favorites')
        .delete()
        .eq('customer_id', selectedCustomerId)
        .eq('product_id', productId)
      setFavorites(prev => { const next = new Set(prev); next.delete(productId); return next })
    } else {
      await supabase.from('customer_favorites')
        .insert({ customer_id: selectedCustomerId, product_id: productId })
      setFavorites(prev => new Set([...prev, productId]))
    }
  }

  async function loadPars(targetId: string, prods: any[], windows: any[]) {
    const [parsRes, pricesRes] = await Promise.all([
      supabase.from('customer_pars').select('*').eq('customer_id', targetId),
      supabase.from('customer_products').select('product_id, price_cents').eq('customer_id', targetId),
    ])
    const parMap: Record<string, Record<string, { quantity: number; sliced: boolean }>> = {}
    windows.forEach((w: any) => {
      parMap[w.id] = {}
      prods.forEach((p: any) => { parMap[w.id][p.id] = { quantity: 0, sliced: false } })
    })
    parsRes.data?.forEach((par: any) => {
      if (parMap[par.delivery_window_id]) parMap[par.delivery_window_id][par.product_id] = { quantity: par.quantity, sliced: par.sliced }
    })
    const priceMap: Record<string, number> = {}
    pricesRes.data?.forEach((p: any) => { priceMap[p.product_id] = p.price_cents })
    setPars(parMap)
    setSavedPars(parMap)
    setCustomerPrices(priceMap)
    setHasSavedOnce(!!(parsRes.data && parsRes.data.length > 0))
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
      setCustomerId(cid)
      const [prodsRes, windowsRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('sort_order'),
        supabase.from('delivery_windows').select('*').eq('active', true).order('sort_order'),
      ])
      const sortedWindows = (windowsRes.data || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
      const prods = prodsRes.data || []
      setProducts(prods)
      setDeliveryWindows(sortedWindows)
      console.log('customer data:', customer, 'is_admin:', customer?.is_admin)
      if (customer?.is_admin === true) {
        setIsAdmin(true)
        const { data: customers } = await supabase.from('customers').select('id, name').eq('active', true).order('name')
        setAllCustomers(customers || [])
        const stored = sessionStorage.getItem('adminSelectedCustomerId')
        const storedName = sessionStorage.getItem('adminSelectedCustomerName')
        const targetId = stored || cid
        setSelectedCustomerId(targetId)
        setSelectedCustomerName(storedName || 'My account')
        await Promise.all([loadPars(targetId, prods, sortedWindows), loadFavorites(targetId)])
      } else {
        sessionStorage.removeItem('adminSelectedCustomerId')
        sessionStorage.removeItem('adminSelectedCustomerName')
        setSelectedCustomerId(cid)
        await Promise.all([loadPars(cid, prods, sortedWindows), loadFavorites(cid)])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleCustomerChange(newId: string) {
    const c = allCustomers.find(c => c.id === newId)
    setSelectedCustomerId(newId)
    setSelectedCustomerName(c?.name || '')
    sessionStorage.setItem('adminSelectedCustomerId', newId)
    sessionStorage.setItem('adminSelectedCustomerName', c?.name || '')
    setSaved(false)
    setError(null)
    await Promise.all([loadPars(newId, products, deliveryWindows), loadFavorites(newId)])
  }

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

  function clearProductRow(productId: string) {
    setPars(prev => {
      const next = { ...prev }
      deliveryWindows.forEach((w: any) => {
        next[w.id] = {
          ...next[w.id],
          [productId]: { quantity: 0, sliced: next[w.id]?.[productId]?.sliced || false },
        }
      })
      return next
    })
  }

  function colTotal(windowId: string) {
    return Object.values(pars[windowId] || {}).reduce((t, l) => t + (l.quantity || 0), 0)
  }

  function weeklyTotal(productId: string): number {
    return deliveryWindows.reduce((t, w) => t + (pars[w.id]?.[productId]?.quantity || 0), 0)
  }

  function hasSavedQty(productId: string): boolean {
    return deliveryWindows.some(w => (savedPars[w.id]?.[productId]?.quantity || 0) > 0)
  }

  function getPrice(product: any): string | null {
    const cents = customerPrices[product.id] ?? product.price_cents ?? null
    if (!cents) return null
    return '$' + (cents / 100).toFixed(2)
  }

  const sortedProducts = products.slice().sort((a, b) => {
    const aFav = favorites.has(a.id) ? 0 : 1
    const bFav = favorites.has(b.id) ? 0 : 1
    if (aFav !== bFav) return aFav - bFav
    return (hasSavedQty(a.id) ? 0 : 1) - (hasSavedQty(b.id) ? 0 : 1)
  })

  async function handleSave() {
    if (!selectedCustomerId) return
    setError(null)
    const violations: string[] = []
    products.forEach(p => {
      const total = weeklyTotal(p.id)
      const min = p.minimum_quantity ?? 10
      if (total > 0 && total < min) violations.push(`${p.name} requires a minimum of ${min}/week (you have ${total})`)
    })
    if (violations.length > 0) { setError(violations.join(' · ')); return }
    setSaving(true)
    setSaved(false)
    const rows: any[] = []
    deliveryWindows.forEach((w: any) => {
      products.forEach((p: any) => {
        const par = pars[w.id]?.[p.id]
        if (par && par.quantity > 0) rows.push({ customer_id: selectedCustomerId, delivery_window_id: w.id, product_id: p.id, quantity: par.quantity, sliced: par.sliced || false })
      })
    })
    const { error: deleteError } = await supabase.from('customer_pars').delete().eq('customer_id', selectedCustomerId)
    if (deleteError) { setError('Error saving: ' + deleteError.message); setSaving(false); return }
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('customer_pars').insert(rows)
      if (insertError) { setError('Error saving: ' + insertError.message); setSaving(false); return }
    }
    setSaving(false)
    setSaved(true)
    setSavedPars(pars)
    setHasSavedOnce(true)
    setTimeout(() => setSaved(false), 4000)

    if (!isAdmin) {
      fetch('/api/notify-admin-par', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selectedCustomerId }),
      }).catch(err => console.error('Par notification error:', err))
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  }

  return (
    <div>
      <h1>Standing Order</h1>
      {isAdmin && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>Editing as:</span>
          <select value={selectedCustomerId || ''} onChange={e => handleCustomerChange(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', fontFamily: 'var(--font)', color: 'var(--gray-900)', cursor: 'pointer' }}>
            {allCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <p className="page-subtitle">Repeats every week until you change it. Set a quantity to 0 to remove a product.</p>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}>
        <table className="data-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 28, position: 'sticky', top: 0, zIndex: 2, background: '#fff' }}></th>
              <th style={{ minWidth: 200, position: 'sticky', top: 0, zIndex: 2, background: '#fff' }}>Product</th>
              {deliveryWindows.map(w => {
                const isMonday = w.day_of_week === 'monday'
                return (
                  <th
                    key={w.id}
                    className="center"
                    style={{
                      minWidth: 80,
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      background: isMonday ? '#fff7ed' : '#fff',
                    }}
                  >
                    <div className="day-header" style={isMonday ? { color: '#c2410c', fontWeight: 700 } : {}}>
                      {dayShort[w.day_of_week]}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((p, idx) => {
              const total = weeklyTotal(p.id)
              const min = p.minimum_quantity ?? 10
              const underMin = total > 0 && total < min
              const hasSaved = hasSavedQty(p.id)
              const isFav = favorites.has(p.id)
              const prevProduct = idx > 0 ? sortedProducts[idx - 1] : null
              const prevHasSaved = prevProduct ? hasSavedQty(prevProduct.id) : true
              const prevIsFav = prevProduct ? favorites.has(prevProduct.id) : false
              const isFirstUnsaved = !isFav && !hasSaved && idx > 0 && (prevHasSaved || prevIsFav)
              return (
                <Fragment key={p.id}>
                  {isFirstUnsaved && (
                    <tr key={`divider-${p.id}`}>
                      <td colSpan={2 + deliveryWindows.length} style={{ padding: '8px 0 4px 0', fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderTop: '2px solid var(--gray-100)' }}>
                        Other products
                      </td>
                    </tr>
                  )}
                  <tr key={p.id} style={{ opacity: hasSaved ? 1 : 0.5 }}>
                    <td style={{ padding: '6px 8px 6px 0', textAlign: 'center', verticalAlign: 'middle' }}>
                      <button
                        onClick={() => toggleFavorite(p.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 16, padding: 0, lineHeight: 1,
                          color: favorites.has(p.id) ? '#f59e0b' : 'var(--gray-300)',
                        }}
                        title={favorites.has(p.id) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        ★
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span>{p.name}</span>
                        {total > 0 && (
                          <button
                            onClick={() => clearProductRow(p.id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 11, color: 'var(--gray-400)', padding: 0,
                              textDecoration: 'underline', fontFamily: 'var(--font)',
                            }}
                          >
                            clear
                          </button>
                        )}
                      </div>
                      {getPrice(p) && (
                        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{getPrice(p)} each</div>
                      )}
                      <div style={{ fontSize: 11, color: underMin ? '#dc2626' : 'var(--gray-400)', marginTop: 1 }}>
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
                            value={par?.quantity || ''}
                            placeholder="0"
                            onFocus={e => e.target.select()}
                            onChange={e => updatePar(w.id, p.id, 'quantity', e.target.value)}
                            className={`qty-input${par?.quantity > 0 ? ' has-value' : ''}`}
                            style={underMin ? { borderColor: '#dc2626' } : {}}
                          />
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
            <tr className="totals-row">
              <td></td>
              <td>Total per week</td>
              {deliveryWindows.map(w => (
                <td key={w.id} className="center">{colTotal(w.id) > 0 ? colTotal(w.id) : '—'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 32, marginBottom: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving...' : hasSavedOnce ? 'Update standing order' : 'Save standing order'}
        </button>
        {saved && <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>✓ Standing order updated — applies to all future weeks.</span>}
        {error && <span className="alert alert-error" style={{ margin: 0, padding: '6px 12px' }}>{error}</span>}
      </div>
    </div>
  )
}
