export type TableDefinition = {
  label: string
  table: string
  select: string
  columns: string[]
  order: string
}

export const TABLE_DEFINITIONS: Record<string, TableDefinition> = {
  users: {
    label: 'Users',
    table: 'auth.users',
    select: 'id, email, raw_user_meta_data, created_at, updated_at',
    columns: ['id', 'email', 'raw_user_meta_data', 'created_at', 'updated_at'],
    order: 'created_at',
  },
  person: {
    label: 'Person',
    table: 'person',
    select: 'id, user_id, role, email, firstname, surname, phone, postcode, password_set',
    columns: ['id', 'user_id', 'email', 'firstname', 'surname', 'role', 'password_set'],
    order: 'id',
  },
  'person-parent': {
    label: 'Person Parent Connections',
    table: 'person_parent',
    select: 'id, person_id, parent_id',
    columns: ['id', 'person_id', 'parent_id'],
    order: 'id',
  },
  profiles: {
    label: 'Profiles',
    table: 'profiles',
    select: 'id, email, full_name, avatar_url, created_at',
    columns: ['id', 'email', 'full_name', 'created_at'],
    order: 'created_at',
  },
  workshop: {
    label: 'Workshops',
    table: 'workshop',
    select: 'id, description, enrollment_open_at, enrollment_close_at, capacity',
    columns: ['id', 'description', 'enrollment_open_at', 'enrollment_close_at', 'capacity'],
    order: 'enrollment_open_at',
  },
  session: {
    label: 'Sessions',
    table: 'session',
    select: 'id, workshop_id, starts_at, ends_at, location',
    columns: ['id', 'workshop_id', 'starts_at', 'ends_at', 'location'],
    order: 'starts_at',
  },
  'class-enrollment': {
    label: 'Workshop Enrollments',
    table: 'workshop_enrollment',
    select: 'id, workshop_id, user_id, status, requested_at',
    columns: ['id', 'workshop_id', 'user_id', 'status', 'requested_at'],
    order: 'requested_at',
  },
  form: {
    label: 'Forms',
    table: 'form',
    select: 'id, name, due_at, is_required, created_at',
    columns: ['id', 'name', 'due_at', 'is_required'],
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
    select: 'id, form_id, user_id, status, assigned_at',
    columns: ['id', 'form_id', 'user_id', 'status', 'assigned_at'],
    order: 'assigned_at',
  },
  'form-submission': {
    label: 'Form Submissions',
    table: 'form_submission',
    select: 'id, form_id, user_id, submitted_at',
    columns: ['id', 'form_id', 'user_id', 'submitted_at'],
    order: 'submitted_at',
  },
  'form-answer': {
    label: 'Form Answers',
    table: 'form_answer',
    select: 'id, submission_id, question_code, value',
    columns: ['id', 'submission_id', 'question_code', 'value'],
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
    columns: ['user_id', 'role', 'assigned_by', 'created_at'],
    order: 'created_at',
  },
  invites: {
    label: 'Invites',
    table: 'invites',
    select: 'id, inviter_user_id, invitee_user_id, invitee_email, role, status, created_at',
    columns: ['id', 'inviter_user_id', 'invitee_user_id', 'invitee_email', 'role', 'status', 'created_at'],
    order: 'created_at',
  },
}
