import nodemailer from 'nodemailer';
import { Sender } from '../types';
import { logger } from '../utils/logger';

interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

/**
 * Send an email via Ethereal SMTP using the sender's credentials.
 * Each sender has their own Ethereal account for realistic inbox simulation.
 */
export async function sendEmail(
  sender: Sender,
  to: string,
  subject: string,
  body: string
): Promise<SendEmailResult> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: sender.ethereal_user,
      pass: sender.ethereal_pass,
    },
  });

  const info = await transporter.sendMail({
    from: `"${sender.name}" <${sender.ethereal_user}>`,
    to,
    subject,
    text: body,
    html: `<div style="font-family: sans-serif; max-width: 600px;">${body.replace(/\n/g, '<br>')}</div>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  logger.info(`Email sent via Ethereal: ${info.messageId} → Preview: ${previewUrl}`);

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

/**
 * Verify SMTP connection is working.
 */
export async function verifySMTPConnection(sender: Sender): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: sender.ethereal_user, pass: sender.ethereal_pass },
    });
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
