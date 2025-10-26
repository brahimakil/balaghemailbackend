class NotificationEmailService {
  constructor(emailService) {
    this.emailService = emailService;
  }

  async sendNotificationEmails(notification, recipients) {
    if (!recipients || recipients.length === 0) {
      console.log('✉️ No recipients specified for notification emails');
      return;
    }

    console.log('🔔 Processing notification for email automation:', {
      action: notification.action,
      entityType: notification.entityType,
      entityId: notification.entityId,
      entityName: notification.entityName,
      performedBy: notification.performedBy,
      performedByName: notification.performedByName,
      details: notification.details,
      timestamp: notification.timestamp
    });

    // Generate email content
    const subject = this.generateEmailSubject(notification);
    const htmlContent = this.generateEmailContent(notification);

    try {
      // Send emails to all recipients
      const results = await this.emailService.sendBulkEmails(recipients, subject, htmlContent);
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`📧 Email notification results: ${successful} successful, ${failed} failed`);
      
      if (failed > 0) {
        const failedEmails = results.filter(r => !r.success).map(r => r.email);
        console.warn('⚠️ Failed to send emails to:', failedEmails);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error sending notification emails:', error);
      throw error;
    }
  }

  generateEmailSubject(notification) {
    const actionText = {
      created: 'إنشاء',
      updated: 'تعديل', 
      deleted: 'حذف',
      approved: 'موافقة',
      rejected: 'رفض'
    }[notification.action] || notification.action;

    const entityText = {
      martyrs: 'شهيد',
      locations: 'موقع',
      legends: 'أسطورة',
      activities: 'نشاط',
      activityTypes: 'نوع نشاط',
      news: 'خبر',
      liveNews: 'خبر مباشر',
      admins: 'مدير',
      sectors: 'قطاع'
    }[notification.entityType] || notification.entityType;

    return `بلاغ - ${actionText} ${entityText}: ${notification.entityName}`;
  }

  generateEmailContent(notification) {
    const actionText = {
      created: 'تم إنشاء',
      updated: 'تم تعديل',
      deleted: 'تم حذف',
      approved: 'تم الموافقة على',
      rejected: 'تم رفض'
    }[notification.action] || `تم ${notification.action}`;

    const entityText = {
      martyrs: 'الشهيد',
      locations: 'الموقع',
      legends: 'الأسطورة',
      activities: 'النشاط',
      activityTypes: 'نوع النشاط',
      news: 'الخبر',
      liveNews: 'الخبر المباشر',
      admins: 'المدير',
      sectors: 'القطاع'
    }[notification.entityType] || notification.entityType;

    const timestamp = new Date(notification.timestamp).toLocaleString('ar-EG', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // ✅ Determine admin panel URL based on entity type
    const adminPanelUrl = process.env.ADMIN_PANEL_URL || 'https://balagh-admin.vercel.app';
    let actionButtonUrl = adminPanelUrl;
    let actionButtonText = 'انتقل إلى لوحة التحكم';
    
    // Set specific page based on entity type
    if (notification.entityType === 'activities') {
      actionButtonUrl = `${adminPanelUrl}/activities`;
      actionButtonText = 'إدارة الأنشطة';
    } else if (notification.entityType === 'martyrs') {
      actionButtonUrl = `${adminPanelUrl}/martyrs`;
      actionButtonText = 'إدارة الشهداء';
    } else if (notification.entityType === 'locations') {
      actionButtonUrl = `${adminPanelUrl}/locations`;
      actionButtonText = 'إدارة المواقع';
    } else if (notification.entityType === 'news') {
      actionButtonUrl = `${adminPanelUrl}/news`;
      actionButtonText = 'إدارة الأخبار';
    }

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إشعار من بلاغ</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; direction: rtl;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🔔 إشعار من بلاغ</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">نظام إدارة المحتوى</p>
          </div>

          <!-- Content -->
          <div style="padding: 30px;">
            <div style="background-color: #f8fafc; border-right: 4px solid #3b82f6; padding: 20px; margin-bottom: 25px; border-radius: 0 8px 8px 0;">
              <h2 style="margin: 0 0 15px 0; color: #1e40af; font-size: 20px;">
                ${actionText} ${entityText}
              </h2>
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #374151;">
                ${notification.entityName}
              </p>
            </div>

            <div style="margin-bottom: 25px;">
              <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                📋 تفاصيل العملية
              </h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-weight: bold; width: 30%;">المُنفِذ:</td>
                  <td style="padding: 8px 0; color: #374151;">${notification.performedByName || 'غير محدد'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">البريد الإلكتروني:</td>
                  <td style="padding: 8px 0; color: #374151;">${notification.performedBy}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">التاريخ والوقت:</td>
                  <td style="padding: 8px 0; color: #374151;">${timestamp}</td>
                </tr>
                ${notification.details ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-weight: bold; vertical-align: top;">تفاصيل إضافية:</td>
                  <td style="padding: 8px 0; color: #374151;">${notification.details}</td>
                </tr>
                ` : ''}
              </table>
            </div>

            <!-- ✅ NEW: Take Action Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionButtonUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.2s;">
                 🚀 ${actionButtonText}
              </a>
              <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px;">
                انقر على الزر أعلاه للانتقال مباشرة إلى لوحة التحكم
              </p>
            </div>

            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-top: 25px;">
              <p style="margin: 0; color: #92400e; font-size: 14px; text-align: center;">
                📧 هذا إشعار تلقائي من نظام بلاغ لإدارة المحتوى
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
  }
}

module.exports = NotificationEmailService;