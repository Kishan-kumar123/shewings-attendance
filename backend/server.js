const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxies (Render, Vercel, Railway, Nginx) for accurate client IP identification
app.set('trust proxy', 1);

// Configure CORS
const rawFrontendUrls = process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = rawFrontendUrls
  .split(',')
  .map(url => url.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Mobile apps, curl, server-to-server requests
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Allow in development or if origin matches configured frontend URLs
    if (
      process.env.NODE_ENV !== 'production' ||
      allowedOrigins.includes(normalizedOrigin) ||
      normalizedOrigin.startsWith('http://localhost:') ||
      normalizedOrigin.startsWith('http://127.0.0.1:') ||
      (process.env.ALLOWED_DOMAINS && process.env.ALLOWED_DOMAINS.split(',').some(d => normalizedOrigin.endsWith(d.trim())))
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing with generous limit for high-res selfie captures
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static files for uploaded selfies with fallback placeholder support
const uploadsPath = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads');
const placeholderPath = path.join(__dirname, 'uploads', 'placeholder-selfie.svg');

// Dedicated fallback for missing or corrupted (< 100 bytes) selfie images
app.get('/uploads/selfies/:filename', (req, res) => {
  const filePath = path.join(uploadsPath, 'selfies', req.params.filename);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > 100) {
      return res.sendFile(filePath);
    }
  }
  return res.type('image/svg+xml').sendFile(placeholderPath);
});

// General static serving for other uploaded assets
app.use('/uploads', express.static(uploadsPath, { maxAge: '1d' }));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // limit each IP to 25 login/register attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP address. Please try again after 15 minutes.'
  }
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // 600 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.'
  }
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', generalApiLimiter);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/office', require('./routes/office'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/wfh', require('./routes/wfh'));
app.use('/api/departments', require('./routes/departments'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SheWings Attendance Backend API',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.url}` });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error occurred.'
  });
});

app.listen(PORT, async () => {
  try {
    const migrateDatabase = require('./database/migrate');
    await migrateDatabase();
  } catch (err) {
    console.warn('Startup database check notice:', err.message);
  }
  console.log(`=================================================`);
  console.log(` SheWings Foundation Attendance Server Running!`);
  console.log(` Port:     ${PORT}`);
  console.log(` URL:      http://localhost:${PORT}`);
  console.log(` Health:   http://localhost:${PORT}/api/health`);
  console.log(`=================================================`);
});
