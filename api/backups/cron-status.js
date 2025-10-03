const admin = require('firebase-admin');

module.exports = async (req, res) => {
  // CORS - Allow multiple origins
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://balagh-admin.vercel.app'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = admin.firestore();
    
    // Check if backup config exists
    const configDoc = await db.collection('backupConfig').doc('settings').get();
    const config = configDoc.exists ? configDoc.data() : null;
    
    // Check last backup log
    const logsSnapshot = await db.collection('backupLogs')
      .orderBy('triggeredAt', 'desc')
      .limit(1)
      .get();
    
    const lastLog = logsSnapshot.empty ? null : logsSnapshot.docs[0].data();
    
    // Determine if cron is working
    const isConfigured = config && config.enabled;
    const hasRecentBackup = lastLog && lastLog.triggeredAt && 
      (Date.now() - lastLog.triggeredAt.toDate().getTime()) < 86400000 * 2; // Within 2 days
    
    res.status(200).json({
      isConfigured,
      hasRecentBackup,
      config,
      lastBackup: lastLog ? lastLog.triggeredAt : null,
      cronStatus: isConfigured && hasRecentBackup ? 'active' : 'inactive'
    });
    
  } catch (error) {
    console.error('Error checking cron status:', error);
    res.status(500).json({ error: 'Failed to check cron status' });
  }
};
