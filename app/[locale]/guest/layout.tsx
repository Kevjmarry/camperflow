import PageContainer from '@/components/PageContainer'
import LocaleSwitcher from '@/components/LocaleSwitcher'

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
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-4)',
          background: 'rgb(var(--surface))',
          borderBottom: '1px solid rgb(var(--border))',
        }}
      >
        <LocaleSwitcher />
      </div>
      <PageContainer showSignOut={false}>
        {children}
      </PageContainer>
    </>
  )
}
