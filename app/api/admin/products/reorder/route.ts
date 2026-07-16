import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.json()
  const { updates } = body

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates must be a non-empty array' }, { status: 400 })
  }

  for (const u of updates) {
    if (!u.id || typeof u.sort_order !== 'number') {
      return NextResponse.json({ error: 'Each update must have id and sort_order' }, { status: 400 })
    }
  }

  const results = await Promise.all(
    updates.map(u =>
      supabase.from('products').update({ sort_order: u.sort_order }).eq('id', u.id)
    )
  )

  const failed = results.find(r => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
