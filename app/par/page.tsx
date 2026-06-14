import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const BAKERY_EMAIL = 'jack@jinxbread.com'

export async function POST(request: Request) {
  const { customer_id } = await request.json()

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

  resend.emails.send({
    from: 'Jinx Bread <orders@jinxbread.com>',
    to: BAKERY_EMAIL,
    subject: `Heads Up! ${customer.name} updated their standing order`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <p style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">${customer.name} updated their standing order</p>
  <p style="margin: 0 0 24px 0; color: #555; font-size: 14px;">Their new standing order quantities are now in effect for all future weeks.</p>
  <a href="https://jinxbread.vercel.app/admin"
     style="display: inline-block; background: #1a1a1a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">
    View in admin
  </a>
</body>
</html>
    `,
  }).catch(err => console.error('Par notification error:', err))

  return NextResponse.json({ success: true })
}