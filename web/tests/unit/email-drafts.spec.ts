import { expect, test } from '@playwright/test'

import { renderEmailDraft } from '../../app/lib/email/drafts/renderer.server'
import { validateDraftForPublish } from '../../app/lib/email/drafts/validators'

test('renderer interpolates variables and reports missing placeholders', async () => {
  const rendered = renderEmailDraft({
    subjectMarkdown: 'Enrollment for {{workshopName}}',
    bodyMarkdown: 'Hello {{actorName}} and {{missingValue}}',
    variables: {
      workshopName: 'Spring Kitchen',
      actorName: 'Alex',
    },
  })

  expect(rendered.subject).toBe('Enrollment for Spring Kitchen')
  expect(rendered.text).toContain('Hello Alex and {{missingValue}}')
  expect(rendered.missingVariables).toEqual(['missingValue'])
})

test('publish validation requires trigger summary for transactional drafts', async () => {
  const missingTrigger = validateDraftForPublish({
    channel: 'transactional',
    triggerSummary: '   ',
    subjectMarkdown: 'Subject',
    bodyMarkdown: 'Body',
    variablesSchema: {},
  })

  expect(missingTrigger.ok).toBeFalsy()
  expect(missingTrigger.errors).toContain('A short trigger summary is required for transactional drafts.')

  const authWithoutTrigger = validateDraftForPublish({
    channel: 'auth',
    triggerSummary: '',
    subjectMarkdown: 'Subject',
    bodyMarkdown: 'Body',
    variablesSchema: {},
  })

  expect(authWithoutTrigger.ok).toBeTruthy()
})

test('publish validation enforces required placeholders from schema', async () => {
  const validation = validateDraftForPublish({
    channel: 'transactional',
    triggerSummary: 'Sent right after enrollment request.',
    subjectMarkdown: 'Enrollment received',
    bodyMarkdown: 'Hello {{actorName}}',
    variablesSchema: {
      required: ['actorName', 'workshopName'],
    },
  })

  expect(validation.ok).toBeFalsy()
  expect(validation.errors).toContain(
    'Required variable {{workshopName}} is missing from subject/body markdown.'
  )
})
