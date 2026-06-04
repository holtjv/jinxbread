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

  // Check if this email is already linked to any customer
  const { data: existingUser } = await supabase
    .from('customer_users')
    .select('customer_id')
    .eq('email', email)
    .maybeSingle()

  if (existingUser) {
    // Already linked — just update is_admin on the customer if needed
    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_admin: is_admin || false })
      .eq('id', existingUser.customer_id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    // New user — add to customer_users
    const { error: insertError } = await supabase
      .from('customer_users')
      .insert({ customer_id, email })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    // Update is_admin on the customer record
    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_admin: is_admin || false })
      .eq('id', customer_id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
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