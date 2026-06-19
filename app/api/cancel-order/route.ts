import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { orderIds } = await req.json()

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds required' }, { status: 400 })
  }

  for (const id of orderIds) {
    const { error: itemsError } = await supabase.from('order_items').delete().eq('order_id', id)
    if (itemsError) {
      return NextResponse.json({ error: `Failed to delete order_items for ${id}: ${itemsError.message}` }, { status: 500 })
    }

    const { error: orderError } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
    if (orderError) {
      return NextResponse.json({ error: `Failed to cancel order ${id}: ${orderError.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
