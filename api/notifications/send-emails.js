const { initializeFirebase, getFirestore } = require('../../config/firebase');
const EmailService = require('../../services/emailService');
const NotificationEmailService = require('../../services/notificationEmailService');

// Initialize Firebase and services
let firebaseInitialized = false;
let emailService = null;
let notificationEmailService = null;

const initializeServices = () => {
  if (!firebaseInitialized) {
    initializeFirebase();
    firebaseInitialized = true;
  }
  if (!emailService) {
    emailService = new EmailService();
    notificationEmailService = new NotificationEmailService(emailService);
  }
};

module.exports = async (req, res) => {
  // ALWAYS handle OPTIONS preflight FIRST with no async
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin === 'http://localhost:5173' || origin === 'https://balagh-admin.vercel.app') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  // Set CORS for all other responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Add comprehensive error logging
    console.log('🔍 Function started, checking environment...');
    console.log('Environment variables check:', {
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      SUPPORT_EMAIL: !!process.env.SUPPORT_EMAIL,
      SUPPORT_EMAIL_PASSWORD: !!process.env.SUPPORT_EMAIL_PASSWORD
    });

    // Validate environment variables first
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

    // Initialize services with error handling
    try {
      initializeServices();
      console.log('✅ Services initialized successfully');
    } catch (serviceError) {
      console.error('❌ Service initialization failed:', serviceError);
      return res.status(500).json({ 
        error: 'Service initialization failed', 
        details: serviceError.message 
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

    console.log('📋 Request validation passed');

    // Get Firestore with error handling
    let db;
    try {
      db = getFirestore();
      console.log('✅ Firestore connection established');
    } catch (firestoreError) {
      console.error('❌ Firestore connection failed:', firestoreError);
      return res.status(500).json({ 
        error: 'Database connection failed', 
        details: firestoreError.message 
      });
    }

    // Lookup sender
    const senderSnapshot = await db.collection('users')
      .where('email', '==', notification.performedBy)
      .get();

    if (senderSnapshot.empty) {
      return res.status(400).json({ error: 'Sender not found' });
    }

    const senderData = senderSnapshot.docs[0].data();
    const senderRole = senderData.role;
    const senderVillageId = senderData.assignedVillageId;

    // Strict policy
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

    await notificationEmailService.sendNotificationEmails({
      ...notification,
      notificationId: req.body.notificationId || 'unknown'
    }, allowedRecipients);

    return res.status(200).json({
      success: true,
      message: `Email notifications sent to ${allowedRecipients.length} recipients`,
      recipients: allowedRecipients
    });
  } catch (err) {
    // Ensure CORS headers even on error
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Failed to send email notifications',
      details: err.message
    });
  }
};
