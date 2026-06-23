import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { orderId, customerId, deliveryWindowId, deliveryDate, notes, items } = await req.json()

  if (!customerId || !deliveryWindowId || !deliveryDate || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const submittedAt = new Date().toISOString()
  let resolvedOrderId: string

  if (orderId) {
    // Reuse existing row (active edit or reactivating a cancelled order)
    const { error: delError } = await supabase.from('order_items').delete().eq('order_id', orderId)
    if (delError) return NextResponse.json({ error: `Failed to clear items: ${delError.message}` }, { status: 500 })

    const { error: updateError } = await supabase.from('orders').update({
      status: 'pending', is_par: false, delivery_date: deliveryDate,
      customer_notes: notes || null, submitted_at: submittedAt,
    }).eq('id', orderId)
    if (updateError) return NextResponse.json({ error: `Failed to update order: ${updateError.message}` }, { status: 500 })

    resolvedOrderId = orderId
  } else {
    const { data: order, error: insertError } = await supabase.from('orders').insert({
      customer_id: customerId, delivery_window_id: deliveryWindowId,
      delivery_date: deliveryDate, status: 'pending', is_par: false,
      customer_notes: notes || null, submitted_at: submittedAt,
    }).select('id').single()
    if (insertError || !order) return NextResponse.json({ error: insertError?.message || 'Failed to create order' }, { status: 500 })

    resolvedOrderId = order.id
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('order_items').insert(
      items.map((item: any) => ({ ...item, order_id: resolvedOrderId }))
    )
    if (itemsError) return NextResponse.json({ error: `Failed to insert items: ${itemsError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, orderId: resolvedOrderId })
}
