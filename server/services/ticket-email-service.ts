import nodemailer from 'nodemailer';

// Email service configuration
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

interface TicketEmailData {
  ticketId: string;
  ticketSubject: string;
  ticketType: string;
  playerName: string;
  playerEmail: string;
  replyContent: string;
  replyAuthor: string;
  isStaffReply: boolean;
  serverName?: string;
  serverDisplayName?: string;
}

class TicketEmailService {
  async sendTicketReplyNotification(data: TicketEmailData): Promise<void> {
    try {
      const domain = process.env.DOMAIN || 'modl.gg';
      const ticketUrl = `https://${data.serverName || 'app'}.${domain}/ticket/${data.ticketId}`;
      const displayName = data.serverDisplayName || 'modl';
      const fromAddress = `"${displayName}" <noreply@${domain}>`;
      
      const subject = `Reply to Your ${data.ticketType} Ticket #${data.ticketId}`;
      
      const textContent = this.generateTextEmail(data, ticketUrl, displayName);
      const htmlContent = this.generateHtmlEmail(data, ticketUrl, displayName);

      const mailOptions = {
        from: fromAddress,
        to: data.playerEmail,
        subject: subject,
        text: textContent,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[Ticket Email] Notification sent to ${data.playerEmail} for ticket ${data.ticketId}`);
    } catch (error) {
      console.error(`[Ticket Email] Failed to send notification for ticket ${data.ticketId}:`, error);
      throw error;
    }
  }

  private generateTextEmail(data: TicketEmailData, ticketUrl: string, displayName: string): string {
    return `Hello ${data.playerName},

${data.isStaffReply ? 'A staff member' : 'Someone'} has replied to your ${data.ticketType} ticket #${data.ticketId}: "${data.ticketSubject}"

Reply from ${data.replyAuthor}:
${data.replyContent}

You can view the full conversation and reply at: ${ticketUrl}

Thank you,
The ${displayName} Team

---
This is an automated message. Please do not reply to this email.`;
  }

  private generateHtmlEmail(data: TicketEmailData, ticketUrl: string, displayName: string): string {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-bottom: 20px;">Ticket Reply Notification</h2>
        
        <p style="color: #555; font-size: 16px;">Hello <strong>${data.playerName}</strong>,</p>
        
        <p style="color: #555; font-size: 16px;">
          ${data.isStaffReply ? 'A staff member' : 'Someone'} has replied to your <strong>${data.ticketType}</strong> ticket:
        </p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0;">
          <h4 style="margin: 0 0 10px 0; color: #333;">Ticket #${data.ticketId}: ${data.ticketSubject}</h4>
        </div>
        
        <div style="background-color: #fff; border: 1px solid #e9ecef; border-radius: 4px; padding: 15px; margin: 20px 0;">
          <h5 style="margin: 0 0 10px 0; color: #495057;">Reply from ${data.replyAuthor}:</h5>
          <p style="margin: 0; color: #333; white-space: pre-wrap;">${data.replyContent}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${ticketUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">View Ticket & Reply</a>
        </div>
        
        <div style="border-top: 1px solid #e9ecef; padding-top: 20px; margin-top: 30px;">
          <p style="color: #6c757d; font-size: 14px; margin: 0;">
            Thank you,<br>
            <strong>The ${displayName} Team</strong>
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
      console.log('[Ticket Email] SMTP configuration verified successfully');
      return true;
    } catch (error) {
      console.error('[Ticket Email] SMTP configuration failed:', error);
      return false;
    }
  }
}

export default TicketEmailService;