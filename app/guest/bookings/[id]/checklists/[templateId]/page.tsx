'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PageContainer from '../../../../../../components/PageContainer'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function GuestChecklistPage({
  params,
}: {
  params: { id: string; templateId: string }
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const code = searchParams.get('code')
  const [checklist, setChecklist] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) {
      router.push('/guest')
      return
    }

    fetchChecklistData()
  }, [code, params.id, params.templateId])

  const fetchChecklistData = async () => {
    try {
      const supabase = createClientComponentClient()
      
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id')
        .eq('id', params.id)
        .eq('code', code)
        .single()

      if (!bookingData) throw new Error('Invalid booking')

      const { data: checklistData, error: checklistError } = await supabase
        .from('booking_checklists')
        .select('*, checklist_template:checklist_templates(name)')
        .eq('booking_id', params.id)
        .eq('template_id', params.templateId)
        .single()

      if (checklistError) throw checklistError

      const { data: itemsData } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', checklistData.id)
        .order('order_index')

      setChecklist(checklistData)
      setItems(itemsData || [])
    } catch (err: any) {
      setError('Checklist not found or invalid code')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="surface p-8">
          <p>Loading...</p>
        </div>
      </PageContainer>
    )
  }

  if (error || !checklist) {
    return (
      <PageContainer>
        <div className="surface p-8">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-red-600 mb-4">{error || 'Checklist not found'}</p>
          <Link href="/guest" className="btn btn-secondary">
            Back to Portal
          </Link>
        </div>
      </PageContainer>
    )
  }

  const completedCount = items.filter(item => item.checked).length
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0

  return (
    <PageContainer>
      <div className="mb-4">
        <Link
          href={`/guest/bookings/${params.id}?code=${code}`}
          className="btn btn-secondary"
        >
          ← Back to Booking
        </Link>
      </div>

      <div className="surface p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">
            {checklist.checklist_template?.name || 'Checklist'}
          </h1>
          <p className="text-gray-600">
            Status: <span className="font-medium">{checklist.status}</span>
          </p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="label">Progress</label>
            <span className="text-sm text-gray-600">
              {completedCount} of {items.length} items
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-gray-600">No checklist items available.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {item.checked ? (
                      <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 border-2 rounded" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${item.checked ? 'line-through text-gray-500' : ''}`}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                    )}
                    {item.notes && (
                      <p className="text-sm text-gray-500 mt-2 italic">
                        Note: {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {checklist.completed_at && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">
              ✓ Completed on {new Date(checklist.completed_at).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  )
}