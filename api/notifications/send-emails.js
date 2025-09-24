const { initializeFirebase, getFirestore } = require('../../config/firebase');

// Initialize Firebase and services with better error handling
let firebaseInitialized = false;
let emailService = null;
let notificationEmailService = null;

const initializeServices = () => {
  console.log('🔧 Initializing services...');
  
  if (!firebaseInitialized) {
    console.log('🔥 Initializing Firebase...');
    initializeFirebase();
    firebaseInitialized = true;
    console.log('✅ Firebase initialized');
  }
  
  if (!emailService) {
    console.log('📧 Initializing email services...');
    const EmailService = require('../../services/emailService');
    const NotificationEmailService = require('../../services/notificationEmailService');
    
    emailService = new EmailService();
    notificationEmailService = new NotificationEmailService(emailService);
    console.log('✅ Email services initialized');
  }
};

module.exports = async (req, res) => {
  console.log('🚀 Function invoked:', req.method, req.url);
  
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
    console.log('✅ OPTIONS handled');
    return res.status(200).end();
  }

  // Set CORS for all other responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle GET for testing
  if (req.method === 'GET') {
    console.log('📋 GET request - health check');
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
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Starting POST processing...');
    
    // Check environment variables first
    const requiredEnvVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL', 
      'FIREBASE_PRIVATE_KEY',
      'SUPPORT_EMAIL',
      'SUPPORT_EMAIL_PASSWORD'
    ];

    console.log('🔍 Checking environment variables...');
    const envStatus = {};
    requiredEnvVars.forEach(varName => {
      envStatus[varName] = !!process.env[varName];
    });
    console.log('Environment status:', envStatus);

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      return res.status(500).json({ 
        error: 'Server configuration error', 
        details: `Missing environment variables: ${missingVars.join(', ')}`,
        envStatus
      });
    }

    console.log('✅ All environment variables present');

    // Initialize services with detailed error handling
    try {
      console.log('🔧 Attempting to initialize services...');
      initializeServices();
      console.log('✅ Services initialized successfully');
    } catch (serviceError) {
      console.error('❌ Service initialization failed:', serviceError);
      return res.status(500).json({ 
        error: 'Service initialization failed', 
        details: serviceError.message,
        stack: serviceError.stack
      });
    }

    // Validate request body
    console.log('📋 Validating request body...');
    const { notification, recipients } = req.body;
    
    if (!notification) {
      console.log('❌ Missing notification data');
      return res.status(400).json({ error: 'Notification data is required' });
    }

    if (!recipients || recipients.length === 0) {
      console.log('⚠️ No recipients provided');
      return res.status(200).json({ success: true, message: 'No recipients to send to' });
    }
    
    if (!notification?.performedBy) {
      console.log('❌ Missing performedBy email');
      return res.status(400).json({ error: 'performedBy email is required' });
    }

    console.log('✅ Request validation passed');
    console.log('📧 Recipients count:', recipients.length);
    console.log('👤 Performed by:', notification.performedBy);

    // Get Firestore with error handling
    let db;
    try {
      console.log('🔗 Connecting to Firestore...');
      db = getFirestore();
      console.log('✅ Firestore connection established');
    } catch (firestoreError) {
      console.error('❌ Firestore connection failed:', firestoreError);
      return res.status(500).json({ 
        error: 'Database connection failed', 
        details: firestoreError.message 
      });
    }

    console.log('🔍 Looking up sender...');
    // Lookup sender
    const senderSnapshot = await db.collection('users')
      .where('email', '==', notification.performedBy)
      .get();

    if (senderSnapshot.empty) {
      console.log('❌ Sender not found:', notification.performedBy);
      return res.status(400).json({ error: 'Sender not found' });
    }

    const senderData = senderSnapshot.docs[0].data();
    const senderRole = senderData.role;
    const senderVillageId = senderData.assignedVillageId;
    
    console.log('👤 Sender info:', { role: senderRole, villageId: senderVillageId });

    // Strict policy
    let allowedRecipients = [];
    console.log('🔐 Applying access control policy...');
    
    if (senderRole === 'secondary' && senderVillageId) {
      console.log('📋 Secondary admin - finding village editors...');
      const villageEditorsSnapshot = await db.collection('users')
        .where('role', '==', 'village_editor')
        .where('assignedVillageId', '==', senderVillageId)
        .get();
      const allowedEmails = villageEditorsSnapshot.docs.map(d => d.data().email);
      allowedRecipients = recipients.filter(e => allowedEmails.includes(e));
      console.log('📧 Allowed recipients (village editors):', allowedRecipients.length);
      
    } else if (senderRole === 'village_editor' && senderVillageId) {
      console.log('📋 Village editor - finding secondary admins...');
      const secondaryAdminsSnapshot = await db.collection('users')
        .where('role', '==', 'secondary')
        .where('assignedVillageId', '==', senderVillageId)
        .get();
      const allowedEmails = secondaryAdminsSnapshot.docs.map(d => d.data().email);
      allowedRecipients = recipients.filter(e => allowedEmails.includes(e));
      console.log('📧 Allowed recipients (secondary admins):', allowedRecipients.length);
      
    } else {
      console.log('❌ No permission or missing village assignment');
      allowedRecipients = [];
    }

    if (allowedRecipients.length === 0) {
      console.log('⚠️ No allowed recipients after filtering');
      return res.status(200).json({ success: true, message: 'No allowed recipients after filtering' });
    }

    console.log('📧 Sending emails to allowed recipients...');
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
    console.error('Stack trace:', err.stack);
    
    // Ensure CORS headers even on error
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Failed to send email notifications',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
