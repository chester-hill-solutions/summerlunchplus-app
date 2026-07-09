export type MealKitPickupReminderTemplateData = Record<string, never>

export const renderMealKitPickupReminderEmail = (_data: MealKitPickupReminderTemplateData) => {
  const subject = 'SummerLunch+ meal kit pickup reminder for today'
  const text = `Hi,
This is a friendly reminder that summerlunch+ meal kit pickup is today, Tuesday, at the East York Town Centre.
Pickup Location: Thorncliffe Community Hub - Entrance 6
Pickup Time: Between 1:00 PM and 6:00 PM
Please remember to bring reusable bags or a shopping trolley/cart, as the meal kits can be heavy.
If you are unable to attend pickup, please let us know as soon as possible by replying to this email.
We look forward to seeing you today!
- The summerlunch+ Team`

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
                <p style="margin:0 0 12px 0;">Hi,</p>
                <p style="margin:0 0 12px 0;">This is a friendly reminder that summerlunch+ meal kit pickup is <strong>today, Tuesday</strong>, at the East York Town Centre.</p>
                <p style="margin:0 0 8px 0;">Pickup Location: Thorncliffe Community Hub - Entrance 6</p>
                <p style="margin:0 0 12px 0;">Pickup Time: Between 1:00 PM and 6:00 PM</p>
                <p style="margin:0 0 12px 0;">Please remember to bring reusable bags or a shopping trolley/cart, as the meal kits can be heavy.</p>
                <p style="margin:0 0 12px 0;">If you are unable to attend pickup, please let us know as soon as possible by replying to this email.</p>
                <p style="margin:0;">We look forward to seeing you today!<br />- The summerlunch+ Team</p>
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
