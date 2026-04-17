export type LookupMapping = {
  keyColumn: string
  table: string
  valueColumn?: string
  valueColumns?: string[]
  resultColumn: string
  keyColumnInTable?: string
  select?: string
  format?: 'profile_display' | 'semester_range' | 'class_display' | 'submission_display'
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
  profile: {
    label: 'Profiles',
    table: 'profile',
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
  'person-guardian-child': {
    label: 'Guardian Child Links',
    table: 'person_guardian_child',
    select: 'guardian_profile_id, child_profile_id, primary_child',
    columns: ['guardian_display', 'child_display', 'primary_child'],
    lookupMappings: [
      {
        keyColumn: 'guardian_profile_id',
        table: 'profile',
        resultColumn: 'guardian_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      {
        keyColumn: 'child_profile_id',
        table: 'profile',
        resultColumn: 'child_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
    ],
    order: 'guardian_profile_id',
  },
  workshop: {
    label: 'Workshops',
    table: 'workshop',
    select: 'id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity',
    columns: ['semester_range', 'description', 'enrollment_open_at', 'enrollment_close_at', 'capacity'],
    lookupMappings: [
      {
        keyColumn: 'semester_id',
        table: 'semester',
        resultColumn: 'semester_range',
        select: 'id, starts_at, ends_at',
        format: 'semester_range',
      },
    ],
    order: 'enrollment_open_at',
  },
  semester: {
    label: 'Semesters',
    table: 'semester',
    select: 'id, starts_at, ends_at, enrollment_open_at, enrollment_close_at',
    columns: ['starts_at', 'ends_at', 'enrollment_open_at', 'enrollment_close_at'],
    order: 'starts_at',
  },
  class: {
    label: 'Classes',
    table: 'class',
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
    select: 'id, workshop_id, semester_id, profile_id, decided_by, status, requested_at',
    columns: ['semester_range', 'workshop_description', 'profile_display', 'status', 'requested_at', 'decided_by_email'],
    order: 'requested_at',
    lookupMappings: [
      {
        keyColumn: 'profile_id',
        table: 'profile',
        resultColumn: 'profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      {
        keyColumn: 'semester_id',
        table: 'semester',
        resultColumn: 'semester_range',
        select: 'id, starts_at, ends_at',
        format: 'semester_range',
      },
      {
        keyColumn: 'workshop_id',
        table: 'workshop',
        valueColumn: 'description',
        resultColumn: 'workshop_description',
      },
      { keyColumn: 'decided_by', table: 'auth.users', valueColumn: 'email', resultColumn: 'decided_by_email' },
    ],
  },
  'class-attendance': {
    label: 'Class Attendance',
    table: 'class_attendance',
    select: 'id, class_id, profile_id, status, recorded_by, created_at',
    columns: ['class_display', 'profile_display', 'status', 'recorded_by_email', 'created_at'],
    order: 'created_at',
    lookupMappings: [
      {
        keyColumn: 'class_id',
        table: 'class',
        resultColumn: 'class_display',
        select: 'id, starts_at, workshop:workshop_id ( description )',
        format: 'class_display',
      },
      {
        keyColumn: 'profile_id',
        table: 'profile',
        resultColumn: 'profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      { keyColumn: 'recorded_by', table: 'auth.users', valueColumn: 'email', resultColumn: 'recorded_by_email' },
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
    select: 'question_code, prompt, type, options',
    columns: ['question_code', 'prompt', 'type', 'options'],
    order: 'question_code',
  },
  'form-question-map': {
    label: 'Form Question Map',
    table: 'form_question_map',
    select: 'form_id, question_code, position, prompt_override, options_override',
    columns: ['form_name', 'question_code', 'position', 'prompt_override', 'options_override'],
    order: 'form_id',
    lookupMappings: [
      { keyColumn: 'form_id', table: 'form', valueColumn: 'name', resultColumn: 'form_name' },
    ],
  },
  'form-assignment': {
    label: 'Form Assignments',
    table: 'form_assignment',
    select: 'id, form_id, user_id, status, assigned_at, assigned_by',
    columns: ['form_name', 'user_email', 'status', 'assigned_at', 'assigned_by_email'],
    order: 'assigned_at',
    lookupMappings: [
      { keyColumn: 'form_id', table: 'form', valueColumn: 'name', resultColumn: 'form_name' },
      { keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' },
      { keyColumn: 'assigned_by', table: 'auth.users', valueColumn: 'email', resultColumn: 'assigned_by_email' },
    ],
  },
  'form-submission': {
    label: 'Form Submissions',
    table: 'form_submission',
    select:
      'id, form_id, profile_id, user_id, submitted_at, ip_address, forwarded_for, user_agent, accept_language, referer, origin, metadata',
    columns: [
      'form_name',
      'profile_display',
      'user_email',
      'submitted_at',
      'ip_address',
      'forwarded_for',
      'user_agent',
      'accept_language',
      'referer',
      'origin',
      'metadata',
    ],
    order: 'submitted_at',
    lookupMappings: [
      { keyColumn: 'form_id', table: 'form', valueColumn: 'name', resultColumn: 'form_name' },
      {
        keyColumn: 'profile_id',
        table: 'profile',
        resultColumn: 'profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      { keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' },
    ],
  },
  'form-answer': {
    label: 'Form Answers',
    table: 'form_answer',
    select: 'id, submission_id, question_code, value',
    columns: ['submission_display', 'question_code', 'value'],
    order: 'id',
    lookupMappings: [
      {
        keyColumn: 'submission_id',
        table: 'form_submission',
        resultColumn: 'submission_display',
        select: 'id, submitted_at, profile:profile_id ( id, firstname, surname, email )',
        format: 'submission_display',
      },
    ],
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
  'login-event': {
    label: 'Login Events',
    table: 'login_event',
    select:
      'id, user_id, email, login_method, success, event_at, ip_address, forwarded_for, user_agent, accept_language, referer, origin, metadata',
    columns: [
      'user_email',
      'email',
      'login_method',
      'success',
      'event_at',
      'ip_address',
      'forwarded_for',
      'user_agent',
      'accept_language',
      'referer',
      'origin',
      'metadata',
    ],
    order: 'event_at',
    lookupMappings: [
      { keyColumn: 'user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'user_email' },
    ],
  },
}
