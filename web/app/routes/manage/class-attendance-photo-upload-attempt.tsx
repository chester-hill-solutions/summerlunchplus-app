import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'
import type { Route } from './+types/class-attendance-photo-upload-attempt'
import TableDisplay from './table-display'

export const loader = (args: Route.LoaderArgs) => createTableLoader('class-attendance-photo-upload-attempt')(args)
export const action = createTableAction('class-attendance-photo-upload-attempt')

export default function ClassAttendancePhotoUploadAttemptPage() {
  return <TableDisplay />
}
