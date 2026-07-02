import { Link, useLoaderData } from 'react-router'

import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/gift-cards'

type GiftCardAssetRow = {
  id: string
  provider: 'PC' | 'Sobeys'
  account_number: string
  pin: string
  value: number
  asset_url: string
  status: 'available' | 'allocated' | 'sent' | 'opened' | 'used' | 'invalid'
  assigned_profile_id: string | null
  upload_id: string
  created_at: string
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(value)

const mask = (value: string, visibleDigits = 4) => {
  const trimmed = value.trim()
  if (trimmed.length <= visibleDigits) return trimmed
  return `${'•'.repeat(Math.max(0, trimmed.length - visibleDigits))}${trimmed.slice(-visibleDigits)}`
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Forbidden', { status: 403 })
  }

  const { supabase } = createClient(request)
  const { data: assets, error } = await supabase
    .from('gift_card_asset')
    .select('id, provider, account_number, pin, value, asset_url, status, assigned_profile_id, upload_id, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500 })
  }

  return {
    assets: (assets ?? []) as GiftCardAssetRow[],
  }
}

export default function GiftCardsPage() {
  const { assets } = useLoaderData<typeof loader>()

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Gift card assets</h1>
          <p className="text-sm text-muted-foreground">Inventory of uploaded gift cards and current lifecycle status.</p>
        </div>
        <Button asChild>
          <Link to="/manage/gift-cards/upload">Upload gift cards</Link>
        </Button>
      </header>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">Provider</th>
                <th className="px-6 py-3 text-left">Account</th>
                <th className="px-6 py-3 text-left">PIN</th>
                <th className="px-6 py-3 text-left">Value</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Link</th>
                <th className="px-6 py-3 text-left">Assigned profile</th>
                <th className="px-6 py-3 text-left">Upload ID</th>
                <th className="px-6 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-6 text-center text-sm text-muted-foreground">
                    No gift card assets yet.
                  </td>
                </tr>
              ) : (
                assets.map(asset => (
                  <tr key={asset.id} className="border-b last:border-b-0">
                    <td className="px-6 py-3">{asset.provider}</td>
                    <td className="px-6 py-3 font-mono">{mask(asset.account_number)}</td>
                    <td className="px-6 py-3 font-mono">{mask(asset.pin)}</td>
                    <td className="px-6 py-3">{formatMoney(asset.value)}</td>
                    <td className="px-6 py-3 capitalize">{asset.status}</td>
                    <td className="px-6 py-3">
                      <a href={asset.asset_url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-primary">
                        Open
                      </a>
                    </td>
                    <td className="px-6 py-3 font-mono">{asset.assigned_profile_id ? asset.assigned_profile_id.slice(0, 8) : '—'}</td>
                    <td className="px-6 py-3 font-mono">{asset.upload_id.slice(0, 8)}</td>
                    <td className="px-6 py-3">{formatDateTime(asset.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
