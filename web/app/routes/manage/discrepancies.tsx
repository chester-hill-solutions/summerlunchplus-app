import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('discrepancies')

export default function DiscrepanciesTablePage() {
  return (
    <TableDisplay
      headerActions={
        <div className="max-w-md rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Priority score ranks urgency. Higher score sorts first. In workshop enrollment, hover a profile to see
          the highest-priority open discrepancy and whether more open signals exist.
        </div>
      }
    />
  )
}
