export const POST_PROGRAM_SURVEY_SCHEDULE = [
  { at: '2026-08-14T13:00:00.000Z', templateKey: 'post_program_survey_initial_v1' },
  { at: '2026-08-19T01:00:00.000Z', templateKey: 'post_program_survey_reminder_v1' },
  { at: '2026-08-21T01:00:00.000Z', templateKey: 'post_program_survey_reminder_v1' },
  { at: '2026-08-26T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  { at: '2026-08-28T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  { at: '2026-09-02T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
  { at: '2026-09-04T01:00:00.000Z', templateKey: 'post_program_survey_gift_card_v1' },
] as const

export const assertPostProgramSurveySchedule = () => {
  const slots = POST_PROGRAM_SURVEY_SCHEDULE.map(slot => slot.at)
  if (new Set(slots).size !== slots.length || slots.some((slot, index) => index > 0 && slot <= slots[index - 1])) {
    throw new Error('Post-program survey schedule must contain unique increasing slots')
  }
}
