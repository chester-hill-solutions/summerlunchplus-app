import { Link, useLocation, useOutletContext } from 'react-router'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { PersonLoaderData } from './person.shared'
import { profileLabel } from './person.shared'

export default function ManagePersonFamilyPage() {
  const { familyProfiles, primaryChildByGuardian } = useOutletContext<PersonLoaderData>()
  const profileById = new Map(familyProfiles.map(item => [item.id, item]))
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Family members</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>User linked</TableHead>
            <TableHead>Primary child</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {familyProfiles
            .slice()
            .sort((a, b) => profileLabel(a).localeCompare(profileLabel(b)))
            .map(member => {
              const primaryChildId = primaryChildByGuardian[member.id]
              const primaryChild = primaryChildId ? profileById.get(primaryChildId) : null
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <Link
                      to={{
                        pathname: '/manage/person',
                        search: new URLSearchParams({
                          profileId: member.id,
                          returnTo,
                        }).toString(),
                      }}
                      className="underline decoration-dotted underline-offset-2 hover:text-primary"
                    >
                      {profileLabel(member)}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{member.role ?? '-'}</TableCell>
                  <TableCell>{member.email ?? '-'}</TableCell>
                  <TableCell>{member.user_id ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{primaryChild ? profileLabel(primaryChild) : '-'}</TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
    </section>
  )
}
