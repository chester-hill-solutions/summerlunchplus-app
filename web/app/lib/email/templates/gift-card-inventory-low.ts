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
  threshold: number
  nearTermDemand: number
  upcomingDemand: number
  projectedDemand: number
  projectedShortfall: number
  manageUrl: string
}

export const renderGiftCardInventoryLowEmail = ({
  provider,
  availableCount,
  threshold,
  nearTermDemand,
  upcomingDemand,
  projectedDemand,
  projectedShortfall,
  manageUrl,
}: GiftCardInventoryLowTemplateData) => {
  const safeProvider = escapeHtml(provider)
  const safeManageUrl = escapeHtml(manageUrl)

  const subject = `Low gift card inventory alert (${safeProvider})`
  const text = `Gift card inventory is low for ${provider}.
Available: ${availableCount}
Threshold: ${threshold}
Near-term demand: ${nearTermDemand}
Upcoming demand: ${upcomingDemand}
Projected demand: ${projectedDemand}
Projected shortfall: ${projectedShortfall}
Review gift card inventory: ${manageUrl}`

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f6f8fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:24px;background-color:#f6f8fb;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                <img src="https://cdn.summerlunchplus.com/summerlunch%2B.png" alt="SummerLunch Plus" width="180" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px 24px;font-family:Arial,sans-serif;color:#1f2937;font-size:16px;line-height:24px;">
                <p style="margin:0 0 12px 0;"><strong>Low gift card inventory alert (${safeProvider})</strong></p>
                <p style="margin:0 0 8px 0;">Available: <strong>${availableCount}</strong></p>
                <p style="margin:0 0 8px 0;">Threshold: <strong>${threshold}</strong></p>
                <p style="margin:0 0 8px 0;">Near-term demand: <strong>${nearTermDemand}</strong></p>
                <p style="margin:0 0 8px 0;">Upcoming demand: <strong>${upcomingDemand}</strong></p>
                <p style="margin:0 0 8px 0;">Projected demand: <strong>${projectedDemand}</strong></p>
                <p style="margin:0 0 16px 0;">Projected shortfall: <strong>${projectedShortfall}</strong></p>
                <p style="margin:0;"><a href="${safeManageUrl}">Review inventory in manage gift cards</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject,
    text,
    html,
  }
}
