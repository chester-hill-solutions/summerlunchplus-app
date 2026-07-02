const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export type ClassReminderLoginTemplateData = {
  workshopName: string
  loginUrl: string
}

export const renderClassReminderLoginEmail = ({
  workshopName,
  loginUrl,
}: ClassReminderLoginTemplateData) => {
  const safeWorkshopName = escapeHtml(workshopName)
  const safeLoginUrl = escapeHtml(loginUrl)

  return {
    subject: `Reminder: ${workshopName} starts soon`,
    text: `Reminder: ${workshopName} starts soon. Log in to join your class: ${loginUrl}`,
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
                <p style="margin:0 0 16px 0;"><strong>${safeWorkshopName}</strong> starts soon.</p>
                <p style="margin:0 0 16px 0;">Please log in to SummerLunch+ to join your class.</p>
                <p style="margin:0;"><a href="${safeLoginUrl}">Log in to join class</a></p>
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
