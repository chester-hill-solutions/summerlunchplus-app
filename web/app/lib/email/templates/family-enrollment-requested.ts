const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export type FamilyEnrollmentRequestedTemplateData = {
  actorName: string
  actorEmail: string
  workshopName: string
}

export const renderFamilyEnrollmentRequestedEmail = ({
  actorName,
  actorEmail,
  workshopName,
}: FamilyEnrollmentRequestedTemplateData) => {
  const safeActorName = escapeHtml(actorName)
  const safeActorEmail = escapeHtml(actorEmail)
  const safeWorkshopName = escapeHtml(workshopName)

  return {
    subject: "We've received your summerlunch+ registration!",
    text: `Hi,

Thank you for registering for summerlunch+! We're excited to welcome your family this summer.

Your registration has been received and is currently pending approval. Our team will review your information and send you a confirmation email shortly with your program details, class schedule, and next steps.

While you wait, we encourage you to invite additional family members to join your profile.

As a reminder, to help maintain a safe and engaging class environment, all participants must be supervised by a parent or guardian during classes and are expected to keep their cameras on throughout the session.

Registration details:
- Registered by: ${actorName} (${actorEmail})
- Workshop: ${workshopName}

If you have any questions in the meantime, feel free to email us at hello@summerlunchplus.com.

We're looking forward to cooking with you soon!

- The summerlunch+ Team`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:24px;background-color:#ffffff;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eb1970;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                <img src="https://cdn.summerlunchplus.com/summerlunch%2B.png" alt="SummerLunch Plus" width="180" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px 24px;font-family:Arial,sans-serif;font-size:16px;line-height:24px;">
                <p style="margin:0 0 16px 0;">Hi,</p>
                <p style="margin:0 0 16px 0;">Thank you for registering for <span style="color:#eb1970;">summerlunch+</span>! We're excited to welcome your family this summer.</p>
                <p style="margin:0 0 16px 0;">Your registration has been received and is currently pending approval. Our team will review your information and send you a confirmation email shortly with your program details, class schedule, and next steps.</p>
                <p style="margin:0 0 16px 0;">While you wait, we encourage you to invite additional family members to join your profile.</p>
                <p style="margin:0 0 16px 0;">As a reminder, to help maintain a safe and engaging class environment, all participants must be supervised by a parent or guardian during classes and are expected to keep their cameras on throughout the session.</p>
                <p style="margin:0 0 8px 0;"><strong>Registration details:</strong></p>
                <p style="margin:0 0 4px 0;">Registered by: ${safeActorName} (${safeActorEmail})</p>
                <p style="margin:0 0 16px 0;">Workshop: ${safeWorkshopName}</p>
                <p style="margin:0 0 16px 0;">If you have any questions in the meantime, feel free to email us at <a href="mailto:hello@summerlunchplus.com" style="color:#eb1970;text-decoration:underline;">hello@summerlunchplus.com</a>.</p>
                <p style="margin:0 0 16px 0;">We're looking forward to cooking with you soon!</p>
                <p style="margin:0;color:#eb1970;"><strong>- The <span style="color:#eb1970;">summerlunch+</span> Team</strong></p>
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
