import { expect, test } from '@playwright/test'

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const ADMIN_EMAIL = 'sai+admin@chsolutions.ca'
const ADMIN_PASSWORD = '123456789'
const STAFF_EMAIL = 'sai+staff@chsolutions.ca'
const STAFF_PASSWORD = '123456'

const readLocalEnv = () => {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {} as Record<string, string>
  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trim().startsWith('#'))
      .map(line => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
      })
      .filter(([key]) => key)
  )
}

const getAdminClient = () => {
  const fileEnv = readLocalEnv()
  const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || fileEnv.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing local Supabase service credentials')
  return createClient(url, key, { auth: { persistSession: false } })
}

const findUser = async (email: string) => {
  const admin = getAdminClient()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < 200) break
  }
  return null
}

const setPasswordAndRole = async (email: string, password: string, role: 'admin' | 'staff') => {
  const admin = getAdminClient()
  let user = await findUser(email).catch(() => null)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) {
      user = await findUser(email)
      if (!user) throw new Error(error.message)
    } else if (data.user) {
      user = data.user
    } else {
      throw new Error(`Could not create ${email}`)
    }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    ban_duration: 'none',
  })
  if (updateError) throw new Error(updateError.message)

  const { data: existingProfile, error: existingProfileError } = await admin
    .from('profile')
    .select('id, user_id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  if (existingProfileError) throw new Error(existingProfileError.message)

  if (existingProfile && existingProfile.user_id !== user.id) {
    throw new Error(`Profile for ${email} is linked to a different Auth user`)
  }
  if (!existingProfile) {
    const { error: profileError } = await admin.from('profile').insert({ user_id: user.id, role, email, password_set: true })
    if (profileError) throw new Error(profileError.message)
  }

  const { error: roleError } = await admin
    .from('user_roles')
    .upsert({ user_id: user.id, role, assigned_by: user.id }, { onConflict: 'user_id' })
  if (roleError) throw new Error(roleError.message)

  return user.id
}

test('admin can disable staff and the staff login is blocked', async ({ page }) => {
  test.skip(!process.env.SUPABASE_URL && !readLocalEnv().SUPABASE_URL, 'Requires local Supabase service credentials')

  const admin = getAdminClient()
  const staffUserId = await setPasswordAndRole(STAFF_EMAIL, STAFF_PASSWORD, 'staff')
  await setPasswordAndRole(ADMIN_EMAIL, ADMIN_PASSWORD, 'admin')

  try {
    await page.goto('/login')
    await page.getByLabel('Email').fill(ADMIN_EMAIL)
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page).toHaveURL(/\/manage/)

    await page.goto('/manage/team')
    const staffRow = page.locator('tr').filter({ hasText: STAFF_EMAIL })
    await expect(staffRow).toContainText('Active')
    await staffRow.getByRole('button', { name: 'Disable' }).click()
    await expect(staffRow.getByRole('button', { name: 'Enable' })).toBeVisible()
    await expect(staffRow).toContainText('Disabled')

    const { data: disabledUser, error: disabledUserError } = await admin.auth.admin.getUserById(staffUserId)
    expect(disabledUserError).toBeNull()
    expect(disabledUser.user?.banned_until).toBeTruthy()

    await page.context().clearCookies()
    await page.goto('/login')
    await page.getByLabel('Email').fill(STAFF_EMAIL)
    await page.getByLabel('Password').fill(STAFF_PASSWORD)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page).toHaveURL(/\/login/)
  } finally {
    await admin.auth.admin.updateUserById(staffUserId, { ban_duration: 'none' })
  }
})
