import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Runs at 14:00 UTC Friday = 9:00 Central (CDT, UTC-5)
// NOTE: adjust to 15:00 UTC during CST (UTC-6) Nov-Mar
// TODO: wire up Resend (or other email provider) when ready

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: parCustomers, error: parError } = await supabase
    .from('customer_pars')
    .select('customer_id')

  if (parError) {
    return NextResponse.json({ error: parError.message }, { status: 500 })
  }

  const customerIds = [...new Set(parCustomers?.map(p => p.customer_id) || [])]

  if (customerIds.length === 0) {
    return NextResponse.json({ message: 'No customers with pars', notified: 0 })
  }

  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name, email, contact_name')
    .in('id', customerIds)
    .eq('active', true)

  if (customersError) {
    return NextResponse.json({ error: customersError.message }, { status: 500 })
  }

  const parUrl = 'https://jinxbread.vercel.app/par'
  const notified: string[] = []

  for (const customer of customers || []) {
    const firstName = customer.contact_name?.split(' ')[0] || customer.name

    // TODO: replace with Resend call when email is set up
    console.log(`[PAR REMINDER] Would email ${customer.email}: "${buildReminderEmailText(firstName, parUrl)}"`)
    notified.push(customer.email)
  }

  return NextResponse.json({
    message: 'Par reminders sent (stub)',
    notified,
  })
}

function buildReminderEmailText(firstName: string, parUrl: string): string {
  return `Hi ${firstName}, your standing order with Jinx Bread will be automatically submitted this Sunday at noon. If you'd like to make any changes before then, visit your standing order page: ${parUrl}`
}

export function buildReminderEmailHtml(firstName: string, parUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <h2 style="margin-bottom: 8px;">Your standing order submits Sunday at noon</h2>
  <p>Hi ${firstName},</p>
  <p>
    Your standing order with Jinx Bread will be automatically submitted this
    <strong>Sunday at 12:00pm Central</strong>. 
  </p>
  <p>If you'd like to make any changes before then, you have until Sunday at noon:</p>
  <p style="margin: 24px 0;">
    <a href="${parUrl}"
       style="background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 600;">
      View standing order
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">
    If you don't need a delivery this week, set all quantities to zero and save before Sunday noon.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  <p style="color: #999; font-size: 12px;">Jinx Bread — reply to this email with any questions.</p>
</body>
</html>
`
}