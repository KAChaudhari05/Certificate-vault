const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const authRoutes = require('./routes/authRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const s3Service = require('./services/s3Service');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow frontend to fetch dynamically generated S3 URLs
  contentSecurityPolicy: false,     // Disable standard CSP to allow Tailwind CDN and scripts
}));
app.use(cors());

// Logging Middleware
app.use(morgan('dev'));

// Parsing Request Bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend static directory
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve Uploaded Files via S3 Pre-signed URL Redirects
app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const filename = req.params.filename;

    // Filenames are formatted as: {userId}_{certificateId}{extension}
    const underscoreIndex = filename.indexOf('_');
    if (underscoreIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Invalid file reference format.'
      });
    }

    const userId = filename.substring(0, underscoreIndex);
    const rest = filename.substring(underscoreIndex + 1);

    const dotIndex = rest.lastIndexOf('.');
    const certificateId = dotIndex !== -1 ? rest.substring(0, dotIndex) : rest;
    const ext = dotIndex !== -1 ? rest.substring(dotIndex) : '';

    const s3Key = `certificates/${userId}/${certificateId}${ext}`;

    // Generate pre-signed URL valid for 5 minutes (300 seconds)
    const presignedUrl = await s3Service.generatePresignedUrl(s3Key, false);

    // Redirect client browser directly to private S3 pre-signed URL
    res.redirect(presignedUrl);
  } catch (error) {
    next(error);
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/certificates', certificateRoutes);

// Send index.html on root request
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Error Details:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running in AWS mode on port ${PORT}`);
});
