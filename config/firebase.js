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
      
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
    } else {
      // For local development - use service account file
      console.log('🔥 Initializing Firebase with service account file...');
      const serviceAccount = require('../balagh-adbc4-firebase-adminsdk-fbsvc-cc605af9a2.json');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    }

    firebaseInitialized = true;
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    throw error;
  }
};

const getFirestore = () => {
  if (!firebaseInitialized) {
    initializeFirebase();
  }
  return admin.firestore();
};

module.exports = {
  initializeFirebase,
  getFirestore,
  admin
};
