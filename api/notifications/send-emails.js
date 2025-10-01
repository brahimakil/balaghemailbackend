const https = require('https');
const crypto = require('crypto');
const tls = require('tls');
const net = require('net');

module.exports = async (req, res) => {
  console.log('🚀 Function invoked:', req.method);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Health check endpoint
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'Gmail Backend API is running!', 
      timestamp: new Date().toISOString(),
      approach: 'Direct SMTP - No external dependencies'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Processing POST request...');
    
    const { notification, recipients } = req.body || {};
    
    if (!notification || !recipients) {
      return res.status(400).json({ 
        error: 'Missing notification or recipients',
        received: { notification: !!notification, recipients: !!recipients }
      });
    }

    console.log('✅ Request validation passed');
    console.log('📧 Recipients:', recipients);
    console.log('👤 Performed by:', notification.performedBy);

    // Get Firebase access token for Firestore queries
    const accessToken = await getFirebaseAccessToken();
    console.log('🔑 Firebase access token obtained');

    // Query Firestore directly via REST API
    const senderData = await queryFirestore(accessToken, 'users', 'email', notification.performedBy);
    
    if (!senderData || senderData.length === 0) {
      return res.status(400).json({ error: 'Sender not found' });
    }

    const sender = senderData[0];
    const senderRole = sender.role;
    const senderVillageId = sender.assignedVillageId;
    
    console.log('👤 Sender details:', { role: senderRole, villageId: senderVillageId });

    // Apply access control and find allowed recipients
    let allowedRecipients = [];
    
    if (senderRole === 'secondary' && senderVillageId) {
      console.log('📋 Secondary admin - finding village editors...');
      const villageEditors = await queryFirestore(accessToken, 'users', 'role', 'village_editor', 'assignedVillageId', senderVillageId);
      const allowedEmails = villageEditors.map(user => user.email);
      allowedRecipients = recipients.filter(e => allowedEmails.includes(e));
      
    } else if (senderRole === 'village_editor' && senderVillageId) {
      console.log('📋 Village editor - finding secondary admins...');
      const secondaryAdmins = await queryFirestore(accessToken, 'users', 'role', 'secondary', 'assignedVillageId', senderVillageId);
      const allowedEmails = secondaryAdmins.map(user => user.email);
      allowedRecipients = recipients.filter(e => allowedEmails.includes(e));
      
    } else {
      console.log('❌ No permission for role:', senderRole);
      allowedRecipients = [];
    }

    if (allowedRecipients.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No allowed recipients after filtering',
        debug: { senderRole, senderVillageId, originalRecipients: recipients }
      });
    }

    console.log('📧 Sending emails to:', allowedRecipients);

    // Send emails using SMTP
    const emailResults = await sendEmailsViaSMTP(notification, allowedRecipients);

    console.log('✅ Email sending completed');
    console.log('📧 Email results:', emailResults);
    
    return res.status(200).json({
      success: true,
      message: `Email sending completed`,
      recipients: allowedRecipients,
      emailResults: emailResults
    });
    
  } catch (err) {
    console.error('❌ Function error:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Failed to send email notifications',
      details: err.message
    });
  }
};

// Send emails using SMTP (Gmail)
async function sendEmailsViaSMTP(notification, recipients) {
  console.log('📧 Starting SMTP email sending...');
  console.log('📧 SMTP Config check:', {
    email: process.env.SUPPORT_EMAIL,
    passwordLength: process.env.SUPPORT_EMAIL_PASSWORD ? process.env.SUPPORT_EMAIL_PASSWORD.length : 0
  });
  
  const results = [];
  const subject = generateEmailSubject(notification);
  const htmlContent = generateEmailContent(notification);
  
  for (const recipient of recipients) {
    try {
      console.log(`📧 Sending SMTP email to: ${recipient}`);
      await sendSMTPEmail(recipient, subject, htmlContent);
      console.log(`✅ SMTP email sent successfully to: ${recipient}`);
      results.push({ recipient, success: true });
    } catch (error) {
      console.error(`❌ SMTP email failed for ${recipient}:`, error.message);
      results.push({ recipient, success: false, error: error.message });
    }
  }
  
  return results;
}

// Send single email via SMTP
async function sendSMTPEmail(to, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    console.log(`📧 Connecting to Gmail SMTP for ${to}...`);
    
    const socket = tls.connect(465, 'smtp.gmail.com', () => {
      console.log(`📧 TLS connection established for ${to}`);
      
      let step = 0;
      let buffer = '';
      
      const sendCommand = (command) => {
        console.log(`📧 SMTP Command for ${to}:`, command.replace(process.env.SUPPORT_EMAIL_PASSWORD, '***'));
        socket.write(command + '\r\n');
      };
      
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          console.log(`📧 SMTP Response for ${to}:`, line);
          
          if (step === 0 && line.startsWith('220')) {
            step = 1;
            sendCommand('EHLO localhost');
          } else if (step === 1 && line.startsWith('250')) {
            step = 2;
            sendCommand('AUTH LOGIN');
          } else if (step === 2 && line.startsWith('334')) {
            step = 3;
            const emailB64 = Buffer.from(process.env.SUPPORT_EMAIL).toString('base64');
            sendCommand(emailB64);
          } else if (step === 3 && line.startsWith('334')) {
            step = 4;
            const passwordB64 = Buffer.from(process.env.SUPPORT_EMAIL_PASSWORD).toString('base64');
            sendCommand(passwordB64);
          } else if (step === 4 && line.startsWith('235')) {
            step = 5;
            sendCommand(`MAIL FROM:<${process.env.SUPPORT_EMAIL}>`);
          } else if (step === 5 && line.startsWith('250')) {
            step = 6;
            sendCommand(`RCPT TO:<${to}>`);
          } else if (step === 6 && line.startsWith('250')) {
            step = 7;
            sendCommand('DATA');
          } else if (step === 7 && line.startsWith('354')) {
            step = 8;
            const emailContent = [
              `From: ${process.env.SUPPORT_EMAIL}`,
              `To: ${to}`,
              `Subject: ${subject}`,
              'Content-Type: text/html; charset=utf-8',
              'MIME-Version: 1.0',
              '',
              htmlContent,
              '.'
            ].join('\r\n');
            sendCommand(emailContent);
          } else if (step === 8 && line.startsWith('250')) {
            sendCommand('QUIT');
            console.log(`✅ Email sent successfully to ${to} via SMTP`);
            socket.end();
            resolve();
          } else if (line.startsWith('5')) {
            console.error(`❌ SMTP error for ${to}:`, line);
            socket.end();
            reject(new Error(`SMTP error: ${line}`));
          }
        }
        
        buffer = lines[lines.length - 1];
      });
      
      socket.on('error', (error) => {
        console.error(`❌ SMTP connection error for ${to}:`, error);
        reject(error);
      });
      
      socket.on('close', () => {
        console.log(`📧 SMTP connection closed for ${to}`);
      });
    });
    
    socket.on('error', (error) => {
      console.error(`❌ TLS connection error for ${to}:`, error);
      reject(error);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      socket.destroy();
      reject(new Error(`SMTP timeout for ${to}`));
    }, 30000);
  });
}

// Create JWT manually using built-in crypto module
function createJWT(payload, privateKey) {
  // JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Base64URL encode
  const base64urlEncode = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);
  
  // Create signature
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(data), privateKey);
  const encodedSignature = signature.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${data}.${encodedSignature}`;
}

// Get Firebase access token (only for Firestore queries)
async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const token = createJWT(payload, process.env.FIREBASE_PRIVATE_KEY);
  
  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`;
    
    const options = {
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('No access token received'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Query Firestore using REST API
async function queryFirestore(accessToken, collection, field1, value1, field2, value2) {
  return new Promise((resolve, reject) => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    
    let query = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field1 },
            op: 'EQUAL',
            value: { stringValue: value1 }
          }
        }
      }
    };

    if (field2 && value2) {
      query.structuredQuery.where = {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: field1 },
                op: 'EQUAL',
                value: { stringValue: value1 }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: field2 },
                op: 'EQUAL',
                value: { stringValue: value2 }
              }
            }
          ]
        }
      };
    }

    const postData = JSON.stringify(query);
    
    const options = {
      hostname: 'firestore.googleapis.com',
      port: 443,
      path: `/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const results = [];
          
          if (response && Array.isArray(response)) {
            response.forEach(item => {
              if (item.document && item.document.fields) {
                const doc = {};
                Object.keys(item.document.fields).forEach(key => {
                  const field = item.document.fields[key];
                  doc[key] = field.stringValue || field.integerValue || field.booleanValue || field.nullValue;
                });
                results.push(doc);
              }
            });
          }
          
          resolve(results);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function generateEmailSubject(notification) {
  const actionText = {
    created: 'إنشاء',
    updated: 'تعديل', 
    deleted: 'حذف'
  }[notification.action] || notification.action;

  const entityText = {
    activities: 'نشاط'
  }[notification.entityType] || notification.entityType;

  return `بلاغ - ${actionText} ${entityText}: ${notification.entityName}`;
}

function generateEmailContent(notification) {
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
