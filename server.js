// Local development server (optional)
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Initialize Firebase first!
const { initializeFirebase } = require('./config/firebase');
initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - More specific CORS for local testing
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://balagh-admin.vercel.app', 'https://balaghemailbackend.vercel.app'],
  credentials: true
}));
app.use(express.json());

// Import the Vercel functions
const sendEmailsHandler = require('./api/notifications/send-emails');
const cronStatusHandler = require('./api/backups/cron-status');
const triggerBackupHandler = require('./api/backups/trigger-backup');

// Routes for local testing
app.post('/api/notifications/send-emails', sendEmailsHandler);
app.get('/api/backups/cron-status', cronStatusHandler);
app.post('/api/backups/trigger-backup', triggerBackupHandler);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Gmail Backend is running!', 
    timestamp: new Date()
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Gmail Backend running on port ${PORT}`);
    console.log(`📧 Email API available at: http://localhost:${PORT}/api/notifications/send-emails`);
    console.log(`🔄 Backup API available at: http://localhost:${PORT}/api/backups/cron-status`);
  });
}

module.exports = app;
