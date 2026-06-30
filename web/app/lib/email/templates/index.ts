import {
  renderClassReminderLoginEmail,
  type ClassReminderLoginTemplateData,
} from '@/lib/email/templates/class-reminder-login'
import {
  renderFamilyEnrollmentAcceptedEmail,
  type FamilyEnrollmentAcceptedTemplateData,
} from '@/lib/email/templates/family-enrollment-accepted'
import {
  renderFamilyEnrollmentRequestedEmail,
  type FamilyEnrollmentRequestedTemplateData,
} from '@/lib/email/templates/family-enrollment-requested'

export type EmailTemplateMap = {
  family_enrollment_requested_v1: FamilyEnrollmentRequestedTemplateData
  family_enrollment_accepted_v1: FamilyEnrollmentAcceptedTemplateData
  class_reminder_login_v1: ClassReminderLoginTemplateData
}

export type EmailTemplateKey = keyof EmailTemplateMap

export const emailTemplates: {
  [K in EmailTemplateKey]: {
    render: (data: EmailTemplateMap[K]) => { subject: string; html: string; text: string }
  }
} = {
  family_enrollment_requested_v1: {
    render: renderFamilyEnrollmentRequestedEmail,
  },
  family_enrollment_accepted_v1: {
    render: renderFamilyEnrollmentAcceptedEmail,
  },
  class_reminder_login_v1: {
    render: renderClassReminderLoginEmail,
  },
}

export type { FamilyEnrollmentRequestedTemplateData }
