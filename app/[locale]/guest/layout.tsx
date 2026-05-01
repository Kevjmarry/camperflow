import GuestHeader from '@/components/guest/GuestHeader'
import GuestPageContainer from '@/components/guest/GuestPageContainer'

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
      <GuestHeader />
      <GuestPageContainer>
        {children}
      </GuestPageContainer>
    </>
  )
}
