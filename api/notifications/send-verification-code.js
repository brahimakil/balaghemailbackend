const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Generate 6-digit code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = async (req, res) => {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, userName } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    console.log('📧 Sending verification code to:', email);
    console.log('🔢 Code:', verificationCode);

    // Setup email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    // Email content
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>رمز التحقق - بلاغ</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; direction: rtl;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🔐 رمز التحقق</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">نظام بلاغ الإداري</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <p style="color: #374151; font-size: 16px; margin: 0 0 10px 0;">
                مرحباً ${userName || 'بك'},
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                لقد تلقينا طلب تسجيل دخول إلى حسابك الإداري
              </p>
            </div>

            <!-- Verification Code Box -->
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #3b82f6; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
              <p style="color: #1e40af; font-size: 14px; margin: 0 0 15px 0; font-weight: bold;">
                رمز التحقق الخاص بك:
              </p>
              <div style="background: white; border-radius: 8px; padding: 20px; display: inline-block;">
                <span style="font-size: 36px; font-weight: bold; color: #1e3a8a; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  ${verificationCode}
                </span>
              </div>
              <p style="color: #6b7280; font-size: 12px; margin: 15px 0 0 0;">
                ⏰ ينتهي هذا الرمز خلال 5 دقائق
              </p>
            </div>

            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-top: 25px;">
              <p style="margin: 0; color: #92400e; font-size: 14px; text-align: center;">
                ⚠️ إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة
              </p>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0;">
                <strong>نصيحة أمنية:</strong> لا تشارك هذا الرمز مع أي شخص.<br>
                فريق بلاغ لن يطلب منك هذا الرمز أبداً.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              © 2024 بلاغ - نظام إدارة المحتوى<br>
              هذا البريد الإلكتروني تم إرساله تلقائياً، يرجى عدم الرد عليه
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    await transporter.sendMail({
      from: `"بلاغ - نظام الإدارة" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `رمز التحقق: ${verificationCode} - بلاغ`,
      html: htmlContent
    });

    console.log('✅ Verification code email sent successfully');

    return res.status(200).json({
      success: true,
      message: 'Verification code sent',
      code: verificationCode, // Return code to store in Firestore
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

  } catch (error) {
    console.error('❌ Error sending verification code:', error);
    return res.status(500).json({
      error: 'Failed to send verification code',
      details: error.message
    });
  }
};
