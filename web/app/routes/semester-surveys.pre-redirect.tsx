import type { LoaderFunctionArgs } from 'react-router'
import { redirect } from 'react-router'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const semesterId = params.semesterId
  if (!semesterId) {
    throw redirect('/enroll')
  }

  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo')
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''

  throw redirect(`/semester-surveys/${semesterId}/pre-program${query}`)
}

export default function SemesterSurveyPreRedirectPage() {
  return null
}
