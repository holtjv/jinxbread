import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Runs at 18:15 UTC Sunday = 13:15 Central (CDT, UTC-5)
// NOTE: adjust to 19:15 UTC during CST (UTC-6) Nov-Mar

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const BAKERY_ADMIN_EMAIL = process.env.BAKERY_ADMIN_EMAIL!

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
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const { weekStart, weekEnd } = getWeekRange(now)

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
  <a href="https://jinxbread.vercel.app/admin"
     style="display: inline-block; background: #1a1a1a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">
    View in admin
  </a>
</body>
</html>
  `

  try {
    await resend.emails.send({
      from: 'Jinx Bread <orders@jinxbread.com>',
      to: BAKERY_ADMIN_EMAIL,
      subject,
      html,
    })
    console.log(`notify-empty-orders: emailed about ${count} customers with no orders (${weekStart}–${weekEnd})`)
  } catch (err: any) {
    console.error('notify-empty-orders: email failed:', err)
    try {
      await resend.emails.send({
        from: 'Jinx Bread <orders@jinxbread.com>',
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
