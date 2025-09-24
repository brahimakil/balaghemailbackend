const admin = require('firebase-admin');

let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) {
    console.log('🔥 Firebase already initialized');
    return;
  }

  try {
    // For Vercel deployment - use environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('🔥 Initializing Firebase with environment variables...');
      
      // Validate private key format
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.log('🔧 Formatting private key...');
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
  // Initialize Firebase Admin with your service account
  const serviceAccount = {
    "type": "service_account",
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "client_id": process.env.FIREBASE_CLIENT_ID,
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
  };

      // Validate service account structure
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error('Invalid service account configuration');
      }

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
        console.error('❌ Service account file not found, trying environment variables...');
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
  
  return admin.firestore();
};

module.exports = {
  initializeFirebase,
  getFirestore,
  admin
};
