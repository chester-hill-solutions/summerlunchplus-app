import { expect, test } from '@playwright/test'

import { participantStatusFromAnswer } from '../../app/lib/participant-status'

test('classifies prior participation answers', () => {
  expect(participantStatusFromAnswer('No')).toBe('New')
  expect(participantStatusFromAnswer('No - this is their 1st summer')).toBe('New')
  expect(participantStatusFromAnswer('Yes')).toBe('Returning')
  expect(participantStatusFromAnswer('Yes - this is their 3rd summer')).toBe('Returning')
  expect(participantStatusFromAnswer('Unknown')).toBe('N/A')
})
