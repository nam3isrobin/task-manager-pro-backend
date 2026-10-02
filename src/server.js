const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/error.middleware');
const { apiLimiter } = require('./middleware/rateLimiter.middleware');

// Load environment variables
dotenv.config();

// Connect to MongoDB & Seed Single Root Admin
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(async () => {
    const seedSuperAdmin = require('./config/seedAdmin');
    await seedSuperAdmin();
  }).catch((err) => {
    console.error('Database connection error:', err.message);
  });
}

const app = express();

// Security headers with cross-origin asset resource policy enabled
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Production-ready CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim())
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};
app.use(cors(corsOptions));

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploaded files (avatars, attachments, media)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint handler
const healthCheckHandler = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Task Manager Pro API is running smoothly',
    timestamp: new Date().toISOString(),
  });
};

// Mount health routes
app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);

// Apply rate limiting to all standard API routes
app.use('/api', apiLimiter);

// Mount Application Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/tasks', require('./routes/task.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));

// Handle 404 Not Found
app.use(notFound);

// Global error handling middleware
app.use(errorHandler);

let server;
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err, promise) => {
    console.error(`Error: ${err.message}`);
    server.close(() => process.exit(1));
  });
}

module.exports = app;
