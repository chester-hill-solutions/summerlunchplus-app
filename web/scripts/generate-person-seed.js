import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const csvPath = path.resolve(__dirname, '..', '..', '_seed.csv')
const outputPath = path.resolve(__dirname, '..', '..', 'supabase', 'seeds', 'person-onboarding-seed.sql')

const csvContent = fs.readFileSync(csvPath, 'utf8')
const rows = parse(csvContent, {
  columns: false,
  skip_empty_lines: true,
  relax_quotes: true,
})

const escapeSql = (value = '') => value.replace(/'/g, "''")

const chooseNameParts = fullName => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ['Parent', 'Family']
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
  const [firstname, surname] = chooseNameParts(sentinel(row[1]) ?? 'Parent Family')

  const userId = crypto.randomUUID()
  const personId = crypto.randomUUID()

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
    '{}'::jsonb, '{}'::jsonb, false, false, ${userPhoneValue}, ${phoneConfirmed}
  where not exists (select 1 from existing_user)
  returning id
), updated_user as (
  update auth.users
  set updated_at = now()
  where id = (select id from existing_user)
  returning id
), user_row as (
  select id from inserted_user
  union all
  select id from updated_user
  union all
  select id from existing_user
  limit 1
), person_existing as (
  select id
  from public.person
  where user_id = (select id from user_row)
  limit 1
), inserted_person as (
  insert into public.person (
    id, user_id, role, email, firstname, surname, phone, postcode, partner_program
  )
  select
    '${personId}', (select id from user_row), 'parent', '${sanitizedEmail}', '${sanitizedFirst}', '${sanitizedSurname}', ${phoneValue},
    ${postal ? `'${sanitizedPostcode}'` : 'NULL'}, '${sanitizedSite}'
  where not exists (select 1 from person_existing)
  returning id
), updated_person as (
  update public.person
  set
    firstname = '${sanitizedFirst}',
    surname = '${sanitizedSurname}',
    phone = COALESCE(${phoneValue}, phone),
    postcode = ${postal ? `'${sanitizedPostcode}'` : 'NULL'},
    partner_program = '${sanitizedSite}'
  where id = (select id from person_existing)
  returning id
), person_row as (
  select id from inserted_person
  union all
  select id from updated_person
  union all
  select id from person_existing
  limit 1
), submission_row as (
  insert into public.form_submission (id, form_id, user_id, submitted_at)
  select gen_random_uuid(), f.id, (select id from user_row), now()
  from public.form f
  where f.name = 'Onboarding Survey'
  on conflict (form_id, user_id) do update set submitted_at = now()
  returning id
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
console.log(`Wrote ${scriptLines.length} person seeds to ${path.relative(process.cwd(), outputPath)}`)
