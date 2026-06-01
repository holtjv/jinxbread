'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { createClient } from '../../lib/supabase'

export default function ParPage() {
  const [products, setProducts] = useState<any[]>([])
  const [deliveryWindows, setDeliveryWindows] = useState<any[]>([])
  const [pars, setPars] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
  const [savedPars, setSavedPars] = useState<Record<string, Record<string, { quantity: number; sliced: boolean }>>>({})
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
    setSavedPars(parMap)
    const hasAny = existingPars && existingPars.length > 0
    setHasSavedOnce(!!hasAny)
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
        setSelectedCustomerName(targetName)
        await loadPars        await loadPars        await loadPars        await loadPars        await loader        await loadPars        await loadPars        await loadPars        await loadPars   lse      }
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
    re    re    re    re    re    re    re    re par    re    re    re    re    re    re    re    re par io    re    re    re    re    re    re    re    re par    reiv    re    re    re    re  dPars[w    re    re    re    re    re    re    re    cons    re    re    re    re    re    re    re    re par    re nst aHas = hasSavedQty(a.id) ? 0 : 1
    const bHas = hasSavedQty(b.id) ? 0 : 1
    return aHas - bHas
  })

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

    const { error: deleteError     const { error: deleteError     const { rs')
      .delete()
      .eq('customer_id', selectedCustomerId)

    if (deleteError) {
                                   el                        setS                              }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
                                                                                                'E      aving: '                                setSaving(false)
        return
      }
    }

    setS    g(f    setS    g(f   (true)
    setSavedPars(pars)
    setHasSavedOnce(true)
    setTimeout(() => setSaved(false), 4000)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const dayShort: Record<string,   const dayShort: Reay  const dayShort: Record<string,   const da    const dayShort: Record<string,   ctu  const dayShort: Record<s
  }
