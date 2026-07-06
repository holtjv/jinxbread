'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Tab = 'thisweek' | 'orders' | 'pricing' | 'customers' | 'products' | 'users' | 'settings'
type OrderStatus = 'pending' | 'confirmed' | 'in_production' | 'fulfilled' | 'cancelled'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const CUSTOMER_TYPES = ['restaurant', 'grocery']

const EMPTY_CUSTOMER = {
  name: '', contact_name: '', email: '', phone: '',
  type: 'restaurant', address: '', notes: '', active: true,
  is_admin: false,
}

const EMPTY_PRODUCT = {
  name: '', sku: '', price_cents: '', unit_label: 'loaf',
  can_be_sliced: false, active: true, minimum_quantity: '10',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending', confirmed: 'Confirmed', in_production: 'In Production',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<OrderStatus, { background: string; color: string }> = {
  pending: { background: '#fff3cd', color: '#856404' },
  confirmed: { background: '#d4edda', color: '#155724' },
  in_production: { background: '#cce5ff', color: '#004085' },
  fulfilled: { background: '#e2e3e5', color: '#383d41' },
  cancelled: { background: '#f8d7da', color: '#721c24' },
}


export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('thisweek')
  const [orders, setOrders] = useState<any[]>([])
  const [allPars, setAllPars] = useState<any[]>([])
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
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [ordersWeekOffset, setOrdersWeekOffset] = useState(0)

  const [editingCustomer, setEditingCustomer] = useState<any | null>(null)
  const [customerForm, setCustomerForm] = useState<any>(EMPTY_CUSTOMER)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [customerSuccess, setCustomerSuccess] = useState<string | null>(null)

  const [invitePrompt, setInvitePrompt] = useState<{ name: string; email: string; customerId: string } | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteResult, setInviteResult] = useState<string | null>(null)

  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const [productForm, setProductForm] = useState<any>(EMPTY_PRODUCT)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)
  const [productSuccess, setProductSuccess] = useState<string | null>(null)

  const [userForm, setUserForm] = useState({ email: '', customer_id: '', is_admin: false })
  const [inviting, setInviting] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [userSuccess, setUserSuccess] = useState<string | null>(null)

  const [userList, setUserList] = useState<{ email: string; customer_id: string; customer_name: string; created_at: string; status: string }[]>([])
  const [userListLoading, setUserListLoading] = useState(false)
  const [userRowState, setUserRowState] = useState<Record<string, { confirmRemove?: boolean; resending?: boolean; removing?: boolean; message?: string }>>({})

  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [settingsForm, setSettingsForm] = useState<any>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const supabase = createClient()

  function getWeekBounds(offset: number = 0) {
    const today = new Date()
    const day = today.getDay()
    let tueDiff = 2 - day
    if (tueDiff <= 0) tueDiff += 7
    const tuesday = new Date(today)
    tuesday.setDate(today.getDate() + tueDiff + offset * 7)
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

  function fmtWeekRange(tuesday: Date): string {
    const monday = new Date(tuesday)
    monday.setDate(tuesday.getDate() + 6)
    return `${fmtDate(tuesday)}–${fmtDate(monday)}`
  }

  async function loadData() {
    const [ordersRes, parsRes, customersRes, allCustomersRes, productsRes, allProductsRes, cpRes, windowsRes] = await Promise.all([
      supabase.from('orders').select(`
        id, delivery_date, delivery_window_id, status, is_par, customer_id,
        customer:customers (id, name, type),
        order_items (quantity, sliced, product_id, product:products (name, sku))
      `).order('delivery_date', { ascending: true }),
      supabase.from('customer_pars').select(`
        customer_id, delivery_window_id, quantity,
        product:products (id, name, sku)
      `).gt('quantity', 0),
      supabase.from('customers').select('id, name').eq('active', true).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('id, name, sku, price_cents, unit_label, minimum_quantity').eq('active', true).order('sort_order', { nullsFirst: false }).order('name'),
      supabase.from('products').select('*').order('sort_order', { nullsFirst: false }).order('name'),
      supabase.from('customer_products').select('customer_id, product_id, price_cents'),
      supabase.from('delivery_windows').select('*').eq('active', true).order('sort_order'),
    ])

    if (ordersRes.data) setOrders(ordersRes.data)
    if (parsRes.data) setAllPars(parsRes.data)
    if (customersRes.data) {
      setCustomers(customersRes.data)
      // Only reset selectedCustomerId if not already set or if in an invite flow
      if (!selectedCustomerId && !invitePrompt) {
        setSelectedCustomerId(customersRes.data[0]?.id || null)
      }
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

  function getWeekOrders(offset: number) {
    const { tuesday, monday } = getWeekBounds(offset)
    return orders.filter((o: any) => {
      const d = new Date(o.delivery_date + 'T12:00:00')
      return d >= tuesday && d <= monday
    })
  }

  function buildOrderMap(weekOrders: any[]) {
    const map: Record<string, Record<string, any>> = {}
    weekOrders.forEach((o: any) => {
      if (!map[o.customer_id]) map[o.customer_id] = {}
      map[o.customer_id][o.delivery_window_id] = o
    })
    return map
  }

  // Build par map: customer_id -> window_id -> { items, total }
  function buildParMap() {
    const map: Record<string, Record<string, { items: { name: string; sku: string; quantity: number }[]; total: number }>> = {}
    allPars.forEach((p: any) => {
      if (!map[p.customer_id]) map[p.customer_id] = {}
      if (!map[p.customer_id][p.delivery_window_id]) map[p.customer_id][p.delivery_window_id] = { items: [], total: 0 }
      map[p.customer_id][p.delivery_window_id].items.push({
        name: p.product?.name || '',
        sku: p.product?.sku || '',
        quantity: p.quantity,
      })
      map[p.customer_id][p.delivery_window_id].total += p.quantity
    })
    return map
  }

  function buildProductionTotals(weekOrders: any[], parMap: Record<string, Record<string, any>>, orderMap: Record<string, Record<string, any>>) {
    const totals: Record<string, any> = {}

    // From submitted orders
    weekOrders.forEach((order: any) => {
      order.order_items?.forEach((line: any) => {
        const key = `${line.product.sku}|${line.sliced}`
        if (!totals[key]) totals[key] = { name: line.product.name, sku: line.product.sku, sliced: line.sliced, quantity: 0 }
        totals[key].quantity += line.quantity
      })
    })

    // From unsubmitted pars
    Object.entries(parMap).forEach(([customerId, windows]) => {
      Object.entries(windows).forEach(([windowId, parData]) => {
        // Only add if no submitted order exists for this customer/window
        if (!orderMap[customerId]?.[windowId]) {
          parData.items.forEach((item: any) => {
            const key = `${item.sku}|false`
            if (!totals[key]) totals[key] = { name: item.name, sku: item.sku, sliced: false, quantity: 0 }
            totals[key].quantity += item.quantity
          })
        }
      })
    })

    return Object.values(totals).sort((a: any, b: any) => a.name.localeCompare(b.name))
  }

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setUpdatingStatus(orderId)
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (!error) setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    setUpdatingStatus(null)
  }

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
    setInvitePrompt(null)
    setInviteResult(null)
    setCustomerForm({
      name: c.name || '', contact_name: c.contact_name || '', email: c.email || '',
      phone: c.phone || '', type: c.type || 'restaurant',
      address: c.address || '', notes: c.notes || '', active: c.active ?? true,
      is_admin: c.is_admin ?? false,
    })
    setCustomerError(null)
    setCustomerSuccess(null)
  }

  function startNewCustomer() {
    setEditingCustomer('new')
    setInvitePrompt(null)
    setInviteResult(null)
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
      type: customerForm.type,
      address: customerForm.address.trim() || null, notes: customerForm.notes.trim() || null,
      active: customerForm.active,
      is_admin: false,
    }
    const isNew = editingCustomer === 'new'
    if (isNew) {
      const { data, error } = await supabase.from('customers').insert(payload).select().single()
      if (error) { setCustomerError(error.message); setSavingCustomer(false); return }
      if (data) {
        console.log('Created customer:', { name: data.name, id: data.id })
        setInvitePrompt({ name: customerForm.name.trim(), email: customerForm.email.trim(), customerId: data.id })
      }
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

  async function handleSendInvite() {
    if (!invitePrompt) return
    setSendingInvite(true)
    console.log('Sending invite:', { email: invitePrompt.email, customer_id: invitePrompt.customerId, name: invitePrompt.name })
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: invitePrompt.email, customer_id: invitePrompt.customerId, is_admin: false }),
    })
    const data = await res.json()
    setSendingInvite(false)
    if (!res.ok) {
      setInviteResult(`Failed to send invite: ${data.error}`)
    } else {
      setInviteResult(`Invite sent to ${invitePrompt.email}`)
    }
    setInvitePrompt(null)
    setTimeout(() => setInviteResult(null), 6000)
  }

  function startEditProduct(p: any) {
    setEditingProduct(p)
    setProductForm({
      name: p.name || '', sku: p.sku || '',
      price_cents: p.price_cents ? (p.price_cents / 100).toFixed(2) : '',
      unit_label: p.unit_label || 'loaf', can_be_sliced: p.can_be_sliced ?? false,
      active: p.active ?? true,
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
      active: productForm.active,
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

  async function loadSettings() {
    setSettingsLoading(true)
    const { data, error } = await supabase
      .from('bakery_settings')
      .select('id, bakery_name, timezone, cutoff_day, cutoff_time, reminder_offset_hours, par_reminder_day_offset, par_reminder_hour')
      .single()
    if (data) {
      setSettingsId(data.id)
      setSettingsForm({
        bakery_name: data.bakery_name,
        timezone: data.timezone,
        cutoff_day: data.cutoff_day,
        cutoff_time: (data.cutoff_time as string)?.slice(0, 5) ?? '',
        reminder_offset_hours: data.reminder_offset_hours,
        par_reminder_day_offset: data.par_reminder_day_offset,
        par_reminder_hour: data.par_reminder_hour,
      })
    }
    if (error) setSettingsError('Failed to load settings')
    setSettingsLoading(false)
  }

  async function handleSaveSettings() {
    if (!settingsForm) return
    setSettingsSaving(true)
    setSettingsSaved(false)
    setSettingsError(null)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: settingsId, ...settingsForm }),
    })
    const data = await res.json()
    setSettingsSaving(false)
    if (!res.ok) {
      setSettingsError(data.error || 'Failed to save settings')
    } else {
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 4000)
    }
  }

  async function loadUsers() {
    setUserListLoading(true)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    if (data.users) setUserList(data.users)
    setUserListLoading(false)
  }

  useEffect(() => { if (tab === 'users') loadUsers() }, [tab])
  useEffect(() => { if (tab === 'settings') loadSettings() }, [tab])

  async function handleResendInvite(email: string, customer_id: string) {
    setUserRowState(prev => ({ ...prev, [email]: { ...prev[email], resending: true, message: undefined } }))
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, customer_id, is_admin: false }),
    })
    const data = await res.json()
    setUserRowState(prev => ({
      ...prev,
      [email]: { resending: false, message: res.ok ? 'Invite sent' : (data.error || 'Failed') },
    }))
    setTimeout(() => setUserRowState(prev => ({ ...prev, [email]: { ...prev[email], message: undefined } })), 5000)
  }

  async function handleRemoveUser(email: string) {
    setUserRowState(prev => ({ ...prev, [email]: { ...prev[email], removing: true, confirmRemove: false } }))
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setUserList(prev => prev.filter(u => u.email !== email))
    } else {
      const data = await res.json()
      setUserRowState(prev => ({ ...prev, [email]: { removing: false, message: data.error || 'Failed to remove' } }))
    }
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
    loadUsers()
    setTimeout(() => setUserSuccess(null), 6000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const tabLabels: Record<Tab, string> = {
    thisweek: 'This Week', orders: 'Orders', customers: 'Customers',
    products: 'Products', users: 'Users', pricing: 'Customer Pricing', settings: 'Settings',
  }

  const formFieldStyle = {
    display: 'block' as const, width: '100%', padding: '8px 10px',
    border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 14,
    fontFamily: 'var(--font)', color: 'var(--gray-900)', background: '#fff', marginTop: 4,
  }
  const formRowStyle = { marginBottom: 16 }
  const settingsLabelStyle = {
    display: 'block' as const,
    fontSize: 12, fontWeight: 600,
    color: 'var(--gray-500)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 6,
  }

  function WeekGrid({ offset }: { offset: number }) {
    const { tuesday, monday, sunday } = getWeekBounds(offset)
    const weekOrders = getWeekOrders(offset)
    const orderMap = buildOrderMap(weekOrders)
    const parMap = buildParMap()
    const productionTotals = buildProductionTotals(weekOrders, parMap, orderMap)

    // Build full customer list: anyone with a submitted order OR a par
    const orderCustomerIds = new Set(weekOrders.map((o: any) => o.customer_id))
    const parCustomerIds = new Set(Object.keys(parMap))
    const allCustomerIds = new Set([...orderCustomerIds, ...parCustomerIds])
    const weekCustomers = customers.filter(c => allCustomerIds.has(c.id))

    return (
      <>
        <p className="page-subtitle">
          Orders for {fmtDate(tuesday)}–{fmtDate(monday)}. Cutoff is {fmtDateFull(sunday)} at noon.
        </p>

        {productionTotals.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>Production totals</h2>
            <table className="data-table" style={{ marginBottom: 32 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Sliced</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {productionTotals.map((t: any, i: number) => (
                  <tr key={i}>
                    <td>{t.name}</td>
                    <td style={{ color: 'var(--gray-500)' }}>{t.sku}</td>
                    <td>{t.sliced ? 'Yes' : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {weekCustomers.length === 0 ? (
          <p style={{ color: 'var(--gray-500)', marginTop: 24 }}>
            No orders or standing orders for {fmtDate(tuesday)}–{fmtDate(monday)}.
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
                {weekCustomers.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    {deliveryWindows.map(w => {
                      const order = orderMap[c.id]?.[w.id]
                      const par = parMap[c.id]?.[w.id]

                      if (order) {
                        // Submitted order — show normally
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
                      } else if (par) {
                        // Unsubmitted par — show muted with "standing" label
                        return (
                          <td key={w.id} className="center">
                            <div style={{ fontWeight: 600, color: 'var(--gray-400)' }}>{par.total} loaves</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>standing</div>
                            <div style={{ marginTop: 6 }}>
                              {par.items.map((item: any, i: number) => (
                                <div key={i} style={{ fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.4 }}>
                                  {item.quantity}× {item.sku}
                                </div>
                              ))}
                            </div>
                          </td>
                        )
                      } else {
                        return <td key={w.id} className="center" style={{ color: 'var(--gray-300)' }}>—</td>
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  }

  return (
    <div>
      <h1>Admin</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '2px solid var(--gray-200)', flexWrap: 'wrap' as const }}>
        {(['thisweek', 'orders', 'customers', 'products', 'users', 'pricing', 'settings'] as Tab[]).map(t => (
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

      {tab === 'thisweek' && <WeekGrid offset={0} />}

      {tab === 'orders' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {[0, 1, 2, 3].map(offset => {
              const { tuesday } = getWeekBounds(offset)
              const weekRange = fmtWeekRange(tuesday)
              const hasOrders = getWeekOrders(offset).length > 0
              const isSelected = ordersWeekOffset === offset
              const labels = ['This week', 'Next week', '2 weeks out', '3 weeks out']
              return (
                <button
                  key={offset}
                  onClick={() => setOrdersWeekOffset(offset)}
                  style={{
                    flex: '1 1 120px', padding: '10px 12px',
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--gray-200)'}`,
                    borderRadius: 8,
                    background: isSelected ? 'var(--accent-light, #f0f7ff)' : '#fff',
                    cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'var(--font)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {labels[offset]}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--gray-900)', marginBottom: 4 }}>
                    {weekRange}
                  </div>
                  {hasOrders && (
                    <div style={{ fontSize: 10, color: isSelected ? 'var(--accent)' : '#2563eb' }}>Has orders</div>
                  )}
                </button>
              )
            })}
          </div>
          <WeekGrid offset={ordersWeekOffset} />
        </>
      )}

      {tab === 'customers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <p className="page-subtitle" style={{ margin: 0 }}>{allCustomers.length} customers</p>
            {customerSuccess && <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>✓ {customerSuccess}</span>}
            <button onClick={startNewCustomer} className="btn btn-primary">+ Add customer</button>
          </div>

          {invitePrompt && (
            <div style={{ border: '1px solid var(--accent)', borderRadius: 8, padding: '16px 20px', marginBottom: 24, background: 'var(--accent-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 14 }}>Send <strong>{invitePrompt.name}</strong> an invite to log in?</div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={handleSendInvite} disabled={sendingInvite} className="btn btn-primary" style={{ padding: '7px 16px', fontSize: 13 }}>
                  {sendingInvite ? 'Sending...' : 'Send invite'}
                </button>
                <button onClick={() => setInvitePrompt(null)} className="btn" style={{ padding: '7px 16px', fontSize: 13, background: 'var(--gray-100)', color: 'var(--gray-900)' }}>Skip</button>
              </div>
            </div>
          )}

          {inviteResult && (
            <span className="alert alert-success" style={{ display: 'block', marginBottom: 16, padding: '8px 12px' }}>✓ {inviteResult}</span>
          )}

          {editingCustomer && (
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 24, marginBottom: 32, background: 'var(--gray-50)' }}>
              <h2 style={{ marginTop: 0, marginBottom: 20 }}>{editingCustomer === 'new' ? 'New customer' : `Edit: ${editingCustomer.name}`}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <div style={formRowStyle}><label className="form-label">Name *</label><input style={formFieldStyle} value={customerForm.name} onChange={e => setCustomerForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Contact name</label><input style={formFieldStyle} value={customerForm.contact_name} onChange={e => setCustomerForm((p: any) => ({ ...p, contact_name: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Email *</label><input type="email" style={formFieldStyle} value={customerForm.email} onChange={e => setCustomerForm((p: any) => ({ ...p, email: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Phone</label><input style={formFieldStyle} value={customerForm.phone} onChange={e => setCustomerForm((p: any) => ({ ...p, phone: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Type</label><select style={formFieldStyle} value={customerForm.type} onChange={e => setCustomerForm((p: any) => ({ ...p, type: e.target.value }))}>{CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}><label className="form-label">Address</label><input style={formFieldStyle} value={customerForm.address} onChange={e => setCustomerForm((p: any) => ({ ...p, address: e.target.value }))} /></div>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}><label className="form-label">Notes</label><textarea style={{ ...formFieldStyle, resize: 'vertical' }} rows={2} value={customerForm.notes} onChange={e => setCustomerForm((p: any) => ({ ...p, notes: e.target.value }))} /></div>
                <div style={formRowStyle}><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}><input type="checkbox" checked={customerForm.active} onChange={e => setCustomerForm((p: any) => ({ ...p, active: e.target.checked }))} />Active</label></div>
              </div>
              {customerError && <p style={{ color: 'red', marginBottom: 12 }}>{customerError}</p>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSaveCustomer} disabled={savingCustomer} className="btn btn-primary">{savingCustomer ? 'Saving...' : 'Save customer'}</button>
                <button onClick={() => setEditingCustomer(null)} className="btn" style={{ background: 'var(--gray-100)', color: 'var(--gray-900)' }}>Cancel</button>
              </div>
            </div>
          )}

          <table className="data-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Type</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {allCustomers.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{c.contact_name || '—'}</td>
                  <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{c.email}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{c.type}</td>
                  <td>{c.active ? '✓' : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right' }}><button onClick={() => startEditCustomer(c)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}><label className="form-label">Name *</label><input style={formFieldStyle} value={productForm.name} onChange={e => setProductForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">SKU *</label><input style={formFieldStyle} value={productForm.sku} onChange={e => setProductForm((p: any) => ({ ...p, sku: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Min/week</label><input type="number" min="0" style={formFieldStyle} value={productForm.minimum_quantity} onChange={e => setProductForm((p: any) => ({ ...p, minimum_quantity: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Default price ($)</label><input type="number" min="0" step="0.01" style={formFieldStyle} value={productForm.price_cents} onChange={e => setProductForm((p: any) => ({ ...p, price_cents: e.target.value }))} /></div>
                <div style={formRowStyle}><label className="form-label">Unit label</label><input style={formFieldStyle} value={productForm.unit_label} onChange={e => setProductForm((p: any) => ({ ...p, unit_label: e.target.value }))} /></div>
                <div style={formRowStyle}><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginTop: 24 }}><input type="checkbox" checked={productForm.can_be_sliced} onChange={e => setProductForm((p: any) => ({ ...p, can_be_sliced: e.target.checked }))} />Can be sliced</label></div>
                <div style={formRowStyle}><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginTop: 8 }}><input type="checkbox" checked={productForm.active} onChange={e => setProductForm((p: any) => ({ ...p, active: e.target.checked }))} />Active</label></div>
              </div>
              {productError && <p style={{ color: 'red', marginBottom: 12 }}>{productError}</p>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSaveProduct} disabled={savingProduct} className="btn btn-primary">{savingProduct ? 'Saving...' : 'Save product'}</button>
                <button onClick={() => setEditingProduct(null)} className="btn" style={{ background: 'var(--gray-100)', color: 'var(--gray-900)' }}>Cancel</button>
              </div>
            </div>
          )}

          <table className="data-table">
            <thead><tr><th>Name</th><th>SKU</th><th>Min/week</th><th>Price</th><th>Sliceable</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {allProducts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{p.sku}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{p.minimum_quantity ?? 10}</td>
                  <td style={{ color: 'var(--gray-500)' }}>{p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : '—'}</td>
                  <td>{p.can_be_sliced ? '✓' : '—'}</td>
                  <td>{p.active ? '✓' : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right' }}><button onClick={() => startEditProduct(p)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div style={{ maxWidth: 480, marginBottom: 40 }}>
            <p className="page-subtitle">Invite a contact at a customer to log in. They'll receive a magic link by email.</p>
            <div style={formRowStyle}>
              <label className="form-label">Email address</label>
              <input type="email" style={formFieldStyle} value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="contact@restaurant.com" />
            </div>
            <div style={formRowStyle}>
              <label className="form-label">Customer</label>
              <select style={formFieldStyle} value={userForm.customer_id} onChange={e => setUserForm(p => ({ ...p, customer_id: e.target.value }))}>
                <option value="">Select a customer...</option>
                {allCustomers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ ...formRowStyle, marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={userForm.is_admin} onChange={e => setUserForm(p => ({ ...p, is_admin: e.target.checked }))} />
                Admin access
              </label>
            </div>
            {userError && <p style={{ color: 'red', marginBottom: 12 }}>{userError}</p>}
            {userSuccess && <span className="alert alert-success" style={{ display: 'block', marginBottom: 16, padding: '8px 12px' }}>✓ {userSuccess}</span>}
            <button onClick={handleInviteUser} disabled={inviting} className="btn btn-primary">{inviting ? 'Sending invite...' : 'Send invite'}</button>
          </div>

          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Existing users</h2>
          {userListLoading ? (
            <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Loading...</p>
          ) : userList.length === 0 ? (
            <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>No users yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Invited</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {userList.map(u => {
                  const row = userRowState[u.email] ?? {}
                  return (
                    <tr key={u.email}>
                      <td style={{ fontWeight: 500 }}>{u.customer_name}</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{u.email}</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>
                        {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          background: u.status === 'Active' ? '#d4edda' : '#fff3cd',
                          color: u.status === 'Active' ? '#155724' : '#856404',
                        }}>
                          {u.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {row.message ? (
                          <span style={{ fontSize: 12, color: row.message === 'Invite sent' ? '#155724' : 'red' }}>{row.message}</span>
                        ) : row.confirmRemove ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>Remove this user?</span>
                            <button onClick={() => handleRemoveUser(u.email)} disabled={row.removing} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600 }}>
                              {row.removing ? 'Removing...' : 'Yes'}
                            </button>
                            <button onClick={() => setUserRowState(prev => ({ ...prev, [u.email]: {} }))} style={{ background: 'none', border: 'none', color: 'var(--gray-500)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', gap: 12 }}>
                            {u.status === 'Pending' && (
                              <button
                                onClick={() => handleResendInvite(u.email, u.customer_id)}
                                disabled={row.resending}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}
                              >
                                {row.resending ? 'Sending...' : 'Resend invite'}
                              </button>
                            )}
                            <button
                              onClick={() => setUserRowState(prev => ({ ...prev, [u.email]: { confirmRemove: true } }))}
                              style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ maxWidth: 540 }}>
          <p className="page-subtitle">Bakery-wide configuration. Changes take effect immediately for all ordering windows and customer-facing copy.</p>
          {settingsLoading ? (
            <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Loading...</p>
          ) : !settingsForm ? (
            <p style={{ color: 'red', fontSize: 14 }}>{settingsError || 'Failed to load settings.'}</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', alignItems: 'start' }}>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}>
                  <label style={settingsLabelStyle}>Bakery name</label>
                  <input style={formFieldStyle} value={settingsForm.bakery_name} onChange={e => setSettingsForm((p: any) => ({ ...p, bakery_name: e.target.value }))} />
                </div>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}>
                  <label style={settingsLabelStyle}>Timezone</label>
                  <select style={formFieldStyle} value={settingsForm.timezone} onChange={e => setSettingsForm((p: any) => ({ ...p, timezone: e.target.value }))}>
                    {Intl.supportedValuesOf('timeZone').map((tz: string) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
                <div style={formRowStyle}>
                  <label style={settingsLabelStyle}>Cutoff day</label>
                  <select style={formFieldStyle} value={settingsForm.cutoff_day} onChange={e => setSettingsForm((p: any) => ({ ...p, cutoff_day: e.target.value }))}>
                    {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
                <div style={formRowStyle}>
                  <label style={settingsLabelStyle}>Cutoff time</label>
                  <select style={formFieldStyle} value={settingsForm.cutoff_time} onChange={e => setSettingsForm((p: any) => ({ ...p, cutoff_time: e.target.value }))}>
                    {Array.from({ length: 48 }, (_, i) => {
                      const totalMins = i * 30
                      const h24 = Math.floor(totalMins / 60)
                      const m = totalMins % 60
                      const value = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                      const h12 = h24 === 0 || h24 === 12 ? 12 : h24 % 12
                      const label = `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
                      return <option key={value} value={value}>{label}</option>
                    })}
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 4, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Reminders</p>
                <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Both reminders apply to all customers and all order types.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <div style={{ ...formRowStyle, gridColumn: '1 / -1' }}>
                  <label style={settingsLabelStyle}>Reminder 1</label>
                  <select style={formFieldStyle} value={settingsForm.reminder_offset_hours} onChange={e => setSettingsForm((p: any) => ({ ...p, reminder_offset_hours: parseInt(e.target.value) }))}>
                    {[1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>{h} hour{h !== 1 ? 's' : ''} before cutoff</option>)}
                  </select>
                </div>
                <div style={formRowStyle}>
                  <label style={settingsLabelStyle}>Reminder 2 — day</label>
                  <select style={formFieldStyle} value={settingsForm.par_reminder_day_offset} onChange={e => setSettingsForm((p: any) => ({ ...p, par_reminder_day_offset: parseInt(e.target.value) }))}>
                    {[1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''} before cutoff</option>)}
                  </select>
                </div>
                <div style={formRowStyle}>
                  <label style={settingsLabelStyle}>Reminder 2 — hour</label>
                  <select style={formFieldStyle} value={settingsForm.par_reminder_hour} onChange={e => setSettingsForm((p: any) => ({ ...p, par_reminder_hour: parseInt(e.target.value) }))}>
                    {Array.from({ length: 24 }, (_, h) => {
                      const h12 = h === 0 || h === 12 ? 12 : h % 12
                      const label = `${h12}:00 ${h < 12 ? 'AM' : 'PM'}`
                      return <option key={h} value={h}>{label}</option>
                    })}
                  </select>
                </div>
              </div>

              {settingsError && <p style={{ color: 'red', marginBottom: 12, fontSize: 14 }}>{settingsError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                {settingsSaved && <span className="alert alert-success" style={{ margin: 0, padding: '6px 12px' }}>✓ Settings saved</span>}
                <button onClick={handleSaveSettings} disabled={settingsSaving} className="btn btn-primary">
                  {settingsSaving ? 'Saving...' : 'Save settings'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'pricing' && (
        <div style={{ maxWidth: 640 }}>
          <p className="page-subtitle">Set custom prices per customer. Leave blank to use the default product price.</p>
          <div style={{ marginBottom: 32 }}>
            <label className="form-label">Customer</label>
            <select value={selectedCustomerId || ''} onChange={e => setSelectedCustomerId(e.target.value)} className="text-input" style={{ maxWidth: 320, marginTop: 8 }}>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {selectedCustomerId && (
            <>
              <table className="data-table" style={{ marginBottom: 24 }}>
                <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Default price</th><th style={{ textAlign: 'right' }}>Custom price</th></tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td><div>{p.name}</div><div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{p.sku}</div></td>
                      <td style={{ textAlign: 'right', color: 'var(--gray-500)' }}>{p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>$</span>
                          <input type="number" min="0" step="0.01" key={`${selectedCustomerId}-${p.id}`}
                            placeholder={p.price_cents ? (p.price_cents / 100).toFixed(2) : '0.00'}
                            value={prices[p.id] ?? ''}
                            onChange={e => setPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                            style={{ width: 80, textAlign: 'right', padding: '6px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 14, fontFamily: 'var(--font)', color: 'var(--black)', background: '#fff' }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button onClick={handleSavePrices} disabled={savingPrices} className="btn btn-primary">{savingPrices ? 'Saving...' : 'Save prices'}</button>
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