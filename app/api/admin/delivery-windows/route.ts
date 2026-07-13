import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export async function POST(request: Request) {
  const body = await request.json()
  const { action, id, day_of_week, label, sort_order } = body

  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

  if (action === 'insert') {
    if (!day_of_week || !VALID_DAYS.includes(day_of_week)) {
      return NextResponse.json({ error: 'Invalid day_of_week' }, { status: 400 })
    }
    const { error } = await supabase.from('delivery_windows').insert({
      label, day_of_week, sort_order, active: true,
      cutoff_days_before: 2, cutoff_time: '12:00:00',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'activate') {
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const { error } = await supabase.from('delivery_windows').update({ active: true }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'deactivate') {
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const today = new Date().toISOString().split('T')[0]
    const { data: upcoming } = await supabase
      .from('orders')
      .select('id')
      .eq('delivery_window_id', id)
      .gte('delivery_date', today)
      .limit(1)
    if (upcoming && upcoming.length > 0) {
      return NextResponse.json(
        { error: `There are upcoming orders for ${label}. Update those orders before changing this delivery day.` },
        { status: 409 }
      )
    }
    const { error } = await supabase.from('delivery_windows').update({ active: false }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
