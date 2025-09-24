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
    console.log('🔍 Step 1: POST request received');
    
    // Step 1: Test basic request parsing
    const { notification, recipients } = req.body || {};
    console.log('🔍 Step 2: Request body parsed');
    
    if (!notification || !recipients) {
      return res.status(400).json({ 
        error: 'Missing notification or recipients',
        received: { notification: !!notification, recipients: !!recipients }
      });
    }
    
    console.log('🔍 Step 3: Basic validation passed');
    
    // Step 2: Test Firebase module loading
    let admin;
    try {
      console.log('🔍 Step 4: Loading Firebase admin...');
      admin = require('firebase-admin');
      console.log('🔍 Step 5: Firebase admin loaded successfully');
    } catch (firebaseLoadError) {
      console.error('❌ Firebase module load failed:', firebaseLoadError);
      return res.status(500).json({
        error: 'Firebase module load failed',
        details: firebaseLoadError.message
      });
    }
    
    // Step 3: Test Firebase initialization
    try {
      console.log('🔍 Step 6: Checking Firebase apps...');
      if (admin.apps.length === 0) {
        console.log('🔍 Step 7: Initializing Firebase...');
        
        // Test service account creation
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
        
        console.log('🔍 Step 8: Service account created');
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
        
        console.log('🔍 Step 9: Firebase initialized');
      } else {
        console.log('🔍 Step 7: Firebase already initialized');
      }
    } catch (firebaseInitError) {
      console.error('❌ Firebase initialization failed:', firebaseInitError);
      return res.status(500).json({
        error: 'Firebase initialization failed',
        details: firebaseInitError.message,
        stack: firebaseInitError.stack
      });
    }
    
    // Step 4: Test Firestore connection
    let db;
    try {
      console.log('🔍 Step 10: Getting Firestore instance...');
      db = admin.firestore();
      console.log('🔍 Step 11: Firestore instance obtained');
    } catch (firestoreError) {
      console.error('❌ Firestore connection failed:', firestoreError);
      return res.status(500).json({
        error: 'Firestore connection failed',
        details: firestoreError.message
      });
    }
    
    // Step 5: Test email service loading
    try {
      console.log('🔍 Step 12: Loading email services...');
      const EmailService = require('../../services/emailService');
      console.log('🔍 Step 13: EmailService loaded');
      
      const NotificationEmailService = require('../../services/notificationEmailService');
      console.log('🔍 Step 14: NotificationEmailService loaded');
      
      const emailService = new EmailService();
      console.log('🔍 Step 15: EmailService instantiated');
      
      const notificationEmailService = new NotificationEmailService(emailService);
      console.log('🔍 Step 16: NotificationEmailService instantiated');
      
    } catch (emailServiceError) {
      console.error('❌ Email service loading failed:', emailServiceError);
      return res.status(500).json({
        error: 'Email service loading failed',
        details: emailServiceError.message,
        stack: emailServiceError.stack
      });
    }
    
    console.log('🔍 Step 17: All services loaded successfully');
    
    // For now, just return success without doing the actual work
    return res.status(200).json({
      success: true,
      message: 'All services loaded successfully - email sending disabled for testing',
      debug: {
        notification: notification.action || 'unknown',
        recipients: recipients.length || 0,
        performedBy: notification.performedBy || 'unknown'
      }
    });
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    console.error('❌ Error stack:', err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Unexpected error occurred',
      details: err.message,
      stack: err.stack
    });
  }
};
