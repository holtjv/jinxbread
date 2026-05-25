'use client'
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

  // Check if customer record with this email already exists
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!existingCustomer) {
    // Update the customer record to use this email
    const { error: updateError } = await supabase
      .from('customers')
      .update({ email, is_admin: is_admin || false })
      .eq('id', customer_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
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