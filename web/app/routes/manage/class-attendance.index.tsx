import DeferredTableDisplay from './deferred-table-display'

export default function ClassAttendanceIndexPage() {
  return (
    <DeferredTableDisplay
      dataPath="/manage/class-attendance/table-data"
      fallbackLabel="Class attendance"
      fallbackTableName="class-attendance"
    />
  )
}
