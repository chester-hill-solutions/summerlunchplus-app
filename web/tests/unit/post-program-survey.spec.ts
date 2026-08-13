import { expect, test } from '@playwright/test'

import { renderPostProgramSurveyGiftCardEmail, renderPostProgramSurveyInitialEmail, renderPostProgramSurveyReminderEmail } from '../../app/lib/email/templates/post-program-survey'
import { isLastWorkshopClass } from '../../app/lib/post-program-survey/gift-card-guard'
import { assertPostProgramSurveySchedule, POST_PROGRAM_SURVEY_SCHEDULE } from '../../app/lib/post-program-survey/schedule'

test('post-program survey schedule has the seven approved Toronto slots', async () => {
  assertPostProgramSurveySchedule()
  expect(POST_PROGRAM_SURVEY_SCHEDULE).toEqual([
    { at: '2026-08-14T13:00:00.000Z', templateKey: 'post_program_survey_initial_v1' },
    { at: '2026-08-19T01:00:00.000Z', templateKey: 'post_program_survey_reminder_v1' },
    { at: '2026-08-21T01:00:00.000Z', templateKey: 'post_program_survey_reminder_v1' },
    { at: '2026-08-26T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
    { at: '2026-08-28T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
    { at: '2026-09-02T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
    { at: '2026-09-04T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  ])
})

test('post-program templates retain their required purpose', async () => {
  const data = { recipientName: 'Alex', surveyUrl: 'https://example.test/survey' }
  expect(renderPostProgramSurveyInitialEmail(data).text).toContain('pre-program questions')
  expect(renderPostProgramSurveyReminderEmail(data).text).toContain('quick reminder')
  expect(renderPostProgramSurveyGiftCardEmail(data).text).toContain('final Week 8 grocery gift card')
})

test('only the latest workshop class is a final-card candidate', async () => {
  const workshopClasses = [
    { id: 'first', ends_at: '2026-08-20T22:00:00.000Z' },
    { id: 'last', ends_at: '2026-08-27T22:00:00.000Z' },
  ]
  expect(isLastWorkshopClass({ classId: 'first', classEndsAt: workshopClasses[0].ends_at, workshopClasses })).toBeFalsy()
  expect(isLastWorkshopClass({ classId: 'last', classEndsAt: workshopClasses[1].ends_at, workshopClasses })).toBeTruthy()
})
