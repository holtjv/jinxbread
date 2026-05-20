import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Runs at 18:00 UTC Sunday = 13:00 Central (CDT, UTC-5)
// NOTE: adjust to 19:00 UTC during CST (UTC-6) Nov-Mar

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY_OF_WEEK_TO_OFFSET: Record<string, number> = {
  // Offsets from Sunday (day cron runs) to the next occurrence of that day
  // Delivery window is Tue–Mon. Cron runs Sunday.
  monday:    8,
  tuesday:   2,
  wednesday: 3,
  thursday:  4,
  friday:    5,
  saturday:  6,
}

function getDeliveryDate(dayOfWeek: string, fromDate: Date): string {
  const offset = DAY_OF_WEEK_TO_OFFSET[dayOfWeek]
  if (offset === undefined) throw new Error(`Unknown day_of_week: ${dayOfWeek}`)
  const d = new Date(fromDate)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().split('T')[0]
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const { data: windows, error: windowsError } = await supabase
    .from('delivery_windows')
    .select('*')
    .eq('active', true)

  if (windowsError) {
    console.error('Error fetching delivery windows:', windowsError)
    return NextResponse.json({ error: windowsError.message }, { status: 500 })
  }

  const { data: parCustomers, error: parError } = await supabase
    .from('customer_pars')
    .select('customer_id')

  if (parError) {
    console.error('Error fetching par customers:', parError)
    return NextResponse.json({ error: parError.message }, { status: 500 })
  }

  const customerIds = [...new Set(parCustomers?.map(p => p.customer_id) || [])]

  if (customerIds.length === 0) {
    return NextResponse.json({ message: 'No customers with pars found', created: 0 })
  }

  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name, email')
    .in('id', customerIds)
    .eq('active', true)

  if (customersError) {
    console.error('Error fetching customers:', customersError)
    return NextResponse.json({ error: customersError.message }, { status: 500 })
  }

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const customer of customers || []) {
    for (const window of windows || []) {
      const deliveryDate = getDeliveryDate(window.day_of_week, now)

      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('delivery_window_id', window.id)
        .eq('delivery_date', deliveryDate)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      const { data: pars, error: parsError } = await supabase
        .from('customer_pars')
        .select('product_id, quantity, sliced')
        .eq('customer_id', customer.id)
        .eq('delivery_window_id', window.id)
        .gt('quantity', 0)

      if (parsError) {
        errors.push(`Par fetch error for customer ${customer.id}: ${parsError.message}`)
        continue
      }

      if (!pars || pars.length === 0) {
        continue
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: customer.id,
          delivery_window_id: window.id,
          delivery_date: deliveryDate,
          status: 'pending',
          is_par: true,
          submitted_at: now.toISOString(),
        })
        .select('id')
        .single()

      if (orderError || !order) {
        errors.push(`Order creation error for customer ${customer.id}: ${orderError?.message}`)
        continue
      }

      const items = pars.map(par => ({
        order_id: order.id,
        customer_id: customer.id,
        product_id: par.product_id,
        delivery_window_id: window.id,
        quantity: par.quantity,
        sliced: par.sliced,
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items)

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id)
        errors.push(`Order items error for customer ${customer.id}: ${itemsError.message}`)
        continue
      }

      created++
    }
  }

  console.log(`Par cron complete: ${created} orders created, ${skipped} skipped, ${errors.length} errors`)
  if (errors.length > 0) console.error('Errors:', errors)

  return NextResponse.json({
    message: 'Par order submission complete',
    created,
    skipped,
    errors,
  })
}