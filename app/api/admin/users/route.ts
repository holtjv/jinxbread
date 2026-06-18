import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const [{ data: customerUsers, error: cuError }, { data: { users: authUsers }, error: authError }] = await Promise.all([
    supabase.from('customer_users').select('email, created_at, customer_id, customers(name)').order('created_at', { ascending: false }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (cuError) return NextResponse.json({ error: cuError.message }, { status: 500 })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const confirmedEmails = new Set(
    authUsers.filter(u => u.email_confirmed_at != null).map(u => u.email)
  )

  const users = (customerUsers ?? []).map(cu => ({
    email: cu.email,
    customer_id: cu.customer_id,
    customer_name: (cu.customers as unknown as { name: string } | null)?.name ?? '—',
    created_at: cu.created_at,
    status: confirmedEmails.has(cu.email) ? 'Active' : 'Pending',
  }))

  return NextResponse.json({ users })
}

export async function DELETE(request: Request) {
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const { error } = await supabase.from('customer_users').delete().eq('email', email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
