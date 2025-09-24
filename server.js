// Local development server (optional)
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Import the Vercel function
const sendEmailsHandler = require('./api/notifications/send-emails');

// Route for local testing
app.post('/api/notifications/send-emails', sendEmailsHandler);

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
  });
}

module.exports = app;
