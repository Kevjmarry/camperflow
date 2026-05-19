'use client'

import { usePathname } from 'next/navigation'
import PageContainer from '@/components/PageContainer'

export default function GuestPageContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Match /[locale]/guest exactly — the dashboard. All sub-routes get the default width.
  const isDashboard = /^\/[^/]+\/guest\/?$/.test(pathname)
  const isEmergency = /^\/[^/]+\/guest\/emergency/.test(pathname)
  return (
    <PageContainer maxWidth={isDashboard ? '900px' : undefined} showSignOut={!isEmergency}>
      {children}
    </PageContainer>
  )
}
