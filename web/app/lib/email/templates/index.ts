import {
  renderClassCameraOrPhotoFollowupEmail,
  type ClassCameraOrPhotoFollowupTemplateData,
} from '@/lib/email/templates/class-camera-or-photo-followup'
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
import {
  renderGiftCardInventoryLowEmail,
  type GiftCardInventoryLowTemplateData,
} from '@/lib/email/templates/gift-card-inventory-low'
import {
  renderGiftCardReminderEmail,
  type GiftCardReminderTemplateData,
} from '@/lib/email/templates/gift-card-reminder'
import {
  renderMealKitPickupReminderEmail,
  type MealKitPickupReminderTemplateData,
} from '@/lib/email/templates/meal-kit-pickup-reminder'
import {
  renderPostProgramSurveyGiftCardEmail,
  renderPostProgramSurveyInitialEmail,
  renderPostProgramSurveyReminderEmail,
  type PostProgramSurveyTemplateData,
} from '@/lib/email/templates/post-program-survey'

export type EmailTemplateMap = {
  family_enrollment_requested_v1: FamilyEnrollmentRequestedTemplateData
  family_enrollment_accepted_v1: FamilyEnrollmentAcceptedTemplateData
  class_reminder_login_v1: ClassReminderLoginTemplateData
  class_camera_or_photo_followup_v1: ClassCameraOrPhotoFollowupTemplateData
  gift_card_inventory_low_v1: GiftCardInventoryLowTemplateData
  gift_card_reminder_v1: GiftCardReminderTemplateData
  meal_kit_pickup_reminder_v1: MealKitPickupReminderTemplateData
  post_program_survey_initial_v1: PostProgramSurveyTemplateData
  post_program_survey_reminder_v1: PostProgramSurveyTemplateData
  post_program_survey_gift_card_v1: PostProgramSurveyTemplateData
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
  class_camera_or_photo_followup_v1: {
    render: renderClassCameraOrPhotoFollowupEmail,
  },
  gift_card_inventory_low_v1: {
    render: renderGiftCardInventoryLowEmail,
  },
  gift_card_reminder_v1: {
    render: renderGiftCardReminderEmail,
  },
  meal_kit_pickup_reminder_v1: {
    render: renderMealKitPickupReminderEmail,
  },
  post_program_survey_initial_v1: {
    render: renderPostProgramSurveyInitialEmail,
  },
  post_program_survey_reminder_v1: {
    render: renderPostProgramSurveyReminderEmail,
  },
  post_program_survey_gift_card_v1: {
    render: renderPostProgramSurveyGiftCardEmail,
  },
}

export type { FamilyEnrollmentRequestedTemplateData }
