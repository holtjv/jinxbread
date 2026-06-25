import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Runs at 14:00 UTC daily = 9:00am Central (CDT, UTC-5)
// NOTE: adjust to 15:00 UTC during CST (UTC-6) Nov-Mar

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const BAKERY_ADMIN_EMAIL = process.env.BAKERY_ADMIN_EMAIL!
const BAKERY_NAME = process.env.BAKERY_NAME!
const BAKERY_FROM_EMAIL = process.env.BAKERY_FROM_EMAIL!

function isWithin24hWindow(createdAt: string, daysAgo: number): boolean {
  const created = new Date(createdAt).getTime()
  const now = Date.now()
  const target = now - daysAgo * 24 * 60 * 60 * 1000
  return Math.abs(created - target) < 12 * 60 * 60 * 1000 // ±12h window
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all customer_users with their customer name
  const { data: customerUsers, error: cuError } = await supabase
    .from('customer_users')
    .select('email, created_at, customer_id, customers(name)')

  if (cuError) {
    return NextResponse.json({ error: cuError.message }, { status: 500 })
  }
  if (!customerUsers || customerUsers.length === 0) {
    return NextResponse.json({ message: 'No customer users found', sent: 0 })
  }

  // Fetch all auth users to check email_confirmed_at
  const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const confirmedEmails = new Set(
    authUsers
      .filter(u => u.email_confirmed_at != null)
      .map(u => u.email)
  )

  const results: { email: string; reminder: number }[] = []
  const errors: { email: string; error: string }[] = []

  for (const cu of customerUsers) {
    const email = cu.email as string
    const createdAt = cu.created_at as string
    const customerName = (cu.customers as unknown as { name: string } | null)?.name ?? 'there'

    // Skip confirmed users
    if (confirmedEmails.has(email)) continue

    let reminderNumber: 1 | 2 | null = null
    if (isWithin24hWindow(createdAt, 3)) {
      reminderNumber = 1
    } else if (isWithin24hWindow(createdAt, 10)) {
      reminderNumber = 2
    }

    if (!reminderNumber) continue

    // Resend the invite (generates a fresh magic link for unconfirmed users)
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: '${process.env.NEXT_PUBLIC_APP_URL}/welcome',
    })

    if (inviteError) {
      errors.push({ email, error: inviteError.message })
      continue
    }

    const isFirst = reminderNumber === 1
    const subject = `Reminder: Sign in to ${BAKERY_NAME} to Place Your Orders`
    const intro = isFirst
      ? `Just a quick reminder that you've been invited to place orders through ${BAKERY_NAME} online.`
      : `This is your final reminder — your ${BAKERY_NAME} account is ready and waiting.`

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <p style="font-size: 16px; margin: 0 0 16px 0;">Hi ${customerName},</p>
  <p style="font-size: 15px; margin: 0 0 16px 0;">${intro}</p>
  <p style="font-size: 15px; margin: 0 0 24px 0;">Place and track your ${BAKERY_NAME} orders online — no more back-and-forth emails, and your order history is always there when you need it.</p>
  <a href="${APP_URL}/welcome"
     style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
    Sign in to ${BAKERY_NAME}
  </a>
  <p style="font-size: 13px; color: #888; margin: 32px 0 0 0;">If you have any questions, just reply to this email.</p>
</body>
</html>
    `

    try {
      await resend.emails.send({
        from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
        to: email,
        subject,
        html,
      })
      results.push({ email, reminder: reminderNumber })
      console.log(`resend-invite-reminder: sent reminder ${reminderNumber} to ${email}`)
    } catch (err: any) {
      console.error(`resend-invite-reminder: failed to send to ${email}:`, err)
      errors.push({ email, error: err.message })
      try {
        await resend.emails.send({
          from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
          to: BAKERY_ADMIN_EMAIL,
          subject: 'Email Send Failure: resend-invite-reminder',
          html: `<p>Failed to send <strong>invite reminder ${reminderNumber}</strong> to <strong>${email}</strong>.</p><p>Error: ${err.message}</p>`,
        })
      } catch (alertErr) {
        console.error('resend-invite-reminder: failed to send alert email:', alertErr)
      }
    }
  }

  return NextResponse.json({
    message: `Sent ${results.length} reminder(s)`,
    sent: results,
    errors,
  })
}
