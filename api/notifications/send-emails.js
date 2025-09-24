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
    initializeServices();

    const { notification, recipients } = req.body;

    if (!recipients || recipients.length === 0) {
      return res.status(200).json({ success: true, message: 'No recipients to send to' });
    }
    if (!notification?.performedBy) {
      return res.status(400).json({ error: 'performedBy email is required' });
    }

    const db = getFirestore();

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
