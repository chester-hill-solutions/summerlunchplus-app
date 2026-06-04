import { expect, test } from '@playwright/test'

import { renderEmailDraft } from '../../app/lib/email/drafts/renderer.server'
import {
  compareRenderedEmail,
  legacyMigrationFlagEnvKey,
  migrationModeEnvKey,
  parseTemplateMigrationMode,
} from '../../app/lib/email/migration'
import { renderFamilyEnrollmentAcceptedEmail } from '../../app/lib/email/templates/family-enrollment-accepted'
import { renderFamilyEnrollmentRequestedEmail } from '../../app/lib/email/templates/family-enrollment-requested'

const requestedMarkdown = {
  subject: "We've received your summerlunch+ registration!",
  body: `Hi,

Thank you for registering for summerlunch+! We're excited to welcome your family this summer.

Your registration has been received and is currently pending approval. Our team will review your information and send you a confirmation email shortly with your program details, class schedule, and next steps.

While you wait, we encourage you to invite additional family members to join your profile.

As a reminder, to help maintain a safe and engaging class environment, all participants must be supervised by a parent or guardian during classes and are expected to keep their cameras on throughout the session.

Registration details:
- Registered by: {{actorName}} ({{actorEmail}})
- Workshop: {{workshopName}}

If you have any questions in the meantime, feel free to email us at hello@summerlunchplus.com.

We're looking forward to cooking with you soon!

- The summerlunch+ Team`,
}

const acceptedMarkdown = {
  subject: 'Family enrollment accepted',
  body: `Great news! Your family enrollment for {{workshopName}} has been accepted.`,
}

test('migration mode parser supports explicit modes and legacy compatibility', async () => {
  const key = 'family_enrollment_requested_v1'
  const modeEnv = migrationModeEnvKey(key)
  const legacyEnv = legacyMigrationFlagEnvKey(key)

  expect(
    parseTemplateMigrationMode({
      templateKey: key,
      env: { [modeEnv]: 'draft' },
    })
  ).toBe('draft')

  expect(
    parseTemplateMigrationMode({
      templateKey: key,
      env: { [modeEnv]: 'shadow' },
    })
  ).toBe('shadow')

  expect(
    parseTemplateMigrationMode({
      templateKey: key,
      env: { [legacyEnv]: 'true' },
    })
  ).toBe('draft')

  expect(
    parseTemplateMigrationMode({
      templateKey: key,
      env: {},
    })
  ).toBe('legacy')
})

test('requested template draft render preserves subject and text semantics', async () => {
  const vars = {
    actorName: 'Sai Tests',
    actorEmail: 'sai+tests123@chsolutions.ca',
    workshopName: 'Beginner Kitchen',
  }

  const legacy = renderFamilyEnrollmentRequestedEmail(vars)
  const draft = renderEmailDraft({
    subjectMarkdown: requestedMarkdown.subject,
    bodyMarkdown: requestedMarkdown.body,
    variables: vars,
  })

  const parity = compareRenderedEmail({ legacy, draft })
  expect(parity.subjectMatch).toBeTruthy()
  expect(parity.textMatch).toBeTruthy()
})

test('accepted template draft render preserves subject and text semantics', async () => {
  const vars = {
    workshopName: 'Beginner Kitchen',
  }

  const legacy = renderFamilyEnrollmentAcceptedEmail(vars)
  const draft = renderEmailDraft({
    subjectMarkdown: acceptedMarkdown.subject,
    bodyMarkdown: acceptedMarkdown.body,
    variables: vars,
  })

  const parity = compareRenderedEmail({ legacy, draft })
  expect(parity.subjectMatch).toBeTruthy()
  expect(parity.textMatch).toBeTruthy()
})
