import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toZonedTime } from 'date-fns-tz'

// Blocks customer_pars writes during the window when submit-par-orders reads
// this table to generate the week's orders, so it can't snapshot a half-saved
// standing order. Same bakery_settings + date-fns-tz pattern as
// notify-empty-orders. Admins bypass the freeze — they edit pars on a
// customer's behalf outside the normal cutoff flow.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

// submit-par-orders has no measured production runtime — its per-customer
// loop does sequential, unbatched Supabase round-trips, so cost scales with
// customer count. Using a conservative 1hr freeze until real timing data
// says otherwise.
const FREEZE_WINDOW_MINUTES = 60

function formatClockTime(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export async function POST(request: Request) {
  const { customer_id, is_admin, rows } = await request.json()

  if (!customer_id || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing customer_id or rows' }, { status: 400 })
  }

  if (!is_admin) {
    const { data: settings, error: settingsError } = await supabase
      .from('bakery_settings')
      .select('timezone, cutoff_day, cutoff_time')
      .single()

    if (settingsError || !settings) {
      return NextResponse.json({ error: 'Failed to load bakery_settings', detail: settingsError?.message }, { status: 500 })
    }

    const { timezone, cutoff_day, cutoff_time } = settings
    const targetDayJs = DAY_NAME_TO_JS[cutoff_day]

    if (targetDayJs === undefined) {
      return NextResponse.json({ error: `Unknown cutoff_day: ${cutoff_day}` }, { status: 500 })
    }

    const [cutoffHour, cutoffMin] = cutoff_time.split(':').map(Number)
    const nowLocal = toZonedTime(new Date(), timezone)

    if (nowLocal.getDay() === targetDayJs) {
      const cutoffTotalMin = cutoffHour * 60 + cutoffMin
      const nowTotalMin = nowLocal.getHours() * 60 + nowLocal.getMinutes()
      const freezeEndMin = cutoffTotalMin + FREEZE_WINDOW_MINUTES

      if (nowTotalMin >= cutoffTotalMin && nowTotalMin < freezeEndMin) {
        return NextResponse.json({
          error: 'frozen',
          message: `Standing order changes are locked until ${formatClockTime(freezeEndMin)} while this week's orders are being submitted.`,
        }, { status: 423 })
      }
    }
  }

  const { error: deleteError } = await supabase.from('customer_pars').delete().eq('customer_id', customer_id)
  if (deleteError) {
    return NextResponse.json({ error: 'Error saving: ' + deleteError.message }, { status: 500 })
  }

  if (rows.length > 0) {
    const insertRows = rows.map((r: any) => ({ ...r, customer_id }))
    const { error: insertError } = await supabase.from('customer_pars').insert(insertRows)
    if (insertError) {
      return NextResponse.json({ error: 'Error saving: ' + insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
