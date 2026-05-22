export type LookupMapping = {
  keyColumn: string
  table: string
  valueColumn?: string
  valueColumns?: string[]
  resultColumn: string
  keyColumnInTable?: string
  select?: string
  format?: 'profile_display' | 'semester_range' | 'semester_title' | 'class_display' | 'submission_display'
}

export type EditorFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'foreign_key' | 'enum' | 'json'

export type EditorFieldConfig = {
  label?: string
  type: EditorFieldType
  required?: boolean
  nullable?: boolean
  foreignKeyTable?: string
  enumValues?: string[]
}

export type TableEditorConfig = {
  primaryKey: string[]
  allowInsert: boolean
  allowUpdate: boolean
  fields: Record<string, EditorFieldConfig>
}

export type TableDefinition = {
  label: string
  table: string
  select: string
  columns: string[]
  order: string
  lookupMappings?: LookupMapping[]
  editor?: TableEditorConfig
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
    label: 'Families',
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
    select: 'id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity',
    columns: ['semester_range', 'description', 'enrollment_open_at', 'enrollment_close_at', 'capacity', 'wait_list_capacity'],
    lookupMappings: [
      {
        keyColumn: 'semester_id',
        table: 'semester',
        resultColumn: 'semester_range',
        select: 'id, name, starts_at, ends_at',
        format: 'semester_range',
      },
    ],
    order: 'enrollment_open_at',
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        semester_id: { label: 'Semester', type: 'foreign_key', required: true, foreignKeyTable: 'semester' },
        description: { label: 'Description', type: 'text', nullable: true },
        enrollment_open_at: { label: 'Enrollment Open', type: 'datetime', nullable: true },
        enrollment_close_at: { label: 'Enrollment Close', type: 'datetime', nullable: true },
        capacity: { label: 'Capacity', type: 'number', required: true },
        wait_list_capacity: { label: 'Waitlist Capacity', type: 'number', required: true },
      },
    },
  },
  semester: {
    label: 'Semesters',
    table: 'semester',
    select: 'id, name, description, starts_at, ends_at, enrollment_open_at, enrollment_close_at',
    columns: ['name', 'description', 'starts_at', 'ends_at', 'enrollment_open_at', 'enrollment_close_at'],
    order: 'starts_at',
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        name: { label: 'Name', type: 'text', nullable: true },
        description: { label: 'Description', type: 'text', nullable: true },
        starts_at: { label: 'Starts At', type: 'datetime', required: true },
        ends_at: { label: 'Ends At', type: 'datetime', required: true },
        enrollment_open_at: { label: 'Enrollment Open', type: 'datetime', nullable: true },
        enrollment_close_at: { label: 'Enrollment Close', type: 'datetime', nullable: true },
      },
    },
  },
  class: {
    label: 'Classes',
    table: 'class',
    select: 'id, workshop_id, starts_at, ends_at',
    columns: ['workshop_description', 'starts_at', 'ends_at'],
    order: 'starts_at',
    lookupMappings: [
      { keyColumn: 'workshop_id', table: 'workshop', valueColumn: 'description', resultColumn: 'workshop_description' },
    ],
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        workshop_id: { label: 'Workshop', type: 'foreign_key', nullable: true, foreignKeyTable: 'workshop' },
        starts_at: { label: 'Starts At', type: 'datetime', required: true },
        ends_at: { label: 'Ends At', type: 'datetime', required: true },
      },
    },
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
        select: 'id, name, starts_at, ends_at',
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
    select: 'id, class_id, profile_id, status, camera_on, recorded_by, created_at',
    columns: ['class_display', 'profile_display', 'status', 'camera_on', 'recorded_by_email', 'created_at'],
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
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        name: { label: 'Name', type: 'text', required: true },
        due_at: { label: 'Due At', type: 'datetime', nullable: true },
        is_required: { label: 'Required', type: 'boolean', required: true },
      },
    },
  },
  'form-question': {
    label: 'Form Questions',
    table: 'form_question',
    select: 'question_code, prompt, type, options',
    columns: ['question_code', 'prompt', 'type', 'options'],
    order: 'question_code',
    editor: {
      primaryKey: ['question_code'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        question_code: { label: 'Question Code', type: 'text', required: true },
        prompt: { label: 'Prompt', type: 'text', required: true },
        type: {
          label: 'Type',
          type: 'enum',
          required: true,
          enumValues: [
            'text',
            'number',
            'single_choice',
            'multi_choice',
            'date',
            'address',
            'agreement',
            'checkbox',
            'no-input-text',
          ],
        },
        options: { label: 'Options JSON', type: 'json', required: true },
      },
    },
  },
  'sign-up-terms': {
    label: 'Sign-up Terms',
    table: 'sign_up_terms',
    select: 'id, slug, title, content, version, is_active, updated_at',
    columns: ['slug', 'title', 'content', 'version', 'is_active', 'updated_at'],
    order: 'updated_at',
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        slug: { label: 'Slug', type: 'text', required: true },
        title: { label: 'Title', type: 'text', required: true },
        content: { label: 'Content', type: 'text', required: true },
        version: { label: 'Version', type: 'number', required: true },
        is_active: { label: 'Active', type: 'boolean', required: true },
      },
    },
  },
  'sign-up-terms-consent': {
    label: 'Sign-up Terms Consent',
    table: 'sign_up_terms_consent',
    select: 'id, user_id, profile_id, email, role, terms_version, accepted_at',
    columns: ['email', 'role', 'terms_version', 'accepted_at', 'profile_display', 'user_email'],
    order: 'accepted_at',
    lookupMappings: [
      {
        keyColumn: 'profile_id',
        table: 'profile',
        resultColumn: 'profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      {
        keyColumn: 'user_id',
        table: 'profile',
        keyColumnInTable: 'user_id',
        resultColumn: 'user_email',
        select: 'user_id, firstname, surname, email',
        format: 'profile_display',
      },
    ],
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
    editor: {
      primaryKey: ['form_id', 'question_code'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        form_id: { label: 'Form', type: 'foreign_key', required: true, foreignKeyTable: 'form' },
        question_code: { label: 'Question', type: 'foreign_key', required: true, foreignKeyTable: 'form_question' },
        position: { label: 'Position', type: 'number', required: true },
        prompt_override: { label: 'Prompt Override', type: 'text', nullable: true },
        options_override: { label: 'Options Override JSON', type: 'json', nullable: true },
      },
    },
  },
  'form-assignment': {
    label: 'Form Assignments',
    table: 'form_assignment',
    select: 'id, form_id, user_id, status, assigned_at, assigned_by',
    columns: ['form_name', 'user_email', 'status', 'assigned_at', 'assigned_by_email'],
    order: 'assigned_at',
    lookupMappings: [
      { keyColumn: 'form_id', table: 'form', valueColumn: 'name', resultColumn: 'form_name' },
      {
        keyColumn: 'user_id',
        table: 'profile',
        keyColumnInTable: 'user_id',
        resultColumn: 'user_email',
        select: 'user_id, firstname, surname, email',
        format: 'profile_display',
      },
      {
        keyColumn: 'assigned_by',
        table: 'profile',
        keyColumnInTable: 'user_id',
        resultColumn: 'assigned_by_email',
        select: 'user_id, firstname, surname, email',
        format: 'profile_display',
      },
    ],
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        form_id: { label: 'Form', type: 'foreign_key', required: true, foreignKeyTable: 'form' },
        user_id: { label: 'User', type: 'foreign_key', required: true, foreignKeyTable: 'auth.users' },
        status: { label: 'Status', type: 'enum', required: true, enumValues: ['pending', 'submitted'] },
        assigned_at: { label: 'Assigned At', type: 'datetime', required: true },
        assigned_by: { label: 'Assigned By', type: 'foreign_key', nullable: true, foreignKeyTable: 'auth.users' },
        due_at: { label: 'Due At', type: 'datetime', nullable: true },
      },
    },
  },
  'semester-form-requirement': {
    label: 'Semester Survey Mapping',
    table: 'semester_form_requirement',
    select: 'id, semester_id, form_id, kind, is_required, is_active, updated_at',
    columns: ['semester_title', 'kind', 'form_name', 'is_required', 'is_active', 'updated_at'],
    order: 'updated_at',
    lookupMappings: [
      {
        keyColumn: 'semester_id',
        table: 'semester',
        resultColumn: 'semester_title',
        select: 'id, name, description',
        format: 'semester_title',
      },
      {
        keyColumn: 'form_id',
        table: 'form',
        valueColumn: 'name',
        resultColumn: 'form_name',
      },
    ],
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        semester_id: { label: 'Semester', type: 'foreign_key', required: true, foreignKeyTable: 'semester' },
        form_id: { label: 'Form', type: 'foreign_key', required: true, foreignKeyTable: 'form' },
        kind: {
          label: 'Survey Type',
          type: 'enum',
          required: true,
          enumValues: ['pre_program_survey', 'post_program_survey'],
        },
        is_required: { label: 'Required', type: 'boolean', required: true },
        is_active: { label: 'Active', type: 'boolean', required: true },
      },
    },
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
      {
        keyColumn: 'user_id',
        table: 'profile',
        keyColumnInTable: 'user_id',
        resultColumn: 'user_email',
        select: 'user_id, firstname, surname, email',
        format: 'profile_display',
      },
    ],
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        form_id: { label: 'Form', type: 'foreign_key', required: true, foreignKeyTable: 'form' },
        profile_id: { label: 'Profile', type: 'foreign_key', required: true, foreignKeyTable: 'profile' },
        user_id: { label: 'User', type: 'foreign_key', nullable: true, foreignKeyTable: 'auth.users' },
        submitted_at: { label: 'Submitted At', type: 'datetime', required: true },
      },
    },
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
        select: 'id, submitted_at, form:form_id ( name ), profile:profile_id ( id, firstname, surname, email )',
        format: 'submission_display',
      },
    ],
    editor: {
      primaryKey: ['id'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        submission_id: { label: 'Submission', type: 'foreign_key', required: true, foreignKeyTable: 'form_submission' },
        question_code: { label: 'Question', type: 'foreign_key', required: true, foreignKeyTable: 'form_question' },
        value: { label: 'Answer JSON', type: 'json', required: true },
      },
    },
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
      {
        keyColumn: 'user_id',
        table: 'profile',
        keyColumnInTable: 'user_id',
        valueColumn: 'email',
        resultColumn: 'user_email',
      },
      {
        keyColumn: 'assigned_by',
        table: 'profile',
        keyColumnInTable: 'user_id',
        valueColumn: 'email',
        resultColumn: 'assigned_by_email',
      },
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
  'email-message': {
    label: 'Email Messages',
    table: 'email_message',
    select:
      'id, to_email, subject, template_key, template_data, provider, provider_message_id, status, error_message, sent_at, failed_at, triggered_by_user_id, recipient_user_id, profile_id, family_profile_id, workshop_enrollment_id, event_key, created_at',
    columns: [
      'created_at',
      'status',
      'to_email',
      'subject',
      'template_key',
      'provider',
      'provider_message_id',
      'triggered_by_email',
      'recipient_user_email',
      'recipient_profile_display',
      'family_profile_display',
      'workshop_description',
      'event_key',
      'error_message',
      'sent_at',
      'failed_at',
      'template_data',
      'resend',
    ],
    order: 'created_at',
    lookupMappings: [
      { keyColumn: 'triggered_by_user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'triggered_by_email' },
      { keyColumn: 'recipient_user_id', table: 'auth.users', valueColumn: 'email', resultColumn: 'recipient_user_email' },
      {
        keyColumn: 'profile_id',
        table: 'profile',
        resultColumn: 'recipient_profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      {
        keyColumn: 'family_profile_id',
        table: 'profile',
        resultColumn: 'family_profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
      {
        keyColumn: 'workshop_enrollment_id',
        table: 'workshop_enrollment',
        valueColumn: 'workshop_id',
        resultColumn: 'workshop_id_lookup',
      },
      {
        keyColumn: 'workshop_id_lookup',
        table: 'workshop',
        valueColumn: 'description',
        resultColumn: 'workshop_description',
      },
    ],
  },
  discrepancies: {
    label: 'Discrepancies',
    table: 'suspicious_signal',
    select: 'id, subject_profile_id, family_profile_ids, signal_type, severity, summary, details, status, created_at, resolved_at',
    columns: ['subject_profile_display', 'signal_type', 'severity', 'summary', 'status', 'created_at', 'resolved_at'],
    order: 'created_at',
    lookupMappings: [
      {
        keyColumn: 'subject_profile_id',
        table: 'profile',
        resultColumn: 'subject_profile_display',
        select: 'id, firstname, surname, email',
        format: 'profile_display',
      },
    ],
  },
  'federal-electoral-district': {
    label: 'Federal Electoral Districts',
    table: 'federal_electoral_district',
    select: 'code, name, whitelist, meal_kit, updated_at',
    columns: ['code', 'name', 'whitelist', 'meal_kit', 'updated_at'],
    order: 'code',
    editor: {
      primaryKey: ['name'],
      allowInsert: true,
      allowUpdate: true,
      fields: {
        code: { label: 'Code', type: 'number', required: true },
        name: { label: 'Riding Name', type: 'text', required: true },
        whitelist: { label: 'Whitelist', type: 'boolean', required: true },
        meal_kit: { label: 'Meal Kit', type: 'boolean', required: true },
      },
    },
  },
}
