const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export type PostProgramSurveyTemplateData = {
  recipientName: string
  surveyUrl: string
}

const renderPostProgramSurveyEmail = ({
  recipientName,
  surveyUrl,
  subject,
  paragraphs,
}: PostProgramSurveyTemplateData & {
  subject: string
  paragraphs: string[]
}) => {
  const safeName = escapeHtml(recipientName.trim() || 'there')
  const safeUrl = escapeHtml(surveyUrl)
  const htmlParagraphs = paragraphs.map(paragraph => `<p style="margin:0 0 16px 0;">${escapeHtml(paragraph)}</p>`).join('')

  return {
    subject,
    text: `Hi ${recipientName.trim() || 'there'},\n\n${paragraphs.join('\n\n')}\n\nComplete the survey: ${surveyUrl}\n\nThe summerlunch+ Team`,
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
                <p style="margin:0 0 16px 0;">Hi ${safeName},</p>
                ${htmlParagraphs}
                <p style="margin:0 0 16px 0;"><a href="${safeUrl}">Complete the post-program survey</a></p>
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

export const renderPostProgramSurveyInitialEmail = (data: PostProgramSurveyTemplateData) =>
  renderPostProgramSurveyEmail({
    ...data,
    subject: 'Please complete your summerlunch+ post-program evaluation',
    paragraphs: [
      'Thank you for participating in the summerlunch+ program!',
      'Just as you completed the pre-program questions when you registered, we now have our post-program evaluation for you to complete.',
      'Please take a few minutes to answer the questions and share your experience with us. Your feedback helps us understand the impact of summerlunch+ and improve the program for future families.',
    ],
  })

export const renderPostProgramSurveyReminderEmail = (data: PostProgramSurveyTemplateData) =>
  renderPostProgramSurveyEmail({
    ...data,
    subject: 'Reminder: complete your summerlunch+ post-program evaluation',
    paragraphs: [
      'This is a quick reminder to complete your summerlunch+ post-program evaluation if you have not already done so.',
      'It only takes a few minutes, and your feedback is very important to us.',
    ],
  })

export const renderPostProgramSurveyGiftCardEmail = (data: PostProgramSurveyTemplateData) =>
  renderPostProgramSurveyEmail({
    ...data,
    subject: 'Complete your survey to receive your final grocery gift card',
    paragraphs: [
      'It looks like you have still not completed your summerlunch+ post-program evaluation.',
      'Please complete the survey as soon as possible.',
      'To receive your final Week 8 grocery gift card, you must complete the post-program evaluation.',
    ],
  })
