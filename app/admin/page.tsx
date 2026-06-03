'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Tab = 'orders' | 'thisweek' | 'pricing' | 'customers' | 'products' | 'users'
type OrderStatus = 'pending' | 'confirmed' | 'in_production' | 'fulfilled' | 'cancelled'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const CUSTOMER_TYPES = ['restaurant', 'grocery']

const EMPTY_CUSTOMER = {
  name: '', contact_name: '', email: '', phone: '',
  type: 'restaurant', delivery_day: 'tuesday', address: '', notes: '', active: true,
}

const EMPTY_PRODUCT = {
  name: '', sku: '', price_cents: '', unit_label: 'loaf',
  can_be_sliced: false, active: true, sort_order: '', minimum_quantity: '10',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_production: 'In Production',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<OrderStatus, { background: string; color: string }> = {
  pending: { background: '#fff3cd', color: '#856404' },
  confirmed: { background: '#d4edda', color: '#155724' },
  in_production: { background: '#cce5ff', color: '#004085' },
  fulfilled: { background: '#e2e3e5', color: '#383d41' },
  cancelled: { background: '#f8d7da', color: '#721c24' },
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [allCustomers, setAllCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [customerProducts, setCustomerProducts] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceSaved, setPriceSaved] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const [editingCustomer, setEditingCustomer] = useState<any | null>(null)
  const [customerForm, setCustomerForm] = useState<any>(EMPTY_CUSTOMER)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [customerSuccess, setCustomerSuccess] = useState<string | null>(null)

  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const [productForm, setProductForm] = useState<any>(EMPTY_PRODUCT)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)
  const [productSuccess, setProductSuccess] = useState<string | null>(null)

  const [userForm, setUserForm] = useState({ email: '', customer_id: '', is_admin: false })
  const [inviting, setInviting] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [userSuccess, setUserSuccess] = useState<string | null>(null)

  const supabase = createClient()

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
    const sunday = new Date(tuesday)
    sunday.setDate(tuesday.getDate() - 2)
    return { tuesday, monday, sunday }
  }

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

  async function loadData() {
    const [ordersRes, customersRes, allCustomersRes, productsRes, allProductsRes, cpRes, windowsRes] = await Promise.all([
      supabase.from('orders').select(`
        id, delivery_date, delivery_window_id, status, is_par, customer_id,
        customer:customers (id, name, type),
        order_items (quantity, sliced, product_id, product:products (name, sku))
      `).order('delivery_date', { ascending: true }),
      supabase.from('customers').select('id, name').eq('active', true).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('id, name, sku, price_cents, unit_label, minimum_quantity').eq('active', true).order('sort_order'),
      supabase.from('products').select('*').order('sort_order'),
      supabase.from('customer_products').select('customer_id, product_id, price_cents'),
      supabase.from('delivery_windows').select('*').eq('active', true).order('sort_order'),
    ])

    if (ordersRes.data) {
      setOrders(ordersRes.data)
      if (ordersRes.data.length > 0) setSelectedDate(ordersRes.data[0].delivery_date)
    }
    if (customersRes.data) {
      setCustomers(customersRes.data)
      setSelectedCustomerId(customersRes.data[0]?.id || null)
    }
    if (allCustomersRes.data) setAllCustomers(allCustomersRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    if (allProductsRes.data) setAllProducts(allProductsRes.data)
    if (cpRes.data) setCustomerProducts(cpRes.data)
    if (windowsRes.data) setDeliveryWindows(windowsRes.data)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!selectedCustomerId) return
    const map: Record<string, string> = {}
    customerProducts
      .filter(cp => cp.customer_id === selectedCustomerId)
      .forEach(cp => { map[cp.product_id] = (cp.price_cents / 100).toFixed(2) })
    setPrices(map)
  }, [selectedCustomerId, customerProducts])

  const dates = [...new Set(orders.map((o: any) => o.delivery_date))].sort()
  const dateOrders = orders.filter((o: any) => o.delivery_date === selectedDate)
  const totals: Record<string, any> = {}
  dateOrders.forEach((order: any) => {
    order.order_items?.forEach((line: any) => {
      const key = `${line.product.sku}|${line.sliced}`
      if (!totals[key]) totals[key] = { name: line.product.name, sku: line.product.sku, sliced: line.sliced, quantity: 0 }
      totals[key].quantity += line.quantity
    })
  })
  const totalsList = Object.values(totals).sort((a: any, b: any) => a.name.localeCompare(b.name))

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setUpdatingStatus(orderId)
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (!error) setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    setUpdatingStatus(null)
  }

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

  async function handleSavePrices() {
    if (!selectedCustomerId) return
    setSavingPrices(true)
    setPriceSaved(false)
    setPriceError(null)
    const { error: deleteError } = await supabase.from('customer_products').delete().eq('customer_id', selectedCustomerId)
    if (deleteError) { setPriceError('Error saving: ' + deleteError.message); setSavingPrices(false); return }
    const rows = Object.entries(prices)
      .filter(([_, val]) => val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > 0)
      .map(([productId, val]) => ({ customer_id: selectedCustomerId, product_id: productId, price_cents: Math.round(parseFloat(val) * 100) }))
    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('customer_products').insert(rows)
      if (insertError) { setPriceError('Error saving: ' + insertError.message); setSavingPrices(false); return }
    }
    setCustomerProducts(prev => [...prev.filter(cp => cp.customer_id !== selectedCustomerId), ...rows])
    setSavingPrices(false)
    setPriceSaved(true)
    setTimeout(() => setPriceSaved(false), 4000)
  }

  function startEditCustomer(c: any) {
    setEditingCustomer(c)
    setCustomerForm({
      name: c.name || '', contact_name: c.contact_name || '', email: c.email || '',
      phone: c.phone || '', type: c.type || 'restaurant', delivery_day: c.delivery_day || 'tuesday',
      address: c.address || '', notes: c.notes || '', active: c.active ?? true,
    })
    setCustomerError(null)
    setCustomerSuccess(null)
  }

  function startNewCustomer() {
    setEditingCustomer('new')
    setCustomerForm(EMPTY_CUSTOMER)
    setCustomerError(null)
    setCustomerSuccess(null)
  }

  async function handleSaveCustomer() {
    if (!customerForm.name.trim()) { setCustomerError('Name is required'); return }
    if (!customerForm.email.trim()) { setCustomerError('Email is required'); return }
    setSavingCustomer(true)
    setCustomerError(null)
    const payload = {
      name: customerForm.name.trim(), contact_name: customerForm.contact_name.trim() || null,
      email: customerForm.email.trim(), phone: customerForm.phone.trim() || null,
      type: customerForm.type, delivery_day: customerForm.delivery_day,
      address: customerForm.address.trim() || null, notes: customerForm.notes.trim() || null,
      active: customerForm.active,
    }
    if (editingCustomer === 'new') {
      const { error } = await supabase.from('customers').insert(payload)
      if (error) { setCustomerError(error.message); setSavingCustomer(false); return }
      setCustomerSuccess('Customer added')
    } else {
      const { error } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id)
      if (error) { setCustomerError(error.message); setSavingCustomer(false); return }
      setCustomerSuccess('Customer updated')
    }
    setSavingCustomer(false)
    setEditingCustomer(null)
    await loadData()
    setTimeout(() => setCustomerSuccess(null), 4000)
  }

  function startEditProduct(p: any) {
    setEditingProduct(p)
    setProductForm({
      name: p.name || '', sku: p.sku || '',
      price_cents: p.price_cents ? (p.price_cents / 100).toFixed(2) : '',
      unit_label: p.unit_label || 'loaf', can_be_sliced: p.can_be_sliced ?? false,
      active: p.active ?? true, sort_order: p.sort_order ?? '',
      minimum_quantity: p.minimum_quantity ?? '10',
    })
    setProductError(null)
    setProductSuccess(null)
  }

  function startNewProduct() {
    setEditingProduct('new')
    setProductForm(EMPTY_PRODUCT)
    setProductError(null)
    setProductSuccess(null)
  }

  async function handleSaveProduct() {
    if (!productForm.name.trim()) { setProductError('Name is required'); return }
    if (!productForm.sku.trim()) { setProductError('SKU is required'); return }
    setSavingProduct(true)
    setProductError(null)
    const payload = {
      name: productForm.name.trim(), sku: productForm.sku.trim(),
      price_cents: productForm.price_cents ? Math.round(parseFloat(productForm.price_cents) * 100) : null,
      unit_label: productForm.unit_label.trim() || 'loaf', can_be_sliced: productForm.can_be_sliced,
      active: productForm.active, sort_order: productForm.sort_order !== '' ? parseInt(productForm.sort_order) : null,
      minimum_quantity: productForm.minimum_quantity !== '' ? parseInt(productForm.minimum_quantity) : 10,
    }
    if (editingProduct === 'new') {
      const { error } = await supabase.from('products').insert(payload)
      if (error) { setProductError(error.message); setSavingProduct(false); return }
      setProductSuccess('Product added')
    } else {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id)
      if (error) { setProductError(error.message); setSavingProduct(false); return }
      setProductSuccess('Product updated')
    }
    setSavingProduct(false)
    setEditingProduct(null)
    await loadData()
    setTimeout(() => setProductSuccess(null), 4000)
  }

  async function handleInviteUser() {
    if (!userForm.email.trim()) { setUserError('Email is required'); return }
    if (!userForm.customer_id) { setUserError('Please select a customer'); return }
    setInviting(true)
    setUserError(null)
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userForm.email.trim(), customer_id: userForm.customer_id, is_admin: userForm.is_admin }),
    })
    const data = await res.json()
    if (!res.ok) { setUserError(data.error || 'Failed to invite user'); setInviting(false); return }
    setInviting(false)
    setUserSuccess(`Invite sent to ${userForm.email}`)
    setUserForm({ email: '', customer_id: '', is_admin: false })
    setTimeout(() => setUserSuccess(null), 6000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const tabLabels: Record<Tab, string> = {
    orders: 'Orders', thisweek: 'This Week', pricing: 'Customer Pricing',
    customers: 'Customers', products: 'Products', users: 'Users',
  }

  const formFieldStyle = {
    display: 'block' as const, width: '100%', padding: '8px 10px',
    border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 14,
    fontFamily: 'var(--font)', color: 'var(--gray-900)', background: '#fff', marginTop: 4,
  }

  const formRowStyle = { marginBottom: 16 }

  return (
    <div>
      <h1>Admin</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '2px solid var(--gray-200)', flexWrap: 'wrap' as const }}>
        {(['orders', 'thisweek', 'customers', 'products', 'users', 'pricing'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14,
            fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--accent)' : 'var(--gray-500)',
          }}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* ── ORDERS TAB ── */}
      {tab === 'orders' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            {dates.map((date: any) => (
              <button key={date} onClick={() => setSelectedDate(date)} style={{
                padding: '8px 16px',
                background: selectedDate === date ? 'var(--accent)' : 'var(--gray-100)',
                color: selectedDate === date ? '#fff' : 'var(--gray-900)',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13,
              }}>
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
                  <thead><tr><th>Product</th><th>SKU</th><th>Sliced</th><th>Total</th></tr></thead>
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
              {dateOrders.map((order: any) => {
                const status = order.status as OrderStatus
                const colors = STATUS_COLORS[status] || STATUS_COLORS.pending
                return (
                  <div key={order.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong>{order.customer.name}</strong>
                        {order.is_par && <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>par</span>}
                      </div>
                      <select
                        value={order.status}
                        disabled={updatingStatus === order.id}
                        onChange={e => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500, ...colors }}
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {order.order_items?.map((line: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td style={{ padding: '4px 0' }}>{line.product.name}</td>
                            <td style={{ padding: '4px 0', color: 'var(--gray-500)', fontSize: 13 }}>{line.sliced ? 'sliced' : ''}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right' }}>x{line.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {/* ── THIS WEEK TAB ── */}
      {tab === 'thisweek' && (
        <>
          <p className="page-subtitle">
            Orders for {fmtDate(tuesday)} – {fmtDate(monday)}. Cutoff is {fmtDateFull(sunday)} at noon.
          </p>
          {thisWeekCustomers.length === 0 ? (
            <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
              No orders yet for {fmtDate(tuesday)} – {fmtDate(monday)}. Standing orders will auto-submit {fmtDateFull(sunday)} at 1:00pm.
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
                        if (!order) return <td key={w.id} className="center" style={{ color: 'var(--gray-300)' }}>—</td>
                        const total = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0
                        return (
                          <td key={w.id} className="center">
                            <div style={{ fontWeight: 600 }}>{total} loaves</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{order.is_par ? 'par' : 'manual'}</div>
                            <div style={{ marginTop: 6 }}>
                              {order.order_items?.map((item: any, i: number) => (
                                <div key={i} style={{ fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.4 }}>
                                  {item.quantity}× {item.product.sku}{item.sliced ? ' (sl)' : ''}
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

      {/* ── CUSTOMERS TAB ── */}
      {tab === 'customers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <p className="page-subtitle" style={{ margin: 0 }}>{allCustomers.length} customers</p>
            {customerSuccess && <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>✓ {customerSuccess}</span>}
            <button onClick={startNewCustomer} className="btn btn-primary">+ Add customer</button>
          </div>
          {editingCustomer && (
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 24, marginBottom: 32, background: 'var(--gray-50)' }}>
              <h2 style={{ marginTop: 0, marginBottom: 20 }}>{editingCustomer === 'new' ? 'New customer' : `Edit: ${editingCustomer.name}`}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <div style={formRowStyle}>
                  <label className="form-label">Name *</label>
                  <input style={formFieldStyle} value={customerForm.name} onChange={e => setCustomerForm((p: any) => ({ ...p, name: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Contact name</label>
                  <input style={formFieldStyle} value={customerForm.contact_name} onChange={e => setCustomerForm((p: any) => ({ ...p, contact_name: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Email *</label>
                  <input type="email" style={formFieldStyle} value={customerForm.email} onChange={e => setCustomerForm((p: any) => ({ ...p, email: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Phone</label>
                  <input style={formFieldStyle} value={customerForm.phone} onChange={e => setCustomerForm((p: any) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Type</label>
                  <select style={formFieldStyle} value={customerForm.type} onChange={e => setCustomerForm((p: any) => ({ ...p, type: e.target.value }))}>
                    {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Delivery day</label>
                  <select style={formFieldStyle} value={customerForm.delivery_day} onChange={e => setCustomerForm((p: any) => ({ ...p, delivery_day: e.target.value }))}>
                    {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}>
                  <label className="form-label">Address</label>
                  <input style={formFieldStyle} value={customerForm.address} onChange={e => setCustomerForm((p: any) => ({ ...p, address: e.target.value }))} />
                </div>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}>
                  <label className="form-label">Notes</label>
                  <textarea style={{ ...formFieldStyle, resize: 'vertical' }} rows={2} value={customerForm.notes} onChange={e => setCustomerForm((p: any) => ({ ...p, notes: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={customerForm.active} onChange={e => setCustomerForm((p: any) => ({ ...p, active: e.target.checked }))} />
                    Active
                  </label>
                </div>
              </div>
              {customerError && <p style={{ color: 'red', marginBottom: 12 }}>{customerError}</p>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSaveCustomer} disabled={savingCustomer} className="btn btn-primary">
                  {savingCustomer ? 'Saving...' : 'Save customer'}
                </button>
                <button onClick={() => setEditingCustomer(null)} className="btn" style={{ background: 'var(--gray-100)', color: 'var(--gray-900)' }}>Cancel</button>
              </div>
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Email</th><th>Type</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {allCustomers.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{c.contact_name || '—'}</td>
                  <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{c.email}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{c.type}</td>
                  <td>{c.active ? '✓' : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => startEditCustomer(c)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab === 'products' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <p className="page-subtitle" style={{ margin: 0 }}>{allProducts.length} products</p>
            {productSuccess && <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>✓ {productSuccess}</span>}
            <button onClick={startNewProduct} className="btn btn-primary">+ Add product</button>
          </div>

          {editingProduct && (
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 24, marginBottom: 32, background: 'var(--gray-50)' }}>
              <h2 style={{ marginTop: 0, marginBottom: 20 }}>{editingProduct === 'new' ? 'New product' : `Edit: ${editingProduct.name}`}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}>
                  <label className="form-label">Name *</label>
                  <input style={formFieldStyle} value={productForm.name} onChange={e => setProductForm((p: any) => ({ ...p, name: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">SKU *</label>
                  <input style={formFieldStyle} value={productForm.sku} onChange={e => setProductForm((p: any) => ({ ...p, sku: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Min/week</label>
                  <input type="number" min="0" style={formFieldStyle} value={productForm.minimum_quantity} onChange={e => setProductForm((p: any) => ({ ...p, minimum_quantity: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Default price ($)</label>
                  <input type="number" min="0" step="0.01" style={formFieldStyle} value={productForm.price_cents} onChange={e => setProductForm((p: any) => ({ ...p, price_cents: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Unit label</label>
                  <input style={formFieldStyle} value={productForm.unit_label} onChange={e => setProductForm((p: any) => ({ ...p, unit_label: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label className="form-label">Sort order</label>
                  <input type="number" style={formFieldStyle} value={productForm.sort_order} onChange={e => setProductForm((p: any) => ({ ...p, sort_order: e.target.value }))} />
                </div>
                <div style={formRowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginTop: 24 }}>
                    <input type="checkbox" checked={productForm.can_be_sliced} onChange={e => setProductForm((p: any) => ({ ...p, can_be_sliced: e.target.checked }))} />
                    Can be sliced
                  </label>
                </div>
                <div style={formRowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginTop: 8 }}>
                    <input type="checkbox" checked={productForm.active} onChange={e => setProductForm((p: any) => ({ ...p, active: e.target.checked }))} />
                    Active
                  </label>
                </div>
              </div>
              {productError && <p style={{ color: 'red', marginBottom: 12 }}>{productError}</p>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSaveProduct} disabled={savingProduct} className="btn btn-primary">
                  {savingProduct ? 'Saving...' : 'Save product'}
                </button>
                <button onClick={() => setEditingProduct(null)} className="btn" style={{ background: 'var(--gray-100)', color: 'var(--gray-900)' }}>Cancel</button>
              </div>
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>SKU</th><th>Min/week</th><th>Price</th><th>Sliceable</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {allProducts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{p.sku}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{p.minimum_quantity ?? 10}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : '—'}</td>
                  <td>{p.can_be_sliced ? '✓' : '—'}</td>
                  <td>{p.active ? '✓' : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => startEditProduct(p)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div style={{ maxWidth: 480 }}>
          <p className="page-subtitle">Invite a contact at a customer to log in. They'll receive a magic link by email.</p>
          <div style={formRowStyle}>
            <label className="form-label">Email address</label>
            <input type="email" style={formFieldStyle} value={userForm.email}
              onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
              placeholder="contact@restaurant.com" />
          </div>
          <div style={formRowStyle}>
            <label className="form-label">Customer</label>
            <select style={formFieldStyle} value={userForm.customer_id}
              onChange={e => setUserForm(p => ({ ...p, customer_id: e.target.value }))}>
              <option value="">Select a customer...</option>
              {allCustomers.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ ...formRowStyle, marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={userForm.is_admin}
                onChange={e => setUserForm(p => ({ ...p, is_admin: e.target.checked }))} />
              Admin access
            </label>
          </div>
          {userError && <p style={{ color: 'red', marginBottom: 12 }}>{userError}</p>}
          {userSuccess && <span className="alert alert-success" style={{ display: 'block', marginBottom: 16, padding: '8px 12px' }}>✓ {userSuccess}</span>}
          <button onClick={handleInviteUser} disabled={inviting} className="btn btn-primary">
            {inviting ? 'Sending invite...' : 'Send invite'}
          </button>
        </div>
      )}

      {/* ── PRICING TAB ── */}
      {tab === 'pricing' && (
  <div style={{ maxWidth: 640 }}>
    <p style={{fontSize:11,color:'red'}}>prices keys: {Object.keys(prices).length} — selected: {selectedCustomerId?.slice(0,8)}</p>
    <p className="page-subtitle">Set custom prices per customer. Leave blank to use the default product price.</p>
          <div style={{ marginBottom: 32 }}>
            <label className="form-label">Customer</label>
            <select value={selectedCustomerId || ''} onChange={e => setSelectedCustomerId(e.target.value)}
              className="text-input" style={{ maxWidth: 320, marginTop: 8 }}>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                            key={`${selectedCustomerId}-${p.id}`}
                            placeholder={p.price_cents ? (p.price_cents / 100).toFixed(2) : '0.00'}
                            value={prices[p.id] ?? ''}
                            onChange={e => setPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                            style={{
                              width: 80, textAlign: 'right', padding: '6px 4px',
                              border: '1px solid var(--border)', borderRadius: 4,
                              fontSize: 14, fontFamily: 'var(--font)',
                              color: 'var(--black)', background: '#fff',
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button onClick={handleSavePrices} disabled={savingPrices} className="btn btn-primary">
                  {savingPrices ? 'Saving...' : 'Save prices'}
                </button>
                {priceSaved && <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>✓ Prices saved</span>}
                {priceError && <span className="alert alert-error" style={{ margin: 0, padding: '6px 12px' }}>{priceError}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}