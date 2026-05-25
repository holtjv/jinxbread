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

  // Check if a customer record already exists with this email
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingCustomer) {
    // Email already linked to a customer — just update is_admin if needed
    const { error: updateError } = await supabase
      .from('customers')
      .update({ is_admin: is_admin || false })
      .eq('id', existingCustomer.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    // No customer with this email yet — check if selected customer already has an email
    const { data: selectedCustomer } = await supabase
      .from('customers')
      .select('email')
      .eq('id', customer_id)
      .single()

    if (selectedCustomer?.email && selectedCustomer.email !== email) {
      // Customer already has a different email — don't overwrite it
      // Instead just send the invite and let the customer record stay as-is
      // The new user won't be auto-linked to this customer on login
      // TODO: multi-user per customer support
    } else {
      // Customer has no email yet — set it
      const { error: updateError } = await supabase
        .from('customers')
        .update({ email, is_admin: is_admin || false })
        .eq('id', customer_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }
  }

  // Send magic link invite via Supabase Auth
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://jinxbread.vercel.app/order',
  })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}