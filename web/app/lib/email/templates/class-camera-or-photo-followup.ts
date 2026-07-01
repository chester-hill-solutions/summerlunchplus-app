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
    subject: 'Please share your class recipe photo',
    text:
      `Hi ${guardianName},\n` +
      '\n' +
      "Thanks for being part of today's summerlunch+ class!\n" +
      '\n' +
      'It seems like your camera was turned off during class if you experienced any connectivity issues, please send us a photo of your completed recipe so we can confirm participation for today\'s session.\n' +
      '\n' +
      'You can reply directly to this email with your photo attached.\n' +
      '\n' +
      'Thank you, and we hope you enjoyed cooking with us!\n' +
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
                <p style="margin:0 0 16px 0;">Thanks for being part of today's summerlunch+ class!</p>
                <p style="margin:0 0 16px 0;">It seems like your camera was turned off during class if you experienced any connectivity issues, please send us a photo of your completed recipe so we can confirm participation for today's session.</p>
                <p style="margin:0 0 16px 0;">You can reply directly to this email with your photo attached.</p>
                <p style="margin:0 0 16px 0;">Thank you, and we hope you enjoyed cooking with us!</p>
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
