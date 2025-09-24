const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      const supportEmail = process.env.SUPPORT_EMAIL;
      const supportPassword = process.env.SUPPORT_EMAIL_PASSWORD;

      if (!supportEmail || !supportPassword) {
        console.error('❌ Missing email credentials in environment variables');
        return;
      }

      console.log('📧 Configuring email transporter...');
      console.log(`- SUPPORT_EMAIL: ${supportEmail}`);
      console.log(`- Email length: ${supportEmail.length}`);
      console.log(`- Password length: ${supportPassword.length}`);

      this.transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: supportEmail,
          pass: supportPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      console.log('✅ Email transporter configured successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
      this.transporter = null;
    }
  }

  async sendEmail(to, subject, htmlContent) {
    if (!this.transporter) {
      console.error('❌ Email transporter not initialized');
      throw new Error('Email service not available');
    }

    try {
      const mailOptions = {
        from: process.env.SUPPORT_EMAIL,
        to: to,
        subject: subject,
        html: htmlContent
      };

      console.log(`📤 Sending email to: ${to}`);
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully: ${result.messageId}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  async sendBulkEmails(recipients, subject, htmlContent) {
    if (!this.transporter) {
      console.error('❌ Email transporter not initialized');
      throw new Error('Email service not available');
    }

    console.log(`📬 Sending ${recipients.length} notification emails...`);
    const results = [];

    for (let i = 0; i < recipients.length; i++) {
      try {
        console.log(`📧 Sending email ${i + 1}/${recipients.length}...`);
        const result = await this.sendEmail(recipients[i], subject, htmlContent);
        results.push({ email: recipients[i], success: true, messageId: result.messageId });
        
        // Small delay between emails to avoid rate limiting
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Failed to send email to ${recipients[i]}:`, error);
        results.push({ email: recipients[i], success: false, error: error.message });
      }
    }

    return results;
  }
}

module.exports = EmailService;