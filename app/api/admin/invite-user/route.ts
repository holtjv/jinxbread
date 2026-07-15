import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { email, customer_id, is_admin } = await request.json()
  console.log('[invite-user] Starting invite for:', email)

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
    console.log('[invite-user] User already exists, updating is_admin')
    // Already linked — just update is_admin on the customer if needed
    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_admin: is_admin || false })
      .eq('id', existingUser.customer_id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    console.log('[invite-user] Creating new customer_users record')
    // New user — add to customer_users
    const { error: insertError } = await supabase
      .from('customer_users')
      .insert({ customer_id, email })
    if (insertError) {
      console.error('[invite-user] Insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    console.log('[invite-user] Updating is_admin on customer')
    // Update is_admin on the customer record
    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_admin: is_admin || false })
      .eq('id', customer_id)
    if (updateError) {
      console.error('[invite-user] Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  console.log('[invite-user] Calling inviteUserByEmail')
  console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL)
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://jinxbread-staging.vercel.app'}/welcome`,
  })

  if (inviteError) {
    console.error('[invite-user] Invite error:', inviteError)
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  console.log('[invite-user] Invite sent successfully')
  return NextResponse.json({ success: true })
}