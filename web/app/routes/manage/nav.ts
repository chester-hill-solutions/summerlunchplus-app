export type ManageNavItem = {
  to: string
  label: string
  description: string
}

export type ManageNavSection = {
  key: 'class-management' | 'zoom' | 'form-management' | 'analytics' | 'user-management' | 'email' | 'system'
  label: string
  stickerSrc: string
  stickerScale?: number
  defaultCollapsed: boolean
  items: ManageNavItem[]
}

export const overviewPage: ManageNavItem = {
  to: '/manage',
  label: 'Overview',
  description: 'Admin workspace and quick links.',
}

export const manageSections: ManageNavSection[] = [
  {
    key: 'class-management',
    label: 'Class Management',
    stickerSrc: '/stickers/salad_on_plate.png',
    defaultCollapsed: false,
    items: [
      { to: '/manage/class-attendance', label: 'Class attendance', description: 'Attendance by class and student.' },
      { to: '/manage/workshop-enrollment', label: 'Workshop enrollments', description: 'Pending, waitlisted, approved, and rejected workshop enrollments.' },
      { to: '/manage/class', label: 'Classes', description: 'Individual class schedule entries.' },
      { to: '/manage/gift-cards', label: 'Gift cards', description: 'Upload and process gift card batches.' },
      { to: '/manage/workshop', label: 'Workshops', description: 'Current workshop sections and limits.' },
      { to: '/manage/discrepancies', label: 'Discrepancies', description: 'Suspicious signals from address and network inconsistencies.' },
    ],
  },
  {
    key: 'user-management',
    label: 'User Management',
    stickerSrc: '/stickers/green_hair_orange_girl.png',
    defaultCollapsed: true,
    items: [
      { to: '/manage/families', label: 'Families', description: 'Guardian/child relationships.' },
      { to: '/manage/team', label: 'Team', description: 'Instructors and staff roles.' },
      { to: '/manage/invites', label: 'Invites', description: 'Pending/confirmed invitations.' },
      { to: '/manage/participants', label: 'Participants', description: 'Guardians, students, and unassigned users.' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    stickerSrc: '/stickers/stocks.png',
    defaultCollapsed: true,
    items: [
      {
        to: '/manage/federal-electoral-district',
        label: 'Federal electoral districts',
        description: 'Manage whitelist and meal kit flags with enrollment totals by riding status.',
      },
      {
        to: '/manage/program-analytics',
        label: 'Program analytics',
        description: 'Enrollment totals by status for Sobeys, PC, and Meal Kit programs.',
      },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    stickerSrc: '/stickers/envelope.png',
    stickerScale: 1.35,
    defaultCollapsed: true,
    items: [
      { to: '/manage/email-message', label: 'Email messages', description: 'Outbound transactional email log with delivery status and template data.' },
      { to: '/manage/email-drafts', label: 'Email drafts', description: 'Markdown drafts with versioning, preview, and publish flow.' },
    ],
  },
  {
    key: 'form-management',
    label: 'Form Management',
    stickerSrc: '/stickers/stocks.png',
    defaultCollapsed: false,
    items: [
      { to: '/manage/form', label: 'Forms', description: 'Onboarding forms configuration.' },
      { to: '/manage/form-question', label: 'Form questions', description: 'Questions tied to forms.' },
      { to: '/manage/form-question-map', label: 'Form question map', description: 'Questions mapped to forms and ordering.' },
      { to: '/manage/form-assignment', label: 'Form assignments', description: 'Assignments per user.' },
      { to: '/manage/form-submission', label: 'Form submissions', description: 'User response metadata.' },
      { to: '/manage/form-answer', label: 'Form answers', description: 'Individual answers with JSON value.' },
    ],
  },
  {
    key: 'zoom',
    label: 'Zoom',
    stickerSrc: '/stickers/camcorder.png',
    stickerScale: 1.35,
    defaultCollapsed: true,
    items: [
      { to: '/manage/zoom-connect-test', label: 'Zoom connect test', description: 'Test the configured zoom-api /zoom/connect endpoint.' },
      { to: '/manage/zoom-reset', label: 'Zoom reset', description: 'Dry-run or execute Zoom/attendance reset and deprovision meetings.' },
      { to: '/manage/zoom-host', label: 'Zoom hosts', description: 'Zoom host roster and assignment priority.' },
      { to: '/manage/class-zoom-meeting', label: 'Class Zoom meetings', description: 'Zoom meeting records mapped to classes.' },
      { to: '/manage/class-zoom-registrant', label: 'Class Zoom registrants', description: 'Per-student registrant records and join link metadata.' },
      { to: '/manage/class-zoom-participant-sync', label: 'Zoom participant sync runs', description: 'Sync job history for meeting participant ingestion.' },
      { to: '/manage/class-zoom-participant', label: 'Zoom participants', description: 'Participant snapshots captured from Zoom reports.' },
      { to: '/manage/zlr-click-event', label: 'ZLR click events', description: 'Redirect click audit events for /zlr links.' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    stickerSrc: '/stickers/gear.png',
    stickerScale: 1.35,
    defaultCollapsed: true,
    items: [
      { to: '/manage/login-event', label: 'Login events', description: 'Successful sign-in metadata and source context.' },
      {
        to: '/manage/class-attendance-raw',
        label: 'Raw attendance',
        description: 'Raw class_attendance rows before enrichment and derived debug fields.',
      },
      { to: '/manage/class-attendance-photo-upload-attempt', label: 'Photo upload attempts', description: 'Debug class photo upload failures and retries.' },
      { to: '/manage/ip-org-policy', label: 'IP org policy', description: 'Classify network org strings for proxy, ISP, and greylist discrepancy handling.' },
      { to: '/manage/semester-form-requirement', label: 'Semester surveys', description: 'Map one pre/post survey form per semester.' },
      { to: '/manage/role-permission', label: 'Role permissions', description: 'Permissions assigned to each role.' },
      { to: '/manage/request-metadata', label: 'Request metadata', description: 'Validate proxy headers and extracted request metadata.' },
      { to: '/manage/exports', label: 'Exports', description: 'Async export jobs and downloadable CSV files for manage lists.' },
      { to: '/manage/geoip-backfill', label: 'GeoIP backfill', description: 'Admin-triggered geolocation cache backfill for recent IP records.' },
      { to: '/manage/riding-lookup', label: 'Riding lookup', description: 'Retry riding lookup for profiles missing federal district assignment.' },
      { to: '/manage/user-roles', label: 'User roles', description: 'The role each user currently holds.' },
      { to: '/manage/sign-up-terms-consent', label: 'Terms consent', description: 'Accepted terms snapshots captured at signup.' },
      { to: '/manage/sign-up-terms', label: 'Sign-up terms', description: 'Active terms copy shown during account creation.' },
      { to: '/manage/semester', label: 'Semesters', description: 'Program semesters and enrollment windows.' },
    ],
  },
]

export const teamPages: ManageNavItem[] = [
  overviewPage,
  ...manageSections.flatMap(section => section.items),
]
