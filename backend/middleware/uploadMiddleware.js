const multer = require('multer');

// Configure memory storage instead of disk storage for direct S3 streaming
const storage = multer.memoryStorage();

// File filter logic (Only PDFs and Images allowed)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, JPEG, PNG, and GIF files are allowed.'), false);
  }
};

// Multer upload configurations (Max size: 5MB)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

module.exports = upload;
