import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { toZonedTime } from 'date-fns-tz'

// Runs hourly. Fires business logic only in the hour matching:
// (cutoff_day - par_reminder_day_offset) at par_reminder_hour, in the tenant's timezone.
// e.g. Sunday cutoff, day_offset=2, hour=9 → fires Friday at 9:00 AM local.
// Requires bakery_settings column: last_par_reminder_sent_at (timestamptz, nullable)

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

function fmtCutoffTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
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

function fmtShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtLong(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // --- Fetch tenant settings ---
  const { data: settings, error: settingsError } = await supabase
    .from('bakery_settings')
    .select('timezone, cutoff_day, cutoff_time, par_reminder_day_offset, par_reminder_hour, last_par_reminder_sent_at, logo_url')
    .single()

  if (settingsError || !settings) {
    return NextResponse.json({ error: 'Failed to load bakery_settings', detail: settingsError?.message }, { status: 500 })
  }

  const { timezone, cutoff_day, cutoff_time, par_reminder_day_offset, par_reminder_hour, last_par_reminder_sent_at, logo_url } = settings

  // --- Determine target fire moment in tenant timezone ---
  // Fire par_reminder_day_offset days before cutoff_day, at par_reminder_hour local
  const cutoffDayJs = DAY_NAME_TO_JS[cutoff_day]
  if (cutoffDayJs === undefined) {
    return NextResponse.json({ error: `Unknown cutoff_day: ${cutoff_day}` }, { status: 500 })
  }

  const targetDayJs = ((cutoffDayJs - par_reminder_day_offset) % 7 + 7) % 7
  const targetHour = par_reminder_hour

  // --- Check current time in tenant timezone ---
  const nowUtc = new Date()
  const nowLocal = toZonedTime(nowUtc, timezone)
  const localDayJs = nowLocal.getDay()
  const localHour = nowLocal.getHours()

  if (localDayJs !== targetDayJs || localHour !== targetHour) {
    return NextResponse.json({ skipped: true, reason: 'not target hour', localDayJs, localHour, targetDayJs, targetHour })
  }

  // --- Double-fire safeguard: check if already sent this week ---
  const { weekStart, weekEnd } = getWeekRange(nowUtc)

  if (last_par_reminder_sent_at) {
    const lastSent = new Date(last_par_reminder_sent_at)
    if (lastSent >= new Date(weekStart)) {
      return NextResponse.json({ skipped: true, reason: 'already sent this week', last_par_reminder_sent_at })
    }
  }

  // --- Mark as sent before doing any work ---
  await supabase
    .from('bakery_settings')
    .update({ last_par_reminder_sent_at: nowUtc.toISOString() })
    .eq('timezone', timezone)

  // --- Fetch customers opted into friday reminders ---
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

  // Cutoff is the Sunday (cutoff_day) before the delivery week's Tuesday (weekStart)
  const cutoffDateStr = (() => {
    const tue = new Date(weekStart + 'T12:00:00Z')
    tue.setUTCDate(tue.getUTCDate() - 2)
    return tue.toISOString().split('T')[0]
  })()

  const logoSrc = logo_url ?? `${APP_URL}/logo.png`
  const [cutoffHour, cutoffMin] = cutoff_time.split(':').map(Number)
  const cutoffTimeDisplay = fmtCutoffTime(cutoff_time)
  const submitH = (cutoffHour + 1) % 24
  const submitTimeDisplay = fmtCutoffTime(`${String(submitH).padStart(2, '0')}:${String(cutoffMin).padStart(2, '0')}:00`)
  const cutoffDayDisplay = cutoff_day.charAt(0).toUpperCase() + cutoff_day.slice(1)

  const weekRange = `${fmtShort(weekStart)}–${fmtShort(weekEnd)}`
  const cutoff = fmtLong(cutoffDateStr)
  const parUrl = `${APP_URL}/par`
  const orderUrl = `${APP_URL}/order`

  const notified: string[] = []
  const errors: string[] = []

  for (const customer of customers) {
    const firstName = customer.contact_name?.split(' ')[0] || customer.name

    try {
      await resend.emails.send({
        from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
        to: customer.email,
        subject: `Order cutoff is ${cutoffDayDisplay} at ${cutoffTimeDisplay} — ${weekRange}`,
        html: buildReminderEmailHtml(firstName, cutoff, weekRange, parUrl, orderUrl, logoSrc, cutoffTimeDisplay, submitTimeDisplay),
      })
      notified.push(customer.email)
    } catch (err: any) {
      console.error(`notify-par-reminder: failed to send to ${customer.email}:`, err)
      errors.push(`Failed to send to ${customer.email}: ${err.message}`)
      try {
        await resend.emails.send({
          from: `${BAKERY_NAME} <${BAKERY_FROM_EMAIL}>`,
          to: BAKERY_ADMIN_EMAIL,
          subject: 'Email Send Failure: notify-par-reminder',
          html: `<p>Failed to send <strong>Friday reminder</strong> to <strong>${customer.email}</strong>.</p><p>Error: ${err.message}</p>`,
        })
      } catch (alertErr) {
        console.error('notify-par-reminder: failed to send alert email:', alertErr)
      }
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
  orderUrl: string,
  logoSrc: string,
  cutoffTimeDisplay: string,
  submitTimeDisplay: string,
): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
  <img src="${logoSrc}" alt="${BAKERY_NAME}" style="width: 80px; height: auto; margin-bottom: 24px;" />
  <h2 style="margin: 0 0 8px 0; font-size: 20px;">Orders close at ${cutoffTimeDisplay}</h2>
  <p style="color: #555; margin: 0 0 24px 0;">Hi ${firstName},</p>
  <p style="color: #555; margin: 0 0 16px 0;">
    Just a reminder — orders for the week of <strong>${weekRange}</strong> close this
    <strong>${cutoff} at ${cutoffTimeDisplay}</strong>. Standing orders submit automatically at ${submitTimeDisplay}.
  </p>
  <p style="color: #555; margin: 0 0 16px 0;">
    Need to place a one-time order or update your standing order? You have until ${cutoffTimeDisplay}.
  </p>
  <p style="color: #555; margin: 0 0 24px 0;">Place and track your ${BAKERY_NAME} orders online — no more back-and-forth emails, and your order history is always there when you need it.</p>
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
    ${BAKERY_NAME} · <a href="${APP_URL}/settings" style="color: #bbb;">Manage notifications</a>
  </p>
  <p style="font-size: 11px; color: #999; text-align: center; margin-top: 24px;">Proofed by BakersBoss</p>
</body>
</html>
`
}
