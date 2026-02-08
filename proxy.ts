import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  let isStaff = false
  if (user) {
    const { data: staffProfile } = await supabase
      .from('staff_profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    
    isStaff = staffProfile !== null && (staffProfile.role === 'staff' || staffProfile.role === 'admin')
  }

  const path = request.nextUrl.pathname

  if (path === '/staff/login') {
    if (user && isStaff) {
      return NextResponse.redirect(new URL('/staff', request.url))
    }
    return response
  }

  const protectedPaths = ['/staff', '/bookings', '/vehicles', '/customers', '/company']
  const isProtectedRoute = protectedPaths.some(p => path.startsWith(p))

  if (isProtectedRoute) {
    if (!user || !isStaff) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/staff/:path*', '/bookings/:path*', '/vehicles/:path*', '/customers/:path*', '/company/:path*']
}