import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { toZonedTime } from 'date-fns-tz'

// Runs hourly. Fires business logic only in the hour matching:
// bakery_settings.cutoff_day + cutoff_time + 15 min, in the tenant's timezone.
// Requires bakery_settings column: last_empty_orders_sent_at (timestamptz, nullable)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const BAKERY_ADMIN_EMAIL = process.env.BAKERY_ADMIN_EMAIL!
const BAKERY_NAME = process.env.BAKERY_NAME!
const BAKERY_FROM_EMAIL = process.env.BAKERY_FROM_EMAIL!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

function getWeekRange(fromDate: Date): { weekStart: string; weekEnd: string } {
  const day = fromDate.getUTCDay()
  let tueDiff = 2 - day
  if (tueDiff <= 0) tueDiff += 7
  const tue = new Date(fromDate)
  tue.setUTCDate(fromDate.getUTCDate() + tueDiff)
  const mon = new Date(tue)
  mon.setUTCDate(tue.getUTCDate() + 6)
  return {
    weekStart: tue.toISOString().split('T')[0],
    weekEnd: mon.toISOString().split('T')[0],
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  console.log('Auth header present:', !!authHeader, 'length:', authHeader?.length)
  console.log('CRON_SECRET set:', !!process.env.CRON_SECRET)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // --- Fetch tenant settings ---
  const { data: settings, error: settingsError } = await supabase
    .from('bakery_settings')
    .select('timezone, cutoff_day, cutoff_time, last_empty_orders_sent_at')
    .single()

  if (settingsError || !settings) {
    return NextResponse.json({ error: 'Failed to load bakery_settings', detail: settingsError?.message }, { status: 500 })
  }

  const { timezone, cutoff_day, cutoff_time, last_empty_orders_sent_at } = settings

  // --- Determine target fire moment in tenant timezone ---
  // cutoff_time is a Postgres time string like "13:00:00"
  const [cutoffHour, cutoffMin] = cutoff_time.split(':').map(Number)
  const targetTotalMin = cutoffHour * 60 + cutoffMin + 15
  const targetHour = Math.floor(targetTotalMin / 60) % 24
  const targetDayJs = DAY_NAME_TO_JS[cutoff_day]

  if (targetDayJs === undefined) {
    return NextResponse.json({ error: `Unknown cutoff_day: ${cutoff_day}` }, { status: 500 })
  }

  // --- Check current time in tenant timezone ---
  const nowUtc = new Date()
  const nowLocal = toZonedTime(nowUtc, timezone)
  const localDayJs = nowLocal.getDay()
  const localHour = nowLocal.getHours()

  console.log('Timing check result:', { localDayJs, localHour, targetDayJs, targetHour, willProceed: localDayJs === targetDayJs && localHour === targetHour })
  if (localDayJs !== targetDayJs || localHour !== targetHour) {
    // Not the right hour — exit silently (fires 23/24 times per week)
    return NextResponse.json({ skipped: true, reason: 'not target hour', localDayJs, localHour, targetDayJs, targetHour })
  }

  // --- Double-fire safeguard: check if already sent this week ---
  const { weekStart, weekEnd } = getWeekRange(nowUtc)

  if (last_empty_orders_sent_at) {
    const lastSent = new Date(last_empty_orders_sent_at)
    if (lastSent >= new Date(weekStart)) {
      return NextResponse.json({ skipped: true, reason: 'already sent this week', last_empty_orders_sent_at })
    }
  }

  // --- Mark as sent before doing any work (prevents double-send if invoked twice) ---
  await supabase
    .from('bakery_settings')
    .update({ last_empty_orders_sent_at: nowUtc.toISOString() })
    .eq('timezone', timezone) // use any stable column — there's one row

  // --- Existing business logic: find customers with no orders this week ---
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name')
    .eq('active', true)
    .eq('is_admin', false)

  if (customersError) {
    return NextResponse.json({ error: customersError.message }, { status: 500 })
  }

  if (!customers || customers.length === 0) {
    return NextResponse.json({ message: 'No active customers found', emptyCount: 0 })
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('customer_id')
    .in('customer_id', customers.map(c => c.id))
    .gte('delivery_date', weekStart)
    .lte('delivery_date', weekEnd)
    .neq('status', 'cancelled')

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 })
  }

  const customersWithOrders = new Set((orders || []).map(o => o.customer_id))
  const emptyCustomers = customers.filter(c => !customersWithOrders.has(c.id))

  if (emptyCustomers.length === 0) {
    console.log('notify-empty-orders: all customers have orders this week')
    return NextResponse.json({ message: 'All customers have orders this week', emptyCount: 0 })
  }

  const count = emptyCustomers.length
  const subject = count === 1
    ? `Heads Up! 1 customer has no order this week`
    : `Heads Up! ${count} customers have no order this week`

  const listHtml = emptyCustomers.map(c => `<li style="margin-bottom: 4px;">${c.name}</li>`).join('')

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <p style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">${count === 1 ? '1 customer has' : `${count} customers have`} no order for the week of ${weekStart}</p>
  <ul style="margin: 16px 0; padding-left: 20px; color: #444; font-size: 14px;">
    ${listHtml}
  </ul>
  <a href="${APP_URL}/admin"
     style="display: inline-block; background: #1a1a1a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">
    View in admin
  </a>
</body>
</html>
  `

  try {
    await resend.emails.send({
      from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
      to: BAKERY_ADMIN_EMAIL,
      subject,
      html,
    })
    console.log(`notify-empty-orders: emailed about ${count} customers with no orders (${weekStart}–${weekEnd})`)
  } catch (err: any) {
    console.error('notify-empty-orders: email failed:', err)
    try {
      await resend.emails.send({
        from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
        to: BAKERY_ADMIN_EMAIL,
        subject: 'Email Send Failure: notify-empty-orders',
        html: `<p>Failed to send <strong>empty orders notification</strong> to <strong>${BAKERY_ADMIN_EMAIL}</strong>.</p><p>Error: ${err.message}</p>`,
      })
    } catch (alertErr) {
      console.error('notify-empty-orders: failed to send alert email:', alertErr)
    }
  }

  return NextResponse.json({ message: 'Notification sent', emptyCount: count, customers: emptyCustomers.map(c => c.name) })
}
