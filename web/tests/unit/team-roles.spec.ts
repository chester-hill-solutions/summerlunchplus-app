import { expect, test } from '@playwright/test'

import {
  ACCOUNT_DISABLE_BAN_DURATION,
  ACCOUNT_ENABLE_BAN_DURATION,
  isManageableTeamRole,
  MANAGEABLE_TEAM_ROLES,
} from '../../app/lib/team-roles'

test('only instructor, staff, and manager roles are manageable', () => {
  expect(MANAGEABLE_TEAM_ROLES).toEqual(['instructor', 'staff', 'manager'])

  for (const role of MANAGEABLE_TEAM_ROLES) {
    expect(isManageableTeamRole(role)).toBeTruthy()
  }

  for (const role of ['admin', 'student', 'guardian', 'unassigned', '', null, undefined]) {
    expect(isManageableTeamRole(role)).toBeFalsy()
  }
})

test('ban durations use the Supabase admin format', () => {
  expect(ACCOUNT_DISABLE_BAN_DURATION).toMatch(/^\d+h$/)
  expect(ACCOUNT_ENABLE_BAN_DURATION).toBe('none')
})
