import { redirect } from 'next/navigation'

export default async function StaffPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/staff/operations`)
}
