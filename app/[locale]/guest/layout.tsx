import PageContainer from '@/components/PageContainer'

export const metadata = {
  title: 'Guest Portal',
  description: 'Guest access portal',
}

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PageContainer showSignOut={false}>
      {children}
    </PageContainer>
  )
}