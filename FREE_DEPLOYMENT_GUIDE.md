# SheWings Foundation Attendance Management System
## Zero-Budget (₹0) Production Deployment Guide

This comprehensive guide details how to deploy the entire **SheWings Foundation Attendance Management System** online at **₹0 cost (100% Free Forever)** without altering database architecture or removing existing features.

---

## 1. System Architecture & ₹0 Stack Overview

| Component | Platform | Free Tier Specifications | Cost |
| :--- | :--- | :--- | :--- |
| **Frontend** | **Vercel** (Hobby Plan) | Unlimited deployments, global edge CDN, automatic HTTPS, optimized for Next.js 16 | **₹0 / month** |
| **Backend API** | **Render.com** (Free Web Service) | 512 MB RAM, Node.js 20+ runtime, automatic HTTPS, zero configuration | **₹0 / month** |
| **Database** | **TiDB Cloud Serverless** | 100% MySQL 8.0 wire-compatible, 5 GB persistent storage, 50M Request Units/mo, automated backups, no credit card required | **₹0 / month** |
| **Uptime Monitor** | **cron-job.org** or **UptimeRobot** | Scheduled HTTP ping every 14 minutes to eliminate Render cold starts during office hours | **₹0 / month** |
| **Selfie Storage** | **Cloudinary** (Optional Free Tier) | 25 GB monthly media storage + CDN delivery for persistent selfies across server restarts | **₹0 / month** |

---

## 2. Why TiDB Cloud (MySQL) Instead of PostgreSQL?

Your backend is built with `mysql2` and raw SQL queries across 7 route controllers. Here is why staying with a **100% MySQL-compatible cloud database** (TiDB Cloud Serverless) is the best choice:

1. **Zero Code Rewrites**: TiDB Cloud Serverless is 100% compatible with MySQL 8.0 protocol. It works directly with `mysql2` without changing a single line of SQL.
2. **`insertId` Compatibility**: In MySQL, `result.insertId` returns the newly created row ID. In PostgreSQL, `insertId` does not exist (requires `RETURNING id` on every INSERT).
3. **Parameter Placeholders**: MySQL uses `?` placeholders; PostgreSQL requires numbered `$1, $2, $3` parameters. Switching would require manual edits across 40+ queries.
4. **Data Types**: Preserves MySQL-specific `TINYINT(1)`, `ENUM(...)`, `DATETIME`, and `ON DUPLICATE KEY UPDATE` syntax seamlessly.
5. **Data Persistence**: Data on TiDB Cloud is persistent, encrypted, and backed up. No attendance records are ever deleted automatically.

---

## 3. Required Environment Variables

### Backend Variables (Render.com)

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `PORT` | Port for Express server | `5000` |
| `NODE_ENV` | Environment mode | `production` |
| `DB_HOST` | Cloud MySQL host | `gateway01.ap-southeast-1.prod.aws.tidbcloud.com` |
| `DB_PORT` | Cloud MySQL port | `4000` (TiDB) or `3306` (Standard MySQL) |
| `DB_USER` | Database username | `xxxxxx.root` |
| `DB_PASSWORD` | Database user password | `[YourGeneratedStrongPassword]` |
| `DB_NAME` | Database name | `shewings_attendance` |
| `DB_SSL` | Enable TLS/SSL for cloud database | `true` |
| `JWT_SECRET` | 32+ character secret key for auth tokens | `[Generate a random 32-char string]` |
| `JWT_EXPIRES_IN` | Token validity period | `7d` |
| `ADMIN_EMAIL` | Root administrator login | `admin@shewings.org` |
| `ADMIN_PASSWORD` | Initial admin account password | `[StrongAdminPassword2026]` |
| `FRONTEND_URL` | Allowed frontend origin for CORS | `https://your-app-name.vercel.app` |
| `UPLOAD_DIR` | Server selfie storage directory | `uploads/selfies` |

### Frontend Variables (Vercel)

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Full URL to backend API routes | `https://your-backend-api.onrender.com/api` |
| `NEXT_PUBLIC_BACKEND_URL` | Root URL for serving static selfie images | `https://your-backend-api.onrender.com` |

---

## 4. Step-by-Step Deployment Instructions

### Step 1: Pre-Deployment Security (Protect Credentials)

Before publishing code to GitHub:
1. Ensure `backend/.env` is **NEVER** committed.
2. Create a `.gitignore` file inside `backend/` containing:
   ```gitignore
   node_modules/
   .env
   uploads/selfies/*.jpg
   uploads/selfies/*.png
   !uploads/placeholder-selfie.svg
   npm-debug.log*
   ```
3. Initialize Git repository and push your project to a **Private GitHub Repository**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for SheWings Attendance OS"
   git remote add origin https://github.com/your-username/shewings-attendance.git
   git branch -M main
   git push -u origin main
   ```

---

### Step 2: Create Free Cloud MySQL Database (TiDB Cloud)

1. Go to [https://tidbcloud.com](https://tidbcloud.com) and sign up for a free account (No credit card required).
2. Click **Create Cluster** and select **Serverless (Free)**.
3. Choose your closest region (e.g., **Singapore / ap-southeast-1** or **Mumbai** if available).
4. Name the cluster: `shewings-db`.
5. Click **Create**. Within 20 seconds, your cloud MySQL database is active.
6. Click **Connect** and select **Connect with General Client (mysql2 / Node.js)**.
7. Copy the credentials:
   - **Host** (e.g. `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`)
   - **Port** (e.g. `4000`)
   - **User** (e.g. `4xxxxxx.root`)
   - **Password** (Generate and copy password)
   - **Database Name**: Set to `shewings_attendance`
8. In TiDB Cloud console, open **SQL Editor**:
   - Copy the contents of [`backend/database/schema.sql`](file:///c:/Users/kisha/OneDrive/Pictures/Desktop/shewings%20attendence/backend/database/schema.sql).
   - Paste and execute it in the SQL Editor to create all 9 tables:
     `users`, `departments`, `employees`, `office_settings`, `attendance`, `attendance_events`, `leave_requests`, `audit_logs`, `wfh_requests`.

---

### Step 3: Deploy Backend API to Render.com

1. Sign up or log in at [https://render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select your `shewings-attendance` repository.
4. Fill in the service configuration:
   - **Name**: `shewings-attendance-api`
   - **Region**: Singapore (or nearest to your TiDB cluster)
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free** (0.5 CPU, 512 MB RAM)
5. Scroll down to **Environment Variables** and add all backend variables listed in Section 3:
   - `PORT` = `5000`
   - `NODE_ENV` = `production`
   - `DB_HOST` = *(from TiDB Cloud)*
   - `DB_PORT` = `4000`
   - `DB_USER` = *(from TiDB Cloud)*
   - `DB_PASSWORD` = *(from TiDB Cloud)*
   - `DB_NAME` = `shewings_attendance`
   - `DB_SSL` = `true`
   - `JWT_SECRET` = *(strong 32-character random string)*
   - `JWT_EXPIRES_IN` = `7d`
   - `ADMIN_EMAIL` = `admin@shewings.org`
   - `ADMIN_PASSWORD` = `[YourSecurePassword]`
   - `FRONTEND_URL` = `https://your-app-name.vercel.app` *(update after Step 4)*
   - `UPLOAD_DIR` = `uploads/selfies`
6. Click **Deploy Web Service**.
7. Once deployment finishes, verify by opening `https://shewings-attendance-api.onrender.com/api/health` in your browser. You should see:
   ```json
   { "status": "healthy", "service": "SheWings Attendance Backend API" }
   ```

---

### Step 4: Deploy Frontend to Vercel

1. Sign up or log in at [https://vercel.com](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your `shewings-attendance` GitHub repository.
4. In **Project Configuration**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click `Edit` and select `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_API_URL` = `https://shewings-attendance-api.onrender.com/api`
   - `NEXT_PUBLIC_BACKEND_URL` = `https://shewings-attendance-api.onrender.com`
6. Click **Deploy**.
7. In 1–2 minutes, Vercel will provide your live URL (e.g. `https://shewings-attendance.vercel.app`).
8. **Final Step**: Go back to Render.com dashboard → Environment Variables, and set `FRONTEND_URL` to your live Vercel URL to allow secure CORS requests.

---

### Step 5: Prevent Render Free Cold Starts (Keep Warm Ping)

Render free tier services go to sleep after 15 minutes of inactivity. When an employee opens the app, the first request may take 30–50 seconds to wake up the server.

**To solve this at ₹0:**
1. Go to [https://cron-job.org](https://cron-job.org) (100% free account).
2. Create a new Cronjob:
   - **Title**: `SheWings Keep-Alive`
   - **URL**: `https://shewings-attendance-api.onrender.com/api/health`
   - **Schedule**: Every **14 minutes**, Monday through Saturday, between **8:00 AM and 8:00 PM IST**.
3. Result: Your backend stays instantly responsive with 0 cold starts throughout the work day!

---

## 5. Free Tier Limitations & How to Handle Them

| Service | Limitation | Impact | Solution |
| :--- | :--- | :--- | :--- |
| **Render Web Service** | Inactive sleep after 15 mins | 30s cold start on first visit | Add free cron monitor on `/api/health` every 14 mins |
| **Render Ephemeral Disk** | Files in `uploads/selfies/` reset on container restart | DB records remain intact, but selfie image file resets to fallback placeholder | Store selfies on Cloudinary free tier (25GB/mo) for permanent image hosting |
| **TiDB Cloud Serverless** | 5 GB storage limit | Stores ~150,000+ attendance records and employee profiles | Exceeds 5+ years of operational records for 100+ staff |
| **Vercel Hobby** | 100 GB bandwidth / mo | Plenty for enterprise web dashboards | More than sufficient for 1,000+ daily employee logins |

---

## 6. Pre-Flight Verification & Implemented Enhancements (Completed)

All production-grade optimizations and security hardening have been implemented and verified:
1. **Cloud MySQL Ready**: `backend/database/db.js` fully supports both individual credentials (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`) and cloud connection URIs (`DATABASE_URL`, `MYSQL_URL`) with automatic TLS/SSL and connection keep-alive.
2. **Dynamic Frontend API & Asset URLs**: `frontend/app/lib/api.js` dynamically resolves `BACKEND_URL` and `API_BASE` from `NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_API_URL` while preserving `http://localhost:5000` fallback in local development.
3. **Persistent Selfie Storage**: `backend/middleware/upload.js` supports free permanent cloud storage via Cloudinary (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`), custom disk volumes via `UPLOADS_DIR`, and local storage with SVG placeholder fallbacks.
4. **Security Hardening**:
   - `express-rate-limit` active on auth routes (25 attempts / 15m) and general API (600 requests / 15m).
   - Reverse proxy IP trust enabled (`app.set('trust proxy', 1)`).
   - Multi-origin CORS support with comma-separated frontend URLs.
   - Strict root, backend, and frontend `.gitignore` files preventing accidental exposure of `.env`, database dumps, and employee selfie images.
5. **Verified Builds & Test Suites**:
   - Frontend Next.js production build: **Passed (`npm run build`, exit code 0)**.
   - Business logic rules test: **Passed (`node tests/verify-rules.js`, exit code 0)**.
   - Three attendance modes test: **Passed (`node tests/verify-modes.js`, exit code 0)**.
   - Database administration script: **Passed (`node database/setup-admin.js`, exit code 0)**.

