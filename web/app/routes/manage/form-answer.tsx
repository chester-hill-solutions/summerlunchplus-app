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
  return <TableDisplay />
}
