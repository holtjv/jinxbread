'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

export default function AdminPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          delivery_date,
          status,
          is_par,
          customer:customers (name, type),
          order_lines (
            quantity,
            sliced,
            product:products (name, sku)
          )
        `)
        .order('delivery_date', { ascending: true })

      if (error) {
        console.error(error)
      } else {
        setOrders(data || [])
        if (data && data.length > 0) {
          setSelectedDate(data[0].delivery_date)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  const dates = [...new Set(orders.map((o: any) => o.delivery_date))].sort()
  const dateOrders = orders.filter((o: any) => o.delivery_date === selectedDate)

  const totals: Record<string, any> = {}
  dateOrders.forEach((order: any) => {
    order.order_lines.forEach((line: any) => {
      const key = `${line.product.sku}|${line.sliced}`
      if (!totals[key]) {
        totals[key] = {
          name: line.product.name,
          sku: line.product.sku,
          sliced: line.sliced,
          quantity: 0,
        }
      }
      totals[key].quantity += line.quantity
    })
  })

  const totalsList = Object.values(totals).sort((a: any, b: any) =>
    a.name.localeCompare(b.name)
  )

  if (loading) return <main style={{ padding: 40 }}>Loading...</main>

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px' }}>
      <h1>Admin — Orders</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
        {dates.map((date: any) => (
          <button
            key={date}
            onClick={() => setSelectedDate(date)}
            style={{
              padding: '8px 16px',
              background: selectedDate === date ? '#000' : '#eee',
              color: selectedDate === date ? '#fff' : '#000',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric'
            })}
          </button>
        ))}
      </div>

      {selectedDate && (
        <>
          <h2>Production totals</h2>
          {totalsList.length === 0 ? (
            <p style={{ color: '#999' }}>No orders for this date.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 40 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: '8px 0' }}>Product</th>
                  <th style={{ padding: '8px 0' }}>SKU</th>
                  <th style={{ padding: '8px 0' }}>Sliced</th>
                  <th style={{ padding: '8px 0' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {totalsList.map((t: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 0' }}>{t.name}</td>
                    <td style={{ padding: '10px 0', color: '#999' }}>{t.sku}</td>
                    <td style={{ padding: '10px 0' }}>{t.sliced ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '10px 0', fontWeight: 'bold' }}>{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Orders ({dateOrders.length})</h2>
          {dateOrders.map((order: any) => (
            <div key={order.id} style={{
              border: '1px solid #eee',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{order.customer.name}</strong>
                <span style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: order.status === 'confirmed' ? '#d4edda' : '#fff3cd',
                  color: order.status === 'confirmed' ? '#155724' : '#856404',
                }}>
                  {order.status}{order.is_par ? ' (par)' : ''}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {order.order_lines.map((line: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 0' }}>{line.product.name}</td>
                      <td style={{ padding: '4px 0', color: '#999', fontSize: 13 }}>
                        {line.sliced ? 'sliced' : ''}
                      </td>
                      <td style={{ padding: '4px 0', textAlign: 'right' }}>x{line.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </main>
  )
}