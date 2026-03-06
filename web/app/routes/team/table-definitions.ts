export type LookupMapping = {
  keyColumn: string
  table: string
  valueColumn: string
  resultColumn: string
  keyColumnInTable?: string
}

export type TableDefinition = {
  label: string
  table: string
  select: string
  columns: string[]
  order: string
  lookupMappings?: LookupMapping[]
}

export const TABLE_DEFINITIONS: Record<string, TableDefinition> = {
  users: {
    label: 'Users',
    table: 'auth.users',
    select: 'id, email, raw_user_meta_data, created_at, updated_at',
    columns: ['email', 'raw_user_meta_data', 'created_at', 'updated_at'],
    order: 'created_at',
  },
  person: {
    label: 'Person',
    table: 'person',
    select: 'id, user_id, partner_program, role, email, firstname, surname, phone, postcode, password_set',
    columns: ['partner_program', 'user_email', 'role', 'email', 'firstname', 'surname', 'phone', 'postcode', 'password_set'],
    lookupMappings: [
      {
        keyColumn: 'user_id',
        table: 'auth.users',
        valueColumn: 'email',
        resultColumn: 'user_email',
      },
    ],
    order: 'id',
  },
  'person-parent': {
    label: 'Person Parent Connections',
    table: 'person_parent',
    select: 'person_id, parent_id',
    columns: ['person_id', 'parent_id'],
    order: 'person_id',
  },
  profiles: {
    label: 'Profiles',
    table: 'profiles',
    select: 'email, full_name, avatar_url, created_at',
    columns: ['email', 'full_name', 'avatar_url', 'created_at'],
    order: 'created_at',
  },
  workshop: {
    label: 'Workshops',
    table: 'workshop',
    select: 'id, description, enrollment_open_at, enrollment_close_at, capacity',
    columns: ['description', 'enrollment_open_at', 'enrollment_close_at', 'capacity'],
    order: 'enrollment_open_at',
  },
  session: {
    label: 'Sessions',
    table: 'session',
    select: 'id, workshop_id, starts_at, ends_at, location',
    columns: ['workshop_description', 'starts_at', 'ends_at', 'location'],
    order: 'starts_at',
    lookupMappings: [
      { keyColumn: 'workshop_id', table: 'workshop', valueColumn: 'description', resultColumn: 'workshop_description' },
    ],
  },
  'class-enrollment': {
    label: 'Workshop Enrollments',
    table: 'workshop_enrollment',
    select: 'id, workshop_id, user_id, decided_by, status, requested_at',
    columns: ['workshop_id', 'user_email', 'status', 'requested_at', 'decided_by_email'],
    order: 'requested_at',
    lookupMappings: [
      { keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' },
      { keyColumn: 'decided_by', table: 'auth.users', valueColumn: 'email', resultColumn: 'decided_by_email' },
    ],
  },
  form: {
    label: 'Forms',
    table: 'form',
    select: 'id, name, due_at, is_required, created_at',
    columns: ['name', 'due_at', 'is_required', 'created_at'],
    order: 'created_at',
  },
  'form-question': {
    label: 'Form Questions',
    table: 'form_question',
    select: 'question_code, form_id, prompt, type, position',
    columns: ['question_code', 'form_id', 'prompt', 'type', 'position'],
    order: 'form_id',
  },
  'form-assignment': {
    label: 'Form Assignments',
    table: 'form_assignment',
    select: 'id, form_id, user_id, status, assigned_at, assigned_by',
    columns: ['form_id', 'user_email', 'status', 'assigned_at', 'assigned_by_email'],
    order: 'assigned_at',
    lookupMappings: [
      { keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' },
      { keyColumn: 'assigned_by', table: 'auth.users', valueColumn: 'email', resultColumn: 'assigned_by_email' },
    ],
  },
  'form-submission': {
    label: 'Form Submissions',
    table: 'form_submission',
    select: 'id, form_id, user_id, submitted_at',
    columns: ['form_id', 'user_email', 'submitted_at'],
    order: 'submitted_at',
    lookupMappings: [{ keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' }],
  },
  'form-answer': {
    label: 'Form Answers',
    table: 'form_answer',
    select: 'id, submission_id, question_code, value',
    columns: ['submission_id', 'question_code', 'value'],
    order: 'id',
  },
  'role-permission': {
    label: 'Role Permission',
    table: 'role_permission',
    select: 'role, permission',
    columns: ['role', 'permission'],
    order: 'role',
  },
  'user-roles': {
    label: 'User Roles',
    table: 'user_roles',
    select: 'user_id, role, assigned_by, created_at',
    columns: ['user_email', 'role', 'assigned_by_email', 'created_at'],
    order: 'created_at',
    lookupMappings: [
      { keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' },
      { keyColumn: 'assigned_by', table: 'auth.users', valueColumn: 'email', resultColumn: 'assigned_by_email' },
    ],
  },
  invites: {
    label: 'Invites',
    table: 'invites',
    select: 'id, inviter_user_id, invitee_user_id, invitee_email, role, status, created_at',
    columns: ['inviter_user_email', 'invitee_user_email', 'invitee_email', 'role', 'status', 'created_at'],
    order: 'created_at',
    lookupMappings: [
      { keyColumn: 'inviter_user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'inviter_user_email' },
      { keyColumn: 'invitee_user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'invitee_user_email' },
    ],
  },
}
