const nodemailer = require('nodemailer');

/**
 * Configure Nodemailer transport for Gmail SMTP or custom SMTP fallback
 */
const createTransporter = () => {
  // If Gmail specific credentials are provided
  if (process.env.GMAIL_USER && (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS)) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS,
      },
    });
  }

  // Standard SMTP fallback (e.g., Mailtrap, Brevo, or custom SMTP)
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return null;
};

/**
 * Send a modern, branded 6-digit OTP verification email
 */
const sendOtpEmail = async ({ to, name, otp, purpose = 'verification' }) => {
  const transporter = createTransporter();
  const senderEmail = process.env.GMAIL_USER || process.env.EMAIL_FROM || 'noreply@taskmanagerpro.dev';
  const senderName = 'Task Manager Pro Security';

  const titleText = purpose === 'password_reset'
    ? 'Password Reset Verification'
    : 'Verify Your Email Address';

  const actionText = purpose === 'password_reset'
    ? 'Use the 6-digit one-time passcode below to complete your password reset request:'
    : 'Thank you for registering with Task Manager Pro. Please use the 6-digit one-time passcode below to verify your email address:';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; background-color: #060b18; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
          .container { max-width: 560px; margin: 30px auto; background-color: #0d1528; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; }
          .header { padding: 32px 32px 20px; text-align: center; background: linear-gradient(180deg, rgba(245,158,11,0.1) 0%, rgba(13,21,40,0) 100%); }
          .logo { font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
          .badge { display: inline-block; padding: 4px 12px; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); border-radius: 20px; color: #fbbf24; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 8px; }
          .body { padding: 24px 32px 32px; color: #94a3b8; font-size: 14px; line-height: 1.6; }
          .greeting { color: #f1f5f9; font-size: 16px; font-weight: 600; margin-bottom: 12px; }
          .otp-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
          .otp-code { font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #f59e0b; margin: 8px 0; }
          .expiry { font-size: 12px; color: #64748b; margin-top: 4px; }
          .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Task Manager Pro</div>
            <div class="badge">${titleText}</div>
          </div>
          <div class="body">
            <div class="greeting">Hello ${name || 'there'},</div>
            <p>${actionText}</p>
            <div class="otp-card">
              <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8;">Your 6-Digit Passcode</div>
              <div class="otp-code">${otp}</div>
              <div class="expiry">Expires in 10 minutes • Do not share this code with anyone</div>
            </div>
            <p style="font-size: 12px; color: #64748b;">After verifying your email, your account will be reviewed by the workspace administrator for final access approval.</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Task Manager Pro. High-Security Enterprise Workspace.
          </div>
        </div>
      </body>
    </html>
  `;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        subject: `[${otp}] ${titleText} - Task Manager Pro`,
        text: `Your Task Manager Pro verification code is: ${otp}. This code will expire in 10 minutes.`,
        html: htmlContent,
      });
      console.log(`✉️ [Email Service] OTP dispatched successfully to ${to} (Message ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`⚠️ [Email Service] Failed to send email via SMTP:`, error.message);
      console.log(`🔑 [Local Fallback OTP] For ${to}: ${otp}`);
      return { success: false, error: error.message, fallbackOtp: otp };
    }
  } else {
    console.log(`\n======================================================`);
    console.log(`✉️ [DEV EMAIL SIMULATOR]`);
    console.log(`To: ${to}`);
    console.log(`Subject: [${otp}] ${titleText}`);
    console.log(`OTP Code: ${otp}`);
    console.log(`======================================================\n`);
    return { success: true, simulated: true, fallbackOtp: otp };
  }
};

/**
 * Send account decision notification (Approved / Rejected)
 */
const sendApprovalDecisionEmail = async ({ to, name, status, reason = '' }) => {
  const transporter = createTransporter();
  const senderEmail = process.env.GMAIL_USER || process.env.EMAIL_FROM || 'noreply@taskmanagerpro.dev';
  const senderName = 'Task Manager Pro Admin';

  const isApproved = status === 'approved';
  const subject = isApproved
    ? '🎉 Your Task Manager Pro Account Has Been Approved!'
    : 'Account Access Update - Task Manager Pro';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; background-color: #060b18; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 560px; margin: 30px auto; background-color: #0d1528; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; }
          .header { padding: 32px 32px 20px; text-align: center; }
          .logo { font-size: 20px; font-weight: 800; color: #ffffff; }
          .body { padding: 24px 32px 32px; color: #94a3b8; font-size: 14px; line-height: 1.6; }
          .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin: 20px 0; }
          .btn { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #060b18; font-weight: 700; text-decoration: none; border-radius: 10px; margin-top: 16px; }
          .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Task Manager Pro</div>
          </div>
          <div class="body">
            <h2 style="color: ${isApproved ? '#34d399' : '#f87171'}; margin-top: 0;">
              ${isApproved ? 'Workspace Access Approved' : 'Account Registration Declined'}
            </h2>
            <p>Hello <strong>${name || 'there'}</strong>,</p>
            ${
              isApproved
                ? `<p>Great news! The workspace administrator has reviewed and approved your account request. You can now sign in and access the full workspace.</p>
                   <div style="text-align: center;">
                     <a href="http://localhost:5173/login" class="btn">Sign In to Workspace</a>
                   </div>`
                : `<p>The workspace administrator has reviewed your registration request and decided not to grant workspace access at this time.</p>
                   ${reason ? `<div class="card"><strong style="color: #f1f5f9;">Reason:</strong><p style="margin: 6px 0 0 0;">${reason}</p></div>` : ''}
                   <p>If you believe this was an error, please reach out directly to your team lead or system administrator.</p>`
            }
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Task Manager Pro. High-Security Enterprise Workspace.
          </div>
        </div>
      </body>
    </html>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ [Email Service] Decision email (${status}) sent to ${to}`);
    } catch (err) {
      console.error(`⚠️ [Email Service] Decision email delivery failed:`, err.message);
    }
  } else {
    console.log(`✉️ [DEV SIMULATOR] Decision email (${status}) sent to ${to}`);
  }
};

module.exports = { sendOtpEmail, sendApprovalDecisionEmail };
