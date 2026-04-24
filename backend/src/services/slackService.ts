/**
 * Slack Incoming Webhook sender.
 * No OAuth — the user pastes a webhook URL into the delivery profile and we post JSON.
 */

export class SlackNotConfiguredError extends Error {
  readonly code = 'SLACK_NOT_CONFIGURED';
  constructor(msg = 'Slack webhook URL is not configured for this profile') {
    super(msg); this.name = 'SlackNotConfiguredError';
  }
}

/**
 * Strips basic HTML so the email-HTML body renders acceptably in Slack.
 * Intentionally dumb — Slack's block kit is out of scope here.
 */
function htmlToSlackText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendToSlack(
  webhookUrl: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    throw new SlackNotConfiguredError('Invalid Slack webhook URL');
  }

  const text = htmlToSlackText(html);
  const payload = {
    text: `*${subject}*\n${text}`.slice(0, 38_000),
    mrkdwn: true,
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }
}
