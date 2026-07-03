import { Download } from 'lucide-react'
import { Form, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV } from '@/lib/exports/types'

import DeferredTableDisplay from './deferred-table-display'

export default function WorkshopEnrollmentIndexPage() {
  const location = useLocation()
  const sourcePath = `/manage/workshop-enrollment${location.search}`

  return (
    <DeferredTableDisplay
      dataPath="/manage/workshop-enrollment/table-data"
      fallbackLabel="Workshop enrollment"
      fallbackTableName="class-enrollment"
      paginationActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Export CSV" title="Export CSV">
            <Download className="size-4" />
          </Button>
        </Form>
      }
    />
  )
}
