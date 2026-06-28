import { expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

export const ADMIN_EMAIL = 'sai+testsadmin@chsolutions.ca'
export const ADMIN_PASSWORD = 'Password123456!'

const readLocalEnv = () => {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    return {} as Record<string, string>
  }
  const raw = fs.readFileSync(envPath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const values: Record<string, string> = {}

  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (key) values[key] = value
  }

  return values
}

const getServiceEnv = () => {
  const fileEnv = readLocalEnv()
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || fileEnv.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || fileEnv.SUPABASE_SECRET_KEY,
  }
}

export const hasAdminServiceEnv = () => {
  const env = getServiceEnv()
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
}

export const getAdminSupabaseClient = () => {
  const env = getServiceEnv()
  const supabaseUrl = env.SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL and SUPABASE_SECRET_KEY (set in environment or web/.env.local)'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

const findAuthUserByEmail = async (adminSupabase: ReturnType<typeof getAdminSupabaseClient>, email: string) => {
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

export const ensureReusableAdminAccount = async () => {
  const adminSupabase = getAdminSupabaseClient()
  let user = await findAuthUserByEmail(adminSupabase, ADMIN_EMAIL)

  if (!user) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'admin' },
    })

    if (error) {
      const existing = await findAuthUserByEmail(adminSupabase, ADMIN_EMAIL)
      if (!existing) {
        throw new Error(`Unable to create admin user: ${error.message}`)
      }
      user = existing
    } else {
      user = data.user
    }
  }

  if (!user) {
    throw new Error('Admin user creation returned no user record')
  }

  const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role: 'admin',
    },
  })

  if (updateError) {
    throw new Error(`Unable to normalize admin user password/metadata: ${updateError.message}`)
  }

  const { error: profileError } = await adminSupabase
    .from('profile')
    .upsert(
      {
        user_id: user.id,
        role: 'admin',
        email: ADMIN_EMAIL,
        firstname: 'Sai',
        surname: 'Tests Admin',
        password_set: true,
      },
      { onConflict: 'email' }
    )

  if (profileError) {
    throw new Error(`Unable to upsert admin profile: ${profileError.message}`)
  }

  const { error: roleError } = await adminSupabase
    .from('user_roles')
    .upsert({ user_id: user.id, role: 'admin', assigned_by: user.id }, { onConflict: 'user_id' })

  if (roleError) {
    throw new Error(`Unable to upsert admin role: ${roleError.message}`)
  }
}

export const loginAsAdmin = async (page: import('@playwright/test').Page) => {
  await page.context().clearCookies()
  await page.goto('/login')

  const emailInput = page.getByLabel('Email')
  if (!(await emailInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.goto('/logout')
    await page.goto('/login')
  }

  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/manage/)
}
