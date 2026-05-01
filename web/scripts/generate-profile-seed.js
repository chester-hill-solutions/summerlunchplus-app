import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const csvPath = path.resolve(__dirname, '..', '..', '_seed.csv')
const outputPath = path.resolve(__dirname, '..', '..', 'supabase', 'seeds', 'testing', 'profile-onboarding-seed.sql')

const csvContent = fs.readFileSync(csvPath, 'utf8')
const rows = parse(csvContent, {
  columns: false,
  skip_empty_lines: true,
  relax_quotes: true,
})

const escapeSql = (value = '') => value.replace(/'/g, "''")

const chooseNameParts = fullName => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ['Guardian', 'Family']
  if (parts.length === 1) return [parts[0], 'Family']
  return [parts[0], parts.slice(1).join(' ')]
}

const sentinel = v => (v && v.trim() ? v.trim() : null)

const scriptLines = []
rows.slice(1).forEach((row, index) => {
  if (row.length <= 48) return
  const email = sentinel(row[3])?.toLowerCase()
  if (!email) return

  const phone = sentinel(row[2])
  const site = sentinel(row[11]) ?? 'Unknown'
  const postal = sentinel(row[48]) ?? ''
  const firstTimeRaw = sentinel(row[9])
  const priorParticipation = firstTimeRaw && firstTimeRaw.toLowerCase().includes('yes') ? 'no' : 'yes'
  const [firstname, surname] = chooseNameParts(sentinel(row[1]) ?? 'Guardian Family')

  const userId = crypto.randomUUID()
  const profileId = crypto.randomUUID()

  const phoneValue = phone ? `'${escapeSql(phone)}'` : 'NULL'
  const phoneConfirmed = 'NULL'
  const userPhoneValue = 'NULL'
  const sanitizedFirst = escapeSql(firstname)
  const sanitizedSurname = escapeSql(surname)
  const sanitizedPostcode = escapeSql(postal)
  const sanitizedSite = escapeSql(site)
  const sanitizedEmail = escapeSql(email)

  const statement = `-- seed row ${index + 1}
with existing_user as (
  select id
  from auth.users
  where email = '${sanitizedEmail}' and is_sso_user = false
  limit 1
), inserted_user as (
  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, phone, phone_confirmed_at
  )
  select
    '${userId}', gen_random_uuid(), 'authenticated', 'authenticated', '${sanitizedEmail}', now(), now(), now(),
    '{}'::jsonb, '{"role":"guardian"}'::jsonb, false, false, ${userPhoneValue}, ${phoneConfirmed}
  where not exists (select 1 from existing_user)
  returning id
), updated_user as (
  update auth.users
  set
    updated_at = now(),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"guardian"}'::jsonb
  where id = (select id from existing_user)
  returning id
), user_row as (
  select id from inserted_user
  union all
  select id from updated_user
  union all
  select id from existing_user
  limit 1
), profile_existing as (
  select id
  from public.profile
  where user_id = (select id from user_row)
  limit 1
), inserted_profile as (
  insert into public.profile (
    id, user_id, role, email, firstname, surname, phone, postcode, partner_program, password_set
  )
  select
    '${profileId}', (select id from user_row), 'guardian', '${sanitizedEmail}', '${sanitizedFirst}', '${sanitizedSurname}', ${phoneValue},
    ${postal ? `'${sanitizedPostcode}'` : 'NULL'}, '${sanitizedSite}', true
  where not exists (select 1 from profile_existing)
  returning id
), updated_profile as (
  update public.profile
  set
    role = 'guardian',
    email = '${sanitizedEmail}',
    firstname = '${sanitizedFirst}',
    surname = '${sanitizedSurname}',
    phone = coalesce(${phoneValue}, phone),
    postcode = ${postal ? `'${sanitizedPostcode}'` : 'NULL'},
    partner_program = '${sanitizedSite}',
    password_set = true
  where id = (select id from profile_existing)
  returning id
), profile_row as (
  select id from inserted_profile
  union all
  select id from updated_profile
  union all
  select id from profile_existing
  limit 1
), form_row as (
  select id
  from public.form
  where name = 'Onboarding Survey'
  limit 1
), submission_existing as (
  select fs.id
  from public.form_submission fs
  join form_row fr on fr.id = fs.form_id
  where fs.profile_id = (select id from profile_row)
  order by fs.submitted_at desc
  limit 1
), inserted_submission as (
  insert into public.form_submission (id, form_id, profile_id, user_id, submitted_at)
  select gen_random_uuid(), fr.id, (select id from profile_row), (select id from user_row), now()
  from form_row fr
  where not exists (select 1 from submission_existing)
  returning id
), updated_submission as (
  update public.form_submission
  set
    submitted_at = now(),
    user_id = (select id from user_row)
  where id = (select id from submission_existing)
  returning id
), submission_row as (
  select id from inserted_submission
  union all
  select id from updated_submission
  union all
  select id from submission_existing
  limit 1
)
insert into public.form_answer (submission_id, question_code, value)
select submission_row.id, 'onboarding_where_you_live', to_jsonb('${escapeSql(postal)}'::text)
from submission_row
union all
select submission_row.id, 'onboarding_prior_participation', to_jsonb('${priorParticipation}'::text)
from submission_row
union all
select submission_row.id, 'onboarding_partner_program', to_jsonb('${sanitizedSite}'::text)
from submission_row
on conflict (submission_id, question_code) do update set value = excluded.value;
`

  scriptLines.push(statement)
})

if (!scriptLines.length) {
  throw new Error('No valid rows found in _seed.csv')
}

fs.writeFileSync(outputPath, scriptLines.join('\n\n'))
console.log(`Wrote ${scriptLines.length} profile seeds to ${path.relative(process.cwd(), outputPath)}`)
