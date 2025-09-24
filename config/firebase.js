const admin = require('firebase-admin');

let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) {
    console.log('🔥 Firebase already initialized');
    return;
  }

  try {
    console.log('🔥 Starting Firebase initialization...');
    
    // Check if Firebase is already initialized (prevents double initialization)
    if (admin.apps.length > 0) {
      console.log('🔥 Firebase app already exists, using existing instance');
      firebaseInitialized = true;
      return;
    }

    // For Vercel deployment - use environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('🔥 Initializing Firebase with environment variables...');
      
      // Process the private key properly
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.log('🔧 Formatting private key...');
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || undefined,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || undefined,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
      };
 
      // Validate essential service account fields
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error(`Missing essential Firebase credentials. project_id: ${!!serviceAccount.project_id}, client_email: ${!!serviceAccount.client_email}, private_key: ${!!serviceAccount.private_key}`);
      }

      console.log('🔧 Service account configured, initializing admin...');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      
    } else {
      // For local development - use service account file if it exists
      console.log('🔥 Attempting to initialize Firebase with service account file...');
      try {
        const serviceAccount = require('../balagh-adbc4-firebase-adminsdk-fbsvc-cc605af9a2.json');
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
      } catch (fileError) {
        console.error('❌ Service account file not found:', fileError.message);
        throw new Error('Neither environment variables nor service account file available for Firebase initialization');
      }
    }

    firebaseInitialized = true;
    console.log('✅ Firebase initialized successfully');
    
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    firebaseInitialized = false;
    throw new Error(`Firebase initialization failed: ${error.message}`);
  }
};

const getFirestore = () => {
  if (!firebaseInitialized) {
    initializeFirebase();
  }
  
  if (!firebaseInitialized) {
    throw new Error('Firebase not initialized');
  }
  
  try {
    return admin.firestore();
  } catch (error) {
    console.error('❌ Failed to get Firestore instance:', error);
    throw new Error(`Firestore connection failed: ${error.message}`);
  }
};

module.exports = {
  initializeFirebase,
  getFirestore,
  admin
};
