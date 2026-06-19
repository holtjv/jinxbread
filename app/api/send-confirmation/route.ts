import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const BAKERY_ADMIN_EMAIL = process.env.BAKERY_ADMIN_EMAIL!

async function sendAlertEmail(intendedTo: string, emailType: string, errorMsg: string) {
  try {
    await resend.emails.send({
      from: 'Jinx Bread <orders@jinxbread.com>',
      to: BAKERY_ADMIN_EMAIL,
      subject: 'Email Send Failure: send-confirmation',
      html: `<p>Failed to send <strong>${emailType}</strong> to <strong>${intendedTo}</strong>.</p><p>Error: ${errorMsg}</p>`,
    })
  } catch (alertErr) {
    console.error('send-confirmation: failed to send alert email:', alertErr)
  }
}

export async function POST(request: Request) {
  const { customer_id, week_start, week_end, week_range, cutoff_string, is_editing } = await request.json()

  if (!customer_id || !week_start || !week_end) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('name, email, contact_name')
    .eq('id', customer_id)
    .single()

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, delivery_date, delivery_window_id, is_par,
      delivery_window:delivery_windows (label, day_of_week),
      order_items (
        quantity, sliced,
        product:products (name, sku)
      )
    `)
    .eq('customer_id', customer_id)
    .gte('delivery_date', week_start)
    .lte('delivery_date', week_end)
    .order('delivery_date', { ascending: true })

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'No orders found for this week' }, { status: 404 })
  }

  const firstName = customer.contact_name?.split(' ')[0] || customer.name
  const isPar = orders.every((o: any) => o.is_par)
  const subject = `Your Jinx Bread order for ${week_range}`

  const actionText = isPar
    ? `Your standing order for <strong>${week_range}</strong> has been automatically submitted.`
    : is_editing
    ? `Your order for <strong>${week_range}</strong> has been updated.`
    : `Your order for <strong>${week_range}</strong> is confirmed.`

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

  const customerHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <img src="https://jinxbread.vercel.app/logo.png" alt="Jinx Bread" style="width: 80px; height: auto; margin-bottom: 24px;" />
  <p style="color: #555; margin: 0 0 12px 0;">Hi ${firstName},</p>
  <p style="color: #555; margin: 0 0 20px 0;">${actionText}</p>
  <p style="color: #555; margin: 0 0 20px 0;">Place and track your Jinx Bread orders online — no more back-and-forth emails, and your order history is always there when you need it.</p>
  <div style="background: #f0f7ff; border-left: 3px solid #2563eb; padding: 12px 16px; margin-bottom: 28px; border-radius: 0 6px 6px 0;">
    <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1a1a1a;">
      You may edit this order until ${cutoff_string} at noon.
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

  const bakerySubject = `Heads Up! ${customer.name} ${is_editing ? 'updated their one-time order' : 'added a one-time order'} — ${week_range}`

  const bakeryHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700;">${customer.name}</p>
  <p style="margin: 0 0 20px 0; font-size: 13px; color: #888;">${is_editing ? 'Updated one-time order' : 'New one-time order'} · ${week_range}</p>
  ${orderRowsHtml}
  <p style="margin: 24px 0 0 0;">
    <a href="https://jinxbread.vercel.app/admin"
       style="display: inline-block; background: #1a1a1a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">
      View in admin
    </a>
  </p>
</body>
</html>
`

  let emailFailed = false
  try {
    await resend.emails.send({
      from: 'Jinx Bread <orders@jinxbread.com>',
      to: customer.email,
      subject,
      html: customerHtml,
    })
  } catch (err: any) {
    console.error('send-confirmation: customer email failed:', err)
    await sendAlertEmail(customer.email, 'order confirmation', err.message)
    emailFailed = true
  }

  try {
    await resend.emails.send({
      from: 'Jinx Bread <orders@jinxbread.com>',
      to: BAKERY_ADMIN_EMAIL,
      subject: bakerySubject,
      html: bakeryHtml,
    })
  } catch (err: any) {
    console.error('send-confirmation: bakery notification failed:', err)
    await sendAlertEmail(BAKERY_ADMIN_EMAIL, 'bakery order notification', err.message)
  }

  return NextResponse.json({ success: true, emailFailed })
}