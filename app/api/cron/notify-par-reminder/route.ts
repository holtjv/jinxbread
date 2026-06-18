import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Runs at 14:00 UTC Friday = 9:00 Central (CDT, UTC-5)
// NOTE: adjust to 15:00 UTC during CST (UTC-6) Nov-Mar

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

function getUpcomingSunday(): Date {
  const today = new Date()
  const day = today.getDay()
  const daysUntilSunday = day === 0 ? 7 : 7 - day
  const sunday = new Date(today)
  sunday.setDate(today.getDate() + daysUntilSunday)
  return sunday
}

function getUpcomingTuesday(): Date {
  const sunday = getUpcomingSunday()
  const tuesday = new Date(sunday)
  tuesday.setDate(sunday.getDate() + 2)
  return tuesday
}

function getUpcomingMonday(): Date {
  const tuesday = getUpcomingTuesday()
  const monday = new Date(tuesday)
  monday.setDate(tuesday.getDate() + 6)
  return monday
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Send to ALL active customers with emails, not just par customers
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name, email, contact_name, notif_reminder_friday')
    .eq('active', true)
    .eq('notif_reminder_friday', true)
    .not('email', 'is', null)

  if (customersError) {
    return NextResponse.json({ error: customersError.message }, { status: 500 })
  }

  if (!customers || customers.length === 0) {
    return NextResponse.json({ message: 'No customers to notify', notified: 0 })
  }

  const sunday = getUpcomingSunday()
  const tuesday = getUpcomingTuesday()
  const monday = getUpcomingMonday()
  const parUrl = 'https://jinxbread.vercel.app/par'
  const orderUrl = 'https://jinxbread.vercel.app/order'

  const notified: string[] = []
  const errors: string[] = []

  for (const customer of customers) {
    const firstName = customer.contact_name?.split(' ')[0] || customer.name
    const weekRange = `${fmtShort(tuesday)}–${fmtShort(monday)}`
    const cutoff = fmtDate(sunday)

    try {
      const { error } = await resend.emails.send({
        from: 'Jinx Bread <orders@jinxbread.com>',
        to: customer.email,
        subject: `Order cutoff is Sunday at noon — ${weekRange}`,
        html: buildReminderEmailHtml(firstName, cutoff, weekRange, parUrl, orderUrl),
      })

      if (error) {
        errors.push(`Failed to send to ${customer.email}: ${error.message}`)
      } else {
        notified.push(customer.email)
      }
    } catch (err: any) {
      errors.push(`Exception for ${customer.email}: ${err.message}`)
    }
  }

  console.log(`Friday reminder complete: ${notified.length} sent, ${errors.length} errors`)
  if (errors.length > 0) console.error('Errors:', errors)

  return NextResponse.json({ message: 'Friday reminders sent', notified, errors })
}

function buildReminderEmailHtml(
  firstName: string,
  cutoff: string,
  weekRange: string,
  parUrl: string,
  orderUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <img src="https://jinxbread.vercel.app/logo.png" alt="Jinx Bread" style="width: 80px; height: auto; margin-bottom: 24px;" />
  <h2 style="margin: 0 0 8px 0; font-size: 20px;">Orders close Sunday at noon</h2>
  <p style="color: #555; margin: 0 0 24px 0;">Hi ${firstName},</p>
  <p style="color: #555; margin: 0 0 16px 0;">
    Just a reminder — orders for the week of <strong>${weekRange}</strong> close this
    <strong>${cutoff} at noon</strong>. Standing orders submit automatically at 1pm.
  </p>
  <p style="color: #555; margin: 0 0 16px 0;">
    Need to place a one-time order or update your standing order? You have until Sunday at noon.
  </p>
  <p style="color: #555; margin: 0 0 24px 0;">Place and track your Jinx Bread orders online — no more back-and-forth emails, and your order history is always there when you need it.</p>
  <table style="margin: 0 0 24px 0;">
    <tr>
      <td style="padding-right: 12px;">
        <a href="${orderUrl}"
           style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Place an order
        </a>
      </td>
      <td>
        <a href="${parUrl}"
           style="display: inline-block; background: #f5f5f5; color: #1a1a1a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Edit standing order
        </a>
      </td>
    </tr>
  </table>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
  <p style="color: #bbb; font-size: 12px; margin: 0;">
    Jinx Bread · Austin, TX · <a href="https://jinxbread.vercel.app/settings" style="color: #bbb;">Manage notifications</a>
  </p>
</body>
</html>
`
}