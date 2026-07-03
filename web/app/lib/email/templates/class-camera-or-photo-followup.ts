export type ClassCameraOrPhotoFollowupTemplateData = {
  guardianName: string
}

export const renderClassCameraOrPhotoFollowupEmail = ({
  guardianName,
}: ClassCameraOrPhotoFollowupTemplateData) => {
  void guardianName

  return {
    subject: 'Please upload your class recipe photo in the SummerLunch+ Hub',
    text:
      'Hi everyone,\n' +
      '\n' +
      'Thank you for another fantastic class! We loved cooking with everyone and seeing your recipes and smiling faces.\n' +
      '\n' +
      "If you couldn't attend the live class, or joined with your camera off, you can still complete this week's participation requirement by uploading 2 photos of recipes you made from this week.\n" +
      '\n' +
      'How to upload your photos:\n' +
      '1. Log in to your summerlunch+ Hub account.\n' +
      '2. Go to the Workshops section.\n' +
      "3. Find today's class and click Upload Images.\n" +
      '4. Select your photos and click Submit.\n' +
      '\n' +
      "If you attended the live class with your camera on, we'd also love to see photos of your finished dishes! Sharing your creations helps us celebrate everyone's hard work and makes our cooking community even more fun.\n" +
      '\n' +
      "Thank you, and we can't wait to see what you made!\n" +
      '\n' +
      'The summerlunch+ Team',
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
                <p style="margin:0 0 16px 0;">Hi everyone,</p>
                <p style="margin:0 0 16px 0;">Thank you for another fantastic class! We loved cooking with everyone and seeing your recipes and smiling faces.</p>
                <p style="margin:0 0 16px 0;">If you couldn't attend the live class, or joined with your camera off, you can still complete this week's participation requirement by uploading 2 photos of recipes you made from this week.</p>
                <p style="margin:0 0 16px 0;">How to upload your photos:</p>
                <ol style="margin:0 0 16px 24px;padding:0;">
                  <li style="margin:0 0 8px 0;">Log in to your summerlunch+ Hub account.</li>
                  <li style="margin:0 0 8px 0;">Go to the Workshops section.</li>
                  <li style="margin:0 0 8px 0;">Find today's class and click Upload Images.</li>
                  <li style="margin:0;">Select your photos and click Submit.</li>
                </ol>
                <p style="margin:0 0 16px 0;">If you attended the live class with your camera on, we'd also love to see photos of your finished dishes! Sharing your creations helps us celebrate everyone's hard work and makes our cooking community even more fun.</p>
                <p style="margin:0 0 16px 0;">Thank you, and we can't wait to see what you made!</p>
                <p style="margin:0;">The summerlunch+ Team</p>
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
