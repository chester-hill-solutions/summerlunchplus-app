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
}

export type { FamilyEnrollmentRequestedTemplateData }
