const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export type GiftCardInventoryLowTemplateData = {
  provider: 'PC' | 'Sobeys'
  availableCount: number
  thisWeekLabel: string
  thisWeekNeeded: number
  thisWeekShortfall: number
  upcomingWeekLabel: string
  upcomingWeekNeeded: number
  upcomingWeekShortfall: number
  manageUrl: string
}

export const renderGiftCardInventoryLowEmail = ({
  provider,
  availableCount,
  thisWeekLabel,
  thisWeekNeeded,
  thisWeekShortfall,
  upcomingWeekLabel,
  upcomingWeekNeeded,
  upcomingWeekShortfall,
  manageUrl,
}: GiftCardInventoryLowTemplateData) => {
  const safeProvider = escapeHtml(provider)
  const safeManageUrl = escapeHtml(manageUrl)
  const safeThisWeekLabel = escapeHtml(thisWeekLabel)
  const safeUpcomingWeekLabel = escapeHtml(upcomingWeekLabel)
  const subject = `Gift card shortfall alert (${safeProvider})`
  const text = `Gift card inventory cannot cover upcoming qualified attendance for ${provider}.
Available: ${availableCount}
This week (${thisWeekLabel}) still needed: ${thisWeekNeeded}
This week shortfall: ${thisWeekShortfall}
Upcoming week (${upcomingWeekLabel}) still needed: ${upcomingWeekNeeded}
Upcoming week shortfall: ${upcomingWeekShortfall}
Review gift card inventory: ${manageUrl}`
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background-color:#f6f8fb;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:24px;background-color:#f6f8fb;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="padding:24px 24px 8px;text-align:center;"><img src="https://cdn.summerlunchplus.com/summerlunch%2B.png" alt="SummerLunch Plus" width="180" style="display:block;margin:0 auto;border:0;height:auto;" /></td></tr><tr><td style="padding:8px 24px 24px;font-family:Arial,sans-serif;color:#1f2937;font-size:16px;line-height:24px;"><p style="margin:0 0 12px;"><strong>Gift card shortfall alert (${safeProvider})</strong></p><p style="margin:0 0 8px;">Available: <strong>${availableCount}</strong></p><p style="margin:0 0 8px;">This week (${safeThisWeekLabel}) still needed: <strong>${thisWeekNeeded}</strong></p><p style="margin:0 0 8px;">This week shortfall: <strong>${thisWeekShortfall}</strong></p><p style="margin:0 0 8px;">Upcoming week (${safeUpcomingWeekLabel}) still needed: <strong>${upcomingWeekNeeded}</strong></p><p style="margin:0 0 16px;">Upcoming week shortfall: <strong>${upcomingWeekShortfall}</strong></p><p style="margin:0;"><a href="${safeManageUrl}">Review inventory in manage gift cards</a></p></td></tr></table></td></tr></table></body></html>`
  return { subject, text, html }
}
