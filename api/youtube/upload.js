const axios = require('axios');

/**
 * YouTube Upload Proxy - Handles CORS issues
 */
module.exports = async (req, res) => {
  // Set CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { action, videoUrl, metadata, uploadUrl, accessToken } = req.body;

    if (action === 'init') {
      // Step 1: Initialize resumable upload
      const response = await axios.post(
        'https://www.googleapis.com/upload/youtube/v3/videos',
        metadata,
        {
          params: {
            uploadType: 'resumable',
            part: 'snippet,status',
            access_token: accessToken
          },
          headers: {
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': 'video/*'
          }
        }
      );

      return res.json({
        success: true,
        uploadUrl: response.headers['location']
      });
    }

    if (action === 'upload') {
      // Step 2: Fetch video from Firebase and upload to YouTube
      console.log('📥 Fetching video from:', videoUrl);
      const videoResponse = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 2 * 1024 * 1024 * 1024, // 2GB
        maxBodyLength: 2 * 1024 * 1024 * 1024
      });

      const videoBuffer = videoResponse.data;
      console.log(`📤 Uploading ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB to YouTube...`);

      const uploadResponse = await axios.put(uploadUrl, videoBuffer, {
        headers: {
          'Content-Type': 'video/*'
        },
        maxContentLength: 2 * 1024 * 1024 * 1024,
        maxBodyLength: 2 * 1024 * 1024 * 1024,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`⏳ Upload progress: ${percentCompleted}%`);
        }
      });

      return res.json({
        success: true,
        videoId: uploadResponse.data.id,
        videoUrl: `https://www.youtube.com/watch?v=${uploadResponse.data.id}`
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid action'
    });

  } catch (error) {
    console.error('❌ YouTube upload error:', error.response?.data || error.message);
    
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
};

