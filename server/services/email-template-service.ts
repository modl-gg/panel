import nodemailer from 'nodemailer';

// Email service configuration - requires environment variables
const smtpPort = Number(process.env.SMTP_PORT) || 25;
const emailAuth = {
  user: process.env.SMTP_USERNAME,
  pass: process.env.SMTP_PASSWORD
};
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost", // Assuming postfix is running on localhost
  port: smtpPort,
  secure: false, // true for 465, false for other ports
  tls: {
    rejectUnauthorized: false // Allow self-signed certificates
  },
  auth: (emailAuth.user && emailAuth.pass) ? emailAuth : undefined
});

interface EmailData {
  to: string;
  subject: string;
  serverDisplayName: string;
  serverName?: string;
}

interface AuthEmailData extends EmailData {
  code: string;
}

interface InviteEmailData extends EmailData {
  invitationLink: string;
  role: string;
}

class EmailTemplateService {

  async sendAuthVerificationEmail(data: AuthEmailData): Promise<void> {
    const fromAddress = `"${data.serverDisplayName}" <noreply@${process.env.DOMAIN}>`;

    const textContent = this.generateAuthTextEmail(data);
    const htmlContent = this.generateAuthHtmlEmail(data);

    const mailOptions = {
      from: fromAddress,
      to: data.to,
      subject: data.subject,
      text: textContent,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
  }

  async sendStaffInviteEmail(data: InviteEmailData): Promise<void> {
    const fromAddress = `"${data.serverDisplayName}" <noreply@${process.env.DOMAIN}>`;

    const textContent = this.generateInviteTextEmail(data);
    const htmlContent = this.generateInviteHtmlEmail(data);

    const mailOptions = {
      from: fromAddress,
      to: data.to,
      subject: data.subject,
      text: textContent,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
  }

  private generateAuthTextEmail(data: AuthEmailData): string {
    return `Your login verification code for ${data.serverDisplayName} is: ${data.code}

This code will expire in 15 minutes.

Thank you,
The ${data.serverDisplayName} Team

---
This is an automated message. Please do not reply to this email.`;
  }

  private generateAuthHtmlEmail(data: AuthEmailData): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Login Verification Code</h2>
        
        <p style="color: #555; font-size: 16px;">
          Your login verification code for <strong>${data.serverDisplayName}</strong> is:
        </p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0; color: #333; font-size: 24px; letter-spacing: 3px;">${data.code}</h3>
        </div>
        
        <p style="color: #888; font-size: 14px; margin: 20px 0;">
          This code will expire in 15 minutes.
        </p>
        
        <div style="border-top: 1px solid #e9ecef; padding-top: 20px; margin-top: 30px;">
          <p style="color: #6c757d; font-size: 14px; margin: 0;">
            Thank you,<br>
            <strong>The ${data.serverDisplayName} Team</strong>
          </p>
          <p style="color: #6c757d; font-size: 12px; margin: 15px 0 0 0;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    </div>`;
  }

  private generateInviteTextEmail(data: InviteEmailData): string {
    return `You have been invited to join the ${data.serverDisplayName} team as a ${data.role}!

Please accept your invitation by clicking the following link:
${data.invitationLink}

This invitation will expire in 24 hours.

Thank you,
The ${data.serverDisplayName} Team

---
This is an automated message. Please do not reply to this email.`;
  }

  private generateInviteHtmlEmail(data: InviteEmailData): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Team Invitation</h2>
        
        <p style="color: #555; font-size: 16px;">
          You have been invited to join the <strong>${data.serverDisplayName}</strong> team as a <strong>${data.role}</strong>!
        </p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">
          <h4 style="margin: 0 0 10px 0; color: #333;">Welcome to the Team!</h4>
          <p style="margin: 0; color: #555;">Click the button below to accept your invitation and get started.</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.invitationLink}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Accept Invitation</a>
        </div>
        
        <p style="color: #888; font-size: 14px; margin: 20px 0;">
          This invitation will expire in 24 hours.
        </p>
        
        <div style="border-top: 1px solid #e9ecef; padding-top: 20px; margin-top: 30px;">
          <p style="color: #6c757d; font-size: 14px; margin: 0;">
            Thank you,<br>
            <strong>The ${data.serverDisplayName} Team</strong>
          </p>
          <p style="color: #6c757d; font-size: 12px; margin: 15px 0 0 0;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    </div>`;
  }

  async testEmailConfiguration(): Promise<boolean> {
    try {
      await transporter.verify();
      console.log('[Email Template] SMTP configuration verified successfully');
      return true;
    } catch (error) {
      console.error('[Email Template] SMTP configuration failed:', error);
      return false;
    }
  }
}

export default EmailTemplateService;