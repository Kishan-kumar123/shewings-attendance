const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsRoot = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'uploads');
const uploadDir = path.join(uploadsRoot, 'selfies');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `selfie-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const uploadSelfie = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

/**
 * Optional Cloudinary Upload for 100% persistent selfie storage across free-tier server restarts
 */
async function uploadToCloudinary(base64Data, prefix) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  try {
    const crypto = require('crypto');
    const timestamp = Math.round(Date.now() / 1000);
    const folder = process.env.CLOUDINARY_FOLDER || 'shewings_attendance';

    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    const formData = new URLSearchParams();
    formData.append('file', base64Data);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.secure_url) {
        return data.secure_url;
      }
    } else {
      const err = await res.text();
      console.warn('Cloudinary upload warning:', err);
    }
  } catch (err) {
    console.warn('Cloudinary upload exception, falling back to local disk:', err.message);
  }
  return null;
}

/**
 * Saves a base64 Data URL (e.g. from canvas.toDataURL()) as an image file
 * Supports Cloudinary for persistent free cloud storage, with automatic local disk fallback.
 * @param {string} base64Data 
 * @param {string} prefix 
 * @returns {Promise<string|null>} URL path to saved image
 */
async function saveBase64Image(base64Data, prefix = 'selfie') {
  if (!base64Data || typeof base64Data !== 'string') return null;

  try {
    const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return null;
    }

    let extension = matches[1].toLowerCase();
    if (extension === 'jpeg') extension = 'jpg';
    if (!['jpg', 'png', 'webp'].includes(extension)) {
      extension = 'jpg';
    }

    const buffer = Buffer.from(matches[2], 'base64');
    // Ensure the decoded image has meaningful content (at least 200 bytes for a valid image)
    if (buffer.length < 200) {
      console.warn('saveBase64Image: rejected abnormally small image buffer (' + buffer.length + ' bytes)');
      return null;
    }

    // Attempt persistent cloud upload if Cloudinary is configured
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const cloudUrl = await uploadToCloudinary(base64Data, prefix);
      if (cloudUrl) {
        return cloudUrl;
      }
    }

    // Local disk persistence
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
    const filepath = path.join(uploadDir, filename);

    fs.writeFileSync(filepath, buffer);
    return `/uploads/selfies/${filename}`;
  } catch (err) {
    console.error('Error saving base64 selfie image:', err);
    return null;
  }
}

module.exports = {
  uploadSelfie,
  saveBase64Image,
  uploadDir
};
