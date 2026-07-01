import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const BAKERY_ADMIN_EMAIL = process.env.BAKERY_ADMIN_EMAIL!
const BAKERY_NAME = process.env.BAKERY_NAME!
const BAKERY_FROM_EMAIL = process.env.BAKERY_FROM_EMAIL!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

export async function POST(request: Request) {
  const { customer_id, is_admin } = await request.json()

  if (!customer_id) {
    return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 })
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('name')
    .eq('id', customer_id)
    .single()

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  if (!is_admin) {
    try {
      await resend.emails.send({
        from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
        to: BAKERY_ADMIN_EMAIL,
        subject: `Heads Up! ${customer.name} updated their standing order`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <p style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">${customer.name} updated their standing order</p>
  <p style="margin: 0 0 24px 0; color: #555; font-size: 14px;">Their new standing order quantities are now in effect for all future weeks.</p>
  <a href="${APP_URL}/admin"
     style="display: inline-block; background: #1a1a1a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">
    View in admin
  </a>
</body>
</html>
      `,
      })
    } catch (err: any) {
      console.error('notify-admin-par: email failed:', err)
      try {
        await resend.emails.send({
          from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
          to: BAKERY_ADMIN_EMAIL,
          subject: 'Email Send Failure: notify-admin-par',
          html: `<p>Failed to send <strong>par update notification</strong> to <strong>${BAKERY_ADMIN_EMAIL}</strong>.</p><p>Customer: ${customer.name}</p><p>Error: ${err.message}</p>`,
        })
      } catch (alertErr) {
        console.error('notify-admin-par: failed to send alert email:', alertErr)
      }
    }
  }

  return NextResponse.json({ success: true })
}
