const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export type ClassCameraOrPhotoFollowupTemplateData = {
  guardianName: string
}

export const renderClassCameraOrPhotoFollowupEmail = ({
  guardianName,
}: ClassCameraOrPhotoFollowupTemplateData) => {
  const safeGuardianName = escapeHtml(guardianName)

  return {
    subject: 'Please upload your class recipe photo in the SummerLunch+ Hub',
    text:
      `Hi ${guardianName},\n` +
      '\n' +
      "Thanks for being part of today's summerlunch+ class.\n" +
      '\n' +
      "To confirm participation for today's session, please upload a photo of your completed recipe in the SummerLunch+ Hub:\n" +
      '\n' +
      '1. Log in to your SummerLunch+ account\n' +
      '2. Go to the Workshops section\n' +
      '3. Find today\'s class and click Upload Images\n' +
      '4. Select your photo(s) and submit\n' +
      '\n' +
      'Please do not reply to this email, as this inbox is not monitored.\n' +
      '\n' +
      'Thank you!\n' +
      '\n' +
      '- The summerlunch+ Team',
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
                <p style="margin:0 0 16px 0;">Hi ${safeGuardianName},</p>
                <p style="margin:0 0 16px 0;">Thanks for being part of today's summerlunch+ class.</p>
                <p style="margin:0 0 16px 0;">To confirm participation for today's session, please upload a photo of your completed recipe in the SummerLunch+ Hub:</p>
                <ol style="margin:0 0 16px 24px;padding:0;">
                  <li style="margin:0 0 8px 0;">Log in to your SummerLunch+ account</li>
                  <li style="margin:0 0 8px 0;">Go to the Workshops section</li>
                  <li style="margin:0 0 8px 0;">Find today's class and click Upload Images</li>
                  <li style="margin:0;">Select your photo(s) and submit</li>
                </ol>
                <p style="margin:0 0 16px 0;">Please do not reply to this email, as this inbox is not monitored.</p>
                <p style="margin:0 0 16px 0;">Thank you!</p>
                <p style="margin:0;">- The summerlunch+ Team</p>
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
