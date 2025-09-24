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

// CORS headers function
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
};

module.exports = async (req, res) => {
  // Set CORS headers for all requests
  setCorsHeaders(res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📧 Gmail Backend - Email notification request received');
    initializeServices();
    
    const { 
      notification, 
      recipients, 
      recipientsOnly, 
      performerRole, 
      performerVillageId 
    } = req.body;

    console.log('📋 Processing email notifications for:', {
      action: notification?.action,
      entityType: notification?.entityType,
      entityName: notification?.entityName,
      performedBy: notification?.performedBy
    });

    // **STRICT FILTERING** - Only allow specific role combinations
    if (!recipients || recipients.length === 0) {
      console.log('✉️ No recipients specified, skipping email notifications');
      return res.status(200).json({ success: true, message: 'No recipients to send to' });
    }

    if (!notification?.performedBy) {
      console.log('❌ No performedBy email provided');
      return res.status(400).json({ error: 'performedBy email is required' });
    }

    // **VALIDATE ROLE POLICY**
    console.log('🔍 Getting Firestore instance...');
    const db = getFirestore();
    
    // Get sender info
    console.log('👤 Looking up sender:', notification.performedBy);
    const senderSnapshot = await db.collection('users')
      .where('email', '==', notification.performedBy)
      .get();
    
    if (senderSnapshot.empty) {
      console.log('❌ Sender not found in database');
      return res.status(400).json({ error: 'Sender not found' });
    }
    
    const senderData = senderSnapshot.docs[0].data();
    const senderRole = senderData.role;
    const senderVillageId = senderData.assignedVillageId;

    console.log('👤 Sender details:', { 
      email: notification.performedBy, 
      role: senderRole, 
      villageId: senderVillageId 
    });

    // **STRICT EMAIL POLICY ENFORCEMENT**
    let allowedRecipients = [];

    if (senderRole === 'secondary' && senderVillageId) {
      // Secondary with village -> can only email village editors of same village
      console.log('🔍 Filtering recipients: Secondary with village -> Village editors of same village');
      
      const villageEditorsSnapshot = await db.collection('users')
        .where('role', '==', 'village_editor')
        .where('assignedVillageId', '==', senderVillageId)
        .get();
      
      const allowedEmails = villageEditorsSnapshot.docs.map(doc => doc.data().email);
      allowedRecipients = recipients.filter(email => allowedEmails.includes(email));
      
    } else if (senderRole === 'village_editor' && senderVillageId) {
      // Village editor -> can only email secondary admins of same village
      console.log('🔍 Filtering recipients: Village editor -> Secondary admins of same village');
      
      const secondaryAdminsSnapshot = await db.collection('users')
        .where('role', '==', 'secondary')
        .where('assignedVillageId', '==', senderVillageId)
        .get();
      
      const allowedEmails = secondaryAdminsSnapshot.docs.map(doc => doc.data().email);
      allowedRecipients = recipients.filter(email => allowedEmails.includes(email));
      
    } else {
      // Main admin, secondary without village, or any other case -> NO EMAILS
      console.log('🚫 Email blocked: Sender role/village combination not allowed to send emails');
      allowedRecipients = [];
    }

    if (allowedRecipients.length === 0) {
      console.log('✉️ No allowed recipients after filtering, skipping email notifications');
      return res.status(200).json({ success: true, message: 'No allowed recipients after filtering' });
    }

    console.log('📧 Sending emails to allowed recipients:', allowedRecipients);

    // Send emails to allowed recipients only
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

  } catch (error) {
    console.error('❌ Error sending email notifications:', error);
    return res.status(500).json({ 
      error: 'Failed to send email notifications',
      details: error.message 
    });
  }
};
