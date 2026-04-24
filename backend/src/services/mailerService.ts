/**
 * Unified mail sender.
 *
 * Routing priority:
 *   - If `preferred === 'outlook'` → Outlook (fail if not connected).
 *   - If `preferred === 'gmail'`   → Gmail (fail if user has no token).
 *   - 'auto' (default):
 *       1. Use a shared Outlook mailbox if one is connected.
 *       2. Otherwise fall back to the sending user's Gmail OAuth.
 */

import { sendEmailViaGmail, hasGmailConnection, GmailNotConnectedError } from './gmailService';
import { sendEmailViaOutlook, hasOutlookMailbox, OutlookNotConnectedError } from './outlookService';

export type MailProvider = 'auto' | 'outlook' | 'gmail';

export interface SendOpts {
  to: string;
  subject: string;
  html: string;
  /** User to send on behalf of (Gmail path) */
  senderUserId?: string;
  /** Which provider to use ('auto' by default) */
  provider?: MailProvider;
}

export async function sendEmail(opts: SendOpts): Promise<{ provider: 'outlook' | 'gmail' }> {
  const provider = opts.provider ?? 'auto';

  if (provider === 'outlook') {
    await sendEmailViaOutlook(opts.to, opts.subject, opts.html);
    return { provider: 'outlook' };
  }

  if (provider === 'gmail') {
    if (!opts.senderUserId) throw new Error('senderUserId is required for Gmail send');
    await sendEmailViaGmail(opts.senderUserId, opts.to, opts.subject, opts.html);
    return { provider: 'gmail' };
  }

  // auto: try Outlook first (shared mailbox), then Gmail
  if (await hasOutlookMailbox()) {
    try {
      await sendEmailViaOutlook(opts.to, opts.subject, opts.html);
      return { provider: 'outlook' };
    } catch (err) {
      // Fall through to Gmail if Outlook errors and we have a Gmail sender
      if (!opts.senderUserId) throw err;
      if (!(await hasGmailConnection(opts.senderUserId))) throw err;
    }
  }

  if (!opts.senderUserId) {
    throw new OutlookNotConnectedError(
      'No mailbox available: Outlook is not connected and no Gmail sender was provided.',
    );
  }
  try {
    await sendEmailViaGmail(opts.senderUserId, opts.to, opts.subject, opts.html);
    return { provider: 'gmail' };
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      throw new Error('No mailbox available: connect Outlook in Settings, or connect Gmail from your profile.');
    }
    throw err;
  }
}

/** Exposed for status UI. */
export async function getMailerStatus(senderUserId?: string) {
  const outlook = await hasOutlookMailbox();
  const gmail = senderUserId ? await hasGmailConnection(senderUserId) : false;
  return { outlook, gmail };
}
