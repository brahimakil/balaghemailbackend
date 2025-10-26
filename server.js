// Local development server (optional)
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001; // Changed from 3002 to 3001

// Middleware - More specific CORS for local testing
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://balagh-admin.vercel.app', 'https://balaghemailbackend.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors()); // Handle preflight requests
app.use(express.json({ limit: '500mb' })); // Increase limit for video metadata
app.use(express.urlencoded({ limit: '500mb', extended: true })); // Handle URL-encoded data

// Import the Vercel functions
const sendEmailsHandler = require('./api/notifications/send-emails');
const youtubeUploadHandler = require('./api/youtube/upload'); 

// Routes for local testing
app.post('/api/notifications/send-emails', sendEmailsHandler);
app.post('/api/youtube/upload', youtubeUploadHandler);

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
