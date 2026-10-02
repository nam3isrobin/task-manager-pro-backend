const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * TaskManager Pro - Secure Upload Middleware
 * Handles disk storage, directory initialization, filename sanitization,
 * and strict file size and type boundaries.
 */

// Absolute path to the uploads storage directory at project root
const uploadDir = path.join(__dirname, '../../uploads');

// Automatically ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer disk storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Re-verify directory presence before saving
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Extract extension safely
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Sanitize base filename: remove path traversal, non-alphanumeric chars, and limit length
    const rawBaseName = path.basename(file.originalname, ext);
    const sanitizedBase = rawBaseName
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 50);

    // Cryptographically distinct timestamp & random suffix to avoid collision
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const finalFilename = `${sanitizedBase || 'attachment'}-${uniqueSuffix}${ext}`;

    cb(null, finalFilename);
  },
});

// File filter guard: restrict dangerous executable files
const fileFilter = (req, file, cb) => {
  const disallowedExtensions = [
    '.exe', '.sh', '.bat', '.cmd', '.php', '.phtml', '.cgi', '.pl', '.jsp', '.msi'
  ];
  const ext = path.extname(file.originalname).toLowerCase();

  if (disallowedExtensions.includes(ext)) {
    return cb(new Error('Dangerous file format blocked for security.'), false);
  }

  cb(null, true);
};

// Multer upload instance with 10MB file size limit
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Megabytes limit
    files: 1, // Single file per request
  },
  fileFilter,
});

module.exports = upload;
