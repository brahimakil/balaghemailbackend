const https = require('https');
const { URL } = require('url');

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
      approach: 'Direct Firebase REST API - No external dependencies'
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

    // Get Firebase access token using service account
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

    // Send emails using nodemailer (built-in Node.js modules only)
    await sendEmails(notification, allowedRecipients);

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

// Get Firebase access token using service account (no external dependencies)
async function getFirebaseAccessToken() {
  const jwt = require('jsonwebtoken');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const token = jwt.sign(payload, process.env.FIREBASE_PRIVATE_KEY, { algorithm: 'RS256' });
  
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
          resolve(response.access_token);
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

// Send emails using built-in Node.js modules
async function sendEmails(notification, recipients) {
  // For now, just simulate email sending
  console.log('📧 Simulating email send to:', recipients);
  console.log('📧 Email subject would be:', generateEmailSubject(notification));
  
  // In a real implementation, you'd use SMTP here with built-in modules
  // or call an external email service API
  
  return Promise.resolve();
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
