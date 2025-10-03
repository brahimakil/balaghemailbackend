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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = admin.firestore();
    
    // Get backup config
    const configDoc = await db.collection('backupConfig').doc('settings').get();
    if (!configDoc.exists || !configDoc.data().enabled) {
      return res.status(400).json({ error: 'Backup not configured or disabled' });
    }

    const config = configDoc.data();
    
    // Update last backup time
    await db.collection('backupConfig').doc('settings').update({
      lastBackup: admin.firestore.FieldValue.serverTimestamp(),
      lastBackupStatus: 'triggered'
    });

    // Log the backup trigger
    await db.collection('backupLogs').add({
      triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
      triggeredBy: 'cron',
      status: 'initiated'
    });

    res.status(200).json({ 
      success: true, 
      message: 'Backup triggered successfully',
      config 
    });
    
  } catch (error) {
    console.error('Error triggering backup:', error);
    res.status(500).json({ error: 'Failed to trigger backup', details: error.message });
  }
};
