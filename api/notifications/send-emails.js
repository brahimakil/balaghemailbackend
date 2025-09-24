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
      environment: {
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
        SUPPORT_EMAIL: !!process.env.SUPPORT_EMAIL,
        SUPPORT_EMAIL_PASSWORD: !!process.env.SUPPORT_EMAIL_PASSWORD
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Starting POST processing...');
    
    // Check environment variables
    const requiredEnvVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL', 
      'FIREBASE_PRIVATE_KEY',
      'SUPPORT_EMAIL',
      'SUPPORT_EMAIL_PASSWORD'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return res.status(500).json({ 
        error: 'Server configuration error', 
        details: `Missing environment variables: ${missingVars.join(', ')}`
      });
    }

    console.log('✅ All environment variables present');

    // Load modules inside the function to avoid initialization issues
    let admin, emailService, notificationEmailService, db;
    
    try {
      console.log('📦 Loading Firebase Admin...');
      admin = require('firebase-admin');
      
      // Initialize Firebase if not already done
      if (admin.apps.length === 0) {
        console.log('🔥 Initializing Firebase...');
        
        const serviceAccount = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
        
        console.log('✅ Firebase initialized');
      } else {
        console.log('✅ Firebase already initialized');
      }
      
      db = admin.firestore();
      console.log('✅ Firestore connected');

    } catch (firebaseError) {
      console.error('❌ Firebase setup failed:', firebaseError);
      return res.status(500).json({ 
        error: 'Firebase initialization failed', 
        details: firebaseError.message 
      });
    }

    try {
      console.log('📧 Loading email services...');
      const EmailService = require('../../services/emailService');
      const NotificationEmailService = require('../../services/notificationEmailService');
      
      emailService = new EmailService();
      notificationEmailService = new NotificationEmailService(emailService);
      console.log('✅ Email services loaded');
      
    } catch (emailError) {
      console.error('❌ Email service setup failed:', emailError);
      return res.status(500).json({ 
        error: 'Email service initialization failed', 
        details: emailError.message 
      });
    }

    // Validate request body
    const { notification, recipients } = req.body;
    
    if (!notification) {
      return res.status(400).json({ error: 'Notification data is required' });
    }

    if (!recipients || recipients.length === 0) {
      return res.status(200).json({ success: true, message: 'No recipients to send to' });
    }
    
    if (!notification?.performedBy) {
      return res.status(400).json({ error: 'performedBy email is required' });
    }

    console.log('✅ Request validation passed');

    // Lookup sender
    console.log('🔍 Looking up sender...');
    const senderSnapshot = await db.collection('users')
      .where('email', '==', notification.performedBy)
      .get();

    if (senderSnapshot.empty) {
      return res.status(400).json({ error: 'Sender not found' });
    }

    const senderData = senderSnapshot.docs[0].data();
    const senderRole = senderData.role;
    const senderVillageId = senderData.assignedVillageId;

    // Apply access control policy
    let allowedRecipients = [];
    if (senderRole === 'secondary' && senderVillageId) {
      const villageEditorsSnapshot = await db.collection('users')
        .where('role', '==', 'village_editor')
        .where('assignedVillageId', '==', senderVillageId)
        .get();
      const allowedEmails = villageEditorsSnapshot.docs.map(d => d.data().email);
      allowedRecipients = recipients.filter(e => allowedEmails.includes(e));
    } else if (senderRole === 'village_editor' && senderVillageId) {
      const secondaryAdminsSnapshot = await db.collection('users')
        .where('role', '==', 'secondary')
        .where('assignedVillageId', '==', senderVillageId)
        .get();
      const allowedEmails = secondaryAdminsSnapshot.docs.map(d => d.data().email);
      allowedRecipients = recipients.filter(e => allowedEmails.includes(e));
    } else {
      allowedRecipients = [];
    }

    if (allowedRecipients.length === 0) {
      return res.status(200).json({ success: true, message: 'No allowed recipients after filtering' });
    }

    // Send emails
    console.log('📧 Sending notification emails...');
    await notificationEmailService.sendNotificationEmails({
      ...notification,
      notificationId: req.body.notificationId || 'unknown'
    }, allowedRecipients);

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
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
