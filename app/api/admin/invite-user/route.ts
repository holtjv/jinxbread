import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { email, customer_id, is_admin } = await request.json()

  if (!email || !customer_id) {
    return NextResponse.json({ error: 'Email and customer are required' }, { status: 400 })
  }

  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingCustomer) {
    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_admin: is_admin || false })
      .eq('id', existingCustomer.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    const { data: selectedCustomer } = await supabase
      .from('customers')
      .select('email')
      .eq('id', customer_id)
      .single()

    if (selectedCustomer?.email && selectedCustomer.email !== email) {
      // TODO: multi-user per customer support
    } else {
      const { error: updateError } = await supabase
        .from('customers')
        .update({ email, is_admin: is_admin || false })
        .eq('id', customer_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }
  }

  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://jinxbread.vercel.app/welcome',
  })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}