const https = require('https');
const crypto = require('crypto');

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
      approach: 'Zero dependencies - Built-in modules only'
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

    // Get Firebase access token using service account (built-in crypto only)
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

    // Send emails using Gmail API
    await sendEmails(accessToken, notification, allowedRecipients);

    console.log('✅ Email notifications sent successfully');
    return res.status(200).json({
      success: true,
      message: `Email notifications sent to ${allowedRecipients.length} recipients`,
      recipients: allowedRecipients
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

// Get access token with Gmail permissions
async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  console.log('🔑 Creating JWT with payload:', payload);

  const token = createJWT(payload, process.env.FIREBASE_PRIVATE_KEY);
  
  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`;
    
    console.log('🔑 Requesting access token from Google...');
    
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
        console.log('🔑 Google OAuth response status:', res.statusCode);
        console.log('🔑 Google OAuth response:', data);
        
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            console.log('✅ Access token obtained successfully');
            resolve(response.access_token);
          } else {
            console.error('❌ No access token in response:', response);
            reject(new Error('No access token received: ' + JSON.stringify(response)));
          }
        } catch (e) {
          console.error('❌ Failed to parse OAuth response:', e);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ OAuth request error:', error);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Query Firestore using REST API (no external dependencies)
async function queryFirestore(accessToken, collection, field1, value1, field2, value2) {
  return new Promise((resolve, reject) => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    
    // Build query
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

    // Add second condition if provided
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

// Send emails using Gmail API
async function sendEmails(accessToken, notification, recipients) {
  console.log('📧 Preparing to send emails...');
  console.log('📧 Recipients to send to:', recipients);
  console.log('📧 Using access token:', accessToken ? 'Present' : 'Missing');
  
  const subject = generateEmailSubject(notification);
  const htmlContent = generateEmailContent(notification);
  
  console.log('📧 Email subject:', subject);
  console.log('📧 From email:', process.env.SUPPORT_EMAIL);
  
  const results = [];
  
  for (const recipient of recipients) {
    try {
      console.log(`📧 Attempting to send email to: ${recipient}`);
      await sendSingleEmail(accessToken, recipient, subject, htmlContent);
      console.log(`✅ Email sent successfully to: ${recipient}`);
      results.push({ recipient, success: true });
    } catch (error) {
      console.error(`❌ Failed to send email to ${recipient}:`, error.message);
      console.error(`❌ Full error for ${recipient}:`, error);
      results.push({ recipient, success: false, error: error.message });
    }
  }
  
  console.log('📧 Email sending results:', results);
  return results;
}

async function sendSingleEmail(accessToken, to, subject, htmlContent) {
  console.log(`📧 Sending single email to: ${to}`);
  
  return new Promise((resolve, reject) => {
    const email = [
      `From: ${process.env.SUPPORT_EMAIL}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      htmlContent
    ].join('\r\n');

    console.log(`📧 Email content preview for ${to}:`, email.substring(0, 200) + '...');

    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const postData = JSON.stringify({
      raw: encodedEmail
    });

    console.log(`📧 Making Gmail API request for ${to}...`);

    const options = {
      hostname: 'gmail.googleapis.com',
      port: 443,
      path: '/gmail/v1/users/me/messages/send',
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
        console.log(`📧 Gmail API response for ${to} - Status: ${res.statusCode}`);
        console.log(`📧 Gmail API response data for ${to}:`, data);
        
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            console.log(`✅ Gmail API success for ${to}:`, response);
            resolve(response);
          } catch (parseError) {
            console.log(`✅ Gmail API success for ${to} (raw response):`, data);
            resolve(data);
          }
        } else {
          console.error(`❌ Gmail API error for ${to} - Status: ${res.statusCode}`);
          console.error(`❌ Gmail API error data for ${to}:`, data);
          reject(new Error(`Gmail API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request error for ${to}:`, error);
      reject(error);
    });

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
    deleted: 'تم حذف'
  }[notification.action] || `تم ${notification.action}`;

  const entityText = {
    activities: 'النشاط'
  }[notification.entityType] || notification.entityType;

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>إشعار من بلاغ</title>
    </head>
    <body style="font-family: Arial, sans-serif; direction: rtl;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white;">
        <div style="background: #1e3a8a; color: white; padding: 20px; text-align: center;">
          <h1>🔔 إشعار من بلاغ</h1>
        </div>
        <div style="padding: 20px;">
          <h2>${actionText} ${entityText}</h2>
          <p><strong>${notification.entityName}</strong></p>
          <p>المُنفِذ: ${notification.performedByName || 'غير محدد'}</p>
          <p>البريد الإلكتروني: ${notification.performedBy}</p>
          <p>التاريخ: ${new Date(notification.timestamp).toLocaleString('ar-EG')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
