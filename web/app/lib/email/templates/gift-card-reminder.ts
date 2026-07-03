const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export type GiftCardReminderTemplateData = {
  provider: 'PC' | 'Sobeys'
  amount: number
  hubUrl: string
}

export const renderGiftCardReminderEmail = ({
  provider,
  amount,
  hubUrl,
}: GiftCardReminderTemplateData) => {
  const safeProvider = escapeHtml(provider)
  const safeUrl = escapeHtml(hubUrl)
  const amountLabel = Number.isFinite(amount) ? amount.toFixed(2) : '0.00'

  return {
    subject: `Your ${safeProvider} gift card is ready`,
    text: `Your ${safeProvider} gift card ($${amountLabel}) is now available. Sign in to SummerLunch Plus Hub to view your gift card: ${hubUrl}`,
    html: `<!doctype html>
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
                <p style="margin:0 0 12px 0;">Your <strong>${safeProvider}</strong> gift card is ready.</p>
                <p style="margin:0 0 16px 0;">Card value: <strong>$${amountLabel}</strong></p>
                <p style="margin:0 0 12px 0;">Sign in to SummerLunch Plus Hub to view your gift card.</p>
                <p style="margin:0;"><a href="${safeUrl}">Sign in to hub.summerlunchplus.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  }
}
