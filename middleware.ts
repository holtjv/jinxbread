import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for auth pages and public routes
  if (
    pathname === '/login' ||
    pathname === '/welcome' ||
    pathname === '/onboarding' ||
    pathname === '/reset' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  // Check if user is authenticated
  const token = request.cookies.get('sb-access-token')?.value
  if (!token) {
    // No auth token, redirect to login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // For protected routes, allow them through
  // The welcome/onboarding check is handled client-side in the welcome page
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
