import { expect, test } from '@playwright/test'

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ensureReusableAdminAccount,
  getAdminSupabaseClient,
  hasAdminServiceEnv,
  loginAsAdmin,
} from './helpers/admin-account'
import { uniqueSuffix } from './helpers/ids'

const findAuthUserByEmail = async (email: string) => {
  const adminSupabase = getAdminSupabaseClient()
  let page = 1

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)

    const users = data?.users ?? []
    const found = users.find(user => (user.email ?? '').toLowerCase() === email.toLowerCase())
    if (found) return found

    if (users.length < 200) break
    page += 1
  }

  return null
}

const ensureRoleAccount = async ({
  email,
  password,
  role,
  firstname,
  surname,
}: {
  email: string
  password: string
  role: 'staff' | 'admin'
  firstname: string
  surname: string
}) => {
  const adminSupabase = getAdminSupabaseClient()
  let user = await findAuthUserByEmail(email)

  if (!user) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    })

    if (error) {
      const existing = await findAuthUserByEmail(email)
      if (!existing) throw new Error(error.message)
      user = existing
    } else {
      user = data.user
    }
  }

  if (!user?.id) {
    throw new Error('Failed to create or resolve role account user.')
  }

  const { error: normalizeUserError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role,
    },
  })

  if (normalizeUserError) {
    throw new Error(normalizeUserError.message)
  }

  const { data: profileRow, error: profileError } = await adminSupabase
    .from('profile')
    .upsert(
      {
        user_id: user.id,
        role,
        email,
        firstname,
        surname,
        password_set: true,
      },
      { onConflict: 'email' }
    )
    .select('id')
    .single()

  if (profileError || !profileRow?.id) {
    throw new Error(profileError?.message ?? 'Failed to upsert role profile')
  }

  const { error: roleError } = await adminSupabase
    .from('user_roles')
    .upsert({ user_id: user.id, role, assigned_by: user.id }, { onConflict: 'user_id' })

  if (roleError) {
    throw new Error(roleError.message)
  }

  return {
    userId: user.id,
    profileId: profileRow.id,
  }
}

const loginAsRole = async (page: import('@playwright/test').Page, email: string, password: string) => {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/(manage|home)/)
}

test.describe.serial('admin email change controls', () => {
  test.skip(!hasAdminServiceEnv(), 'Requires SUPABASE_URL and SUPABASE_SECRET_KEY for admin setup')

  let adminProfileId = ''
  let staffProfileId = ''
  const staffEmail = `sai+staff-${uniqueSuffix()}@chsolutions.ca`
  const staffPassword = 'Password123456!'

  test.beforeAll(async () => {
    await ensureReusableAdminAccount()
    const adminAccount = await ensureRoleAccount({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      firstname: 'Sai',
      surname: 'Tests Admin',
    })
    adminProfileId = adminAccount.profileId

    const staffAccount = await ensureRoleAccount({
      email: staffEmail,
      password: staffPassword,
      role: 'staff',
      firstname: 'Staff',
      surname: 'Email Guard',
    })
    staffProfileId = staffAccount.profileId
  })

  test('logs a no-op admin email change attempt as applied', async ({ page }) => {
    const adminSupabase = getAdminSupabaseClient()

    const { data: beforeRow, error: beforeError } = await adminSupabase
      .from('email_change_log')
      .select('id, created_at')
      .eq('profile_id', adminProfileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (beforeError) {
      throw new Error(beforeError.message)
    }

    await loginAsAdmin(page)
    const response = await page.request.post(`/manage/person?profileId=${adminProfileId}`, {
      form: {
        intent: 'change-email-by-admin',
        profile_id: adminProfileId,
        new_email: ADMIN_EMAIL,
        reason: 'No-op audit verification for unchanged email',
        trigger_zoom_sync: '1',
      },
    })

    expect(response.ok()).toBeTruthy()

    await expect
      .poll(async () => {
        const { data } = await adminSupabase
          .from('email_change_log')
          .select('id, created_at')
          .eq('profile_id', adminProfileId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!data?.id) return false
        if (!beforeRow?.id) return true
        return data.id !== beforeRow.id
      })
      .toBeTruthy()

    const { data: row, error } = await adminSupabase
      .from('email_change_log')
      .select('status, old_email, new_email, auth_updated, profile_updated, invites_updated, details')
      .eq('profile_id', adminProfileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !row) {
      throw new Error(error?.message ?? 'Expected a recent email_change_log row for no-op attempt')
    }

    expect(row.status).toBe('applied')
    expect(row.old_email).toBe(ADMIN_EMAIL.toLowerCase())
    expect(row.new_email).toBe(ADMIN_EMAIL.toLowerCase())
    expect(row.auth_updated).toBeFalsy()
    expect(row.profile_updated).toBeFalsy()
    expect(row.invites_updated).toBeFalsy()

    const stages = Array.isArray((row.details as { stages?: unknown[] })?.stages)
      ? ((row.details as { stages: Array<{ stage?: string; message?: string }> }).stages ?? [])
      : []

    const finalize = stages.find(stage => stage.stage === 'finalize')
    expect(finalize?.message ?? '').toContain('No-op')
  })

  test('hides admin email form for non-admin and rejects direct post', async ({ page }) => {
    const adminSupabase = getAdminSupabaseClient()
    const rejectionReason = `Non-admin rejection verification ${uniqueSuffix()}`

    await loginAsRole(page, staffEmail, staffPassword)
    await page.goto(`/manage/person?profileId=${staffProfileId}`)

    await expect(page.getByText('Admin email change')).toHaveCount(0)

    const response = await page.request.post(`/manage/person?profileId=${staffProfileId}`, {
      maxRedirects: 0,
      form: {
        intent: 'change-email-by-admin',
        profile_id: staffProfileId,
        new_email: `sai+staff-updated-${uniqueSuffix()}@chsolutions.ca`,
        reason: rejectionReason,
        trigger_zoom_sync: '1',
      },
    })

    expect([302, 303, 403]).toContain(response.status())

    const { data: logRow, error: logError } = await adminSupabase
      .from('email_change_log')
      .select('id')
      .eq('profile_id', staffProfileId)
      .eq('reason', rejectionReason)
      .maybeSingle()

    if (logError) {
      throw new Error(logError.message)
    }

    expect(logRow).toBeNull()
  })
})
