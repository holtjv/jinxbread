import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Runs at 18:00 UTC Sunday = 13:00 Central (CDT, UTC-5)
// NOTE: adjust to 19:00 UTC during CST (UTC-6) Nov-Mar

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const DAY_OF_WEEK_TO_OFFSET: Record<string, number> = {
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

function getWeekRange(fromDate: Date): { weekStart: string; weekEnd: string; weekRange: string; cutoffString: string } {
  // Find the next Tuesday from fromDate
  const day = fromDate.getUTCDay()
  let tueDiff = 2 - day
  if (tueDiff <= 0) tueDiff += 7
  const tue = new Date(fromDate)
  tue.setUTCDate(fromDate.getUTCDate() + tueDiff)

  const mon = new Date(tue)
  mon.setUTCDate(tue.getUTCDate() + 6)

  // Cutoff is the Sunday before that Tuesday
  const cutoffSun = new Date(tue)
  cutoffSun.setUTCDate(tue.getUTCDate() - 2)

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const fmtFull = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return {
    weekStart: tue.toISOString().split('T')[0],
    weekEnd: mon.toISOString().split('T')[0],
    weekRange: `${fmt(tue)}–${fmt(mon)}`,
    cutoffString: fmtFull(cutoffSun),
  }
}

async function sendParConfirmation(
  customer: { id: string; name: string; email: string; contact_name?: string },
  weekStart: string,
  weekEnd: string,
  weekRange: string,
  cutoffString: string
) {
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, delivery_date, is_par,
      delivery_window:delivery_windows (label, day_of_week),
      order_items (
        quantity, sliced,
        product:products (name, sku)
      )
    `)
    .eq('customer_id', customer.id)
    .gte('delivery_date', weekStart)
    .lte('delivery_date', weekEnd)
    .order('delivery_date', { ascending: true })

  if (!orders || orders.length === 0) return

  const firstName = (customer as any).contact_name?.split(' ')[0] || customer.name

  const orderRowsHtml = orders.map((order: any) => {
    const dateStr = new Date(order.delivery_date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    })
    const itemRows = order.order_items?.map((item: any) =>
      `<tr>
        <td style="padding: 4px 0; font-size: 13px; color: #444;">${item.product.name}${item.sliced ? ' <span style="color:#999">(sliced)</span>' : ''}</td>
        <td style="padding: 4px 0; font-size: 13px; text-align: right; font-weight: 600;">×${item.quantity}</td>
      </tr>`
    ).join('')
    const total = order.order_items?.reduce((t: number, i: any) => t + i.quantity, 0) || 0

    return `
      <div style="margin-bottom: 24px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1a1a1a;">${dateStr}</div>
        <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #eee;">
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr style="border-top: 1px solid #eee;">
              <td style="padding: 6px 0; font-size: 12px; color: #999;">Total</td>
              <td style="padding: 6px 0; font-size: 13px; text-align: right; font-weight: 700;">${total} loaves</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
  }).join('')

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <img src="https://jinxbread.vercel.app/logo.png" alt="Jinx Bread" style="width: 80px; height: auto; margin-bottom: 24px;" />
  <p style="color: #555; margin: 0 0 12px 0;">Hi ${firstName},</p>
  <p style="color: #555; margin: 0 0 20px 0;">
    Your standing order for <strong>${weekRange}</strong> has been automatically submitted.
  </p>
  <div style="background: #f0f7ff; border-left: 3px solid #2563eb; padding: 12px 16px; margin-bottom: 28px; border-radius: 0 6px 6px 0;">
    <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1a1a1a;">
      You may edit this order until ${cutoffString} at noon.
    </p>
  </div>
  ${orderRowsHtml}
  <p style="margin: 28px 0;">
    <a href="https://jinxbread.vercel.app/my-orders"
       style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
      View or edit your order
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  <p style="color: #bbb; font-size: 12px; margin: 0;">Jinx Bread · Austin, TX · Reply to this email with any questions.</p>
</body>
</html>
`

  await resend.emails.send({
    from: 'Jinx Bread <orders@jinxbread.com>',
    to: customer.email,
    subject: `Your standing order for ${weekRange} has been submitted`,
    html,
  })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const { weekStart, weekEnd, weekRange, cutoffString } = getWeekRange(now)

  const { data: windows, error: windowsError } = await supabase
    .from('delivery_windows')
    .select('*')
    .eq('active', true)

  if (windowsError) {
    return NextResponse.json({ error: windowsError.message }, { status: 500 })
  }

  const { data: parCustomers, error: parError } = await supabase
    .from('customer_pars')
    .select('customer_id')

  if (parError) {
    return NextResponse.json({ error: parError.message }, { status: 500 })
  }

  const customerIds = [...new Set(parCustomers?.map(p => p.customer_id) || [])]

  if (customerIds.length === 0) {
    return NextResponse.json({ message: 'No customers with pars found', created: 0 })
  }

  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name, email, contact_name')
    .in('id', customerIds)
    .eq('active', true)

  if (customersError) {
    return NextResponse.json({ error: customersError.message }, { status: 500 })
  }

  let created = 0
  let skipped = 0
  const errors: string[] = []
  const emailedCustomers = new Set<string>()

  for (const customer of customers || []) {
    let customerCreated = 0

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

      if (!pars || pars.length === 0) continue

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
      customerCreated++
    }

    // Send one confirmation email per customer if any orders were created
    if (customerCreated > 0 && !emailedCustomers.has(customer.id)) {
      try {
        await sendParConfirmation(customer, weekStart, weekEnd, weekRange, cutoffString)
        emailedCustomers.add(customer.id)
      } catch (err: any) {
        errors.push(`Email error for customer ${customer.id}: ${err.message}`)
      }
    }
  }

  console.log(`Par cron complete: ${created} orders created, ${skipped} skipped, ${errors.length} errors, ${emailedCustomers.size} emails sent`)
  if (errors.length > 0) console.error('Errors:', errors)

  return NextResponse.json({
    message: 'Par order submission complete',
    created,
    skipped,
    errors,
    emailed: emailedCustomers.size,
  })
}