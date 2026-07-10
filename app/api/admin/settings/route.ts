import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']
const VALID_SIDEBAR_COLORS = ['dark', 'light']

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPG, and SVG files are allowed' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `logo-${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error } = await supabase.storage
    .from('logos')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
  return NextResponse.json({ logo_url: publicUrl })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const {
    id,
    bakery_name,
    timezone,
    cutoff_day,
    cutoff_time,
    reminder_offset_hours,
    par_reminder_day_offset,
    par_reminder_hour,
    logo_url,
    sidebar_color,
  } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (!bakery_name?.trim()) return NextResponse.json({ error: 'Bakery name is required' }, { status: 400 })
  if (!timezone) return NextResponse.json({ error: 'Timezone is required' }, { status: 400 })
  if (!VALID_DAYS.includes(cutoff_day)) return NextResponse.json({ error: 'Invalid cutoff_day' }, { status: 400 })
  if (!cutoff_time) return NextResponse.json({ error: 'Cutoff time is required' }, { status: 400 })
  if (reminder_offset_hours < 1 || reminder_offset_hours > 6) return NextResponse.json({ error: 'reminder_offset_hours must be 1–6' }, { status: 400 })
  if (par_reminder_day_offset < 1 || par_reminder_day_offset > 6) return NextResponse.json({ error: 'par_reminder_day_offset must be 1–6' }, { status: 400 })
  if (par_reminder_hour < 0 || par_reminder_hour > 23) return NextResponse.json({ error: 'par_reminder_hour must be 0–23' }, { status: 400 })
  if (!VALID_SIDEBAR_COLORS.includes(sidebar_color)) return NextResponse.json({ error: 'sidebar_color must be "dark" or "light"' }, { status: 400 })

  const { error } = await supabase
    .from('bakery_settings')
    .update({
      bakery_name: bakery_name.trim(),
      timezone,
      cutoff_day,
      cutoff_time,
      reminder_offset_hours: Number(reminder_offset_hours),
      par_reminder_day_offset: Number(par_reminder_day_offset),
      par_reminder_hour: Number(par_reminder_hour),
      logo_url: logo_url ?? null,
      sidebar_color,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
