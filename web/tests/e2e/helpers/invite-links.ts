import { getAdminSupabaseClient } from './admin-account'

export const generateInviteLinkForEmail = async ({
  email,
  origin,
  role,
}: {
  email: string
  origin: string
  role: 'guardian' | 'student'
}) => {
  const adminSupabase = getAdminSupabaseClient()
  const redirectTo = `${origin}/auth/sign-up-details?role=${role}`
  const { data, error } = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo,
      data: { role },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const linkData = data as
    | {
        action_link?: string
        properties?: { action_link?: string }
      }
    | null

  const actionLink = linkData?.properties?.action_link ?? linkData?.action_link ?? null

  if (!actionLink || typeof actionLink !== 'string') {
    throw new Error('Invite link was not returned by Supabase generateLink')
  }

  return actionLink
}
