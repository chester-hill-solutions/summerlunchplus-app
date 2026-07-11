import { Form, useLocation, useNavigation } from 'react-router'
import { Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EXPORT_TYPE_FORM_ANSWER_CSV } from '@/lib/exports/types'

import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'
import type { Route } from './+types/form-answer'

const baseLoader = createTableLoader('form-answer')

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const baseColumnMeta = (base.columnMeta ?? {}) as Record<string, { label?: string }>
  return {
    ...base,
    columnMeta: {
      ...baseColumnMeta,
      form_display: {
        ...(baseColumnMeta.form_display ?? {}),
        label: 'form',
      },
      profile_display: {
        ...(baseColumnMeta.profile_display ?? {}),
        label: 'profile',
      },
    },
  }
}

export const action = createTableAction('form-answer')

export default function FormAnswersTablePage() {
  const location = useLocation()
  const navigation = useNavigation()
  const sourcePath = `/manage/form-answer${location.search}`
  const isCreatingExport = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'create-export'

  return (
    <TableDisplay
      paginationActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_FORM_ANSWER_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            disabled={isCreatingExport}
            aria-label={isCreatingExport ? 'Exporting CSV' : 'Export CSV'}
            title={isCreatingExport ? 'Exporting CSV...' : 'Export CSV'}
          >
            {isCreatingExport ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </Button>
        </Form>
      }
    />
  )
}
