import { Express, Request, Response } from 'express';
import { sendEmailViaGmail, hasGmailConnection, OAuthRevokedError, GmailNotConnectedError } from '../services/gmailService';

export function setupEmailRoutes(app: Express) {
  // Send an email via the authenticated user's connected Gmail account
  app.post('/api/email/send', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { to, subject, html } = req.body;
      if (!to || !subject || !html) {
        return res.status(400).json({ message: 'to, subject, and html are required' });
      }

      await sendEmailViaGmail(userId, to, subject, html);
      res.json({ message: 'Email sent' });
    } catch (err: any) {
      if (err instanceof OAuthRevokedError) {
        // Gmail access was revoked — degrade gracefully, don't break the session
        return res.status(403).json({
          code: 'GMAIL_REVOKED',
          message: 'Gmail access has been revoked. Please reconnect your Google account in Settings.',
        });
      }
      if (err instanceof GmailNotConnectedError) {
        return res.status(403).json({
          code: 'GMAIL_NOT_CONNECTED',
          message: err.message,
        });
      }
      res.status(500).json({ message: 'Failed to send email' });
    }
  });

  // Legacy alert endpoint — kept for backwards compatibility
  app.post('/api/email/alert', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { to, subject, body } = req.body;
      if (!to || !subject || !body) {
        return res.status(400).json({ message: 'to, subject, body are required' });
      }

      // body may be plain text — wrap in <pre> so it renders correctly as HTML
      const html = `<pre style="font-family:sans-serif;white-space:pre-wrap">${body}</pre>`;
      await sendEmailViaGmail(userId, to, subject, html);
      res.json({ message: 'Alert sent' });
    } catch (err: any) {
      if (err instanceof OAuthRevokedError) {
        return res.status(403).json({
          code: 'GMAIL_REVOKED',
          message: 'Gmail access has been revoked. Please reconnect your Google account in Settings.',
        });
      }
      if (err instanceof GmailNotConnectedError) {
        return res.status(403).json({
          code: 'GMAIL_NOT_CONNECTED',
          message: err.message,
        });
      }
      res.status(500).json({ message: 'Failed to send email' });
    }
  });

  // Status endpoint — lets the frontend know if Gmail is connected
  app.get('/api/email/status', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const connected = await hasGmailConnection(userId);
      res.json({ connected });
    } catch {
      res.json({ connected: false });
    }
  });

  // Legacy test config endpoint
  app.get('/api/email/test', async (req: Request, res: Response) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) {
      return res.json({ connected: false });
    }
    const connected = await hasGmailConnection(userId);
    res.json({ connected });
  });
}
