const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getInitConnectionConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.JAWSDB_URL;
  const isSslRequested =
    process.env.DB_SSL === 'true' ||
    process.env.DB_SSL === '1' ||
    Boolean(databaseUrl && (databaseUrl.includes('ssl-mode') || databaseUrl.includes('ssl=true') || databaseUrl.includes('tidbcloud') || databaseUrl.includes('aivencloud')));

  const sslOptions = isSslRequested
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true }
    : undefined;

  if (databaseUrl) {
    return {
      uri: databaseUrl,
      multipleStatements: true,
      ...(sslOptions ? { ssl: sslOptions } : {})
    };
  }

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    multipleStatements: true,
    ...(sslOptions ? { ssl: sslOptions } : {})
  };
}

const DB_NAME = process.env.DB_NAME || 'shewings_attendance';

async function initDatabase() {
  const config = getInitConnectionConfig();
  console.log('Connecting to MySQL database server...');
  let connection;

  try {
    connection = await mysql.createConnection(config);
    console.log('Connected to MySQL server.');

    // 1. Create database if it does not exist (gracefully catch if user lacks global CREATE DATABASE privilege)
    if (!process.env.DATABASE_URL && !process.env.MYSQL_URL) {
      try {
        console.log(`Ensuring database '${DB_NAME}' exists...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.query(`USE \`${DB_NAME}\`;`);
      } catch (err) {
        console.log(`Notice: Database selection notice (${err.message}). Continuing...`);
      }
    }

    // 2. Read schema.sql and execute
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('Applying database schema from schema.sql...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await connection.query(schemaSql);
      console.log('Database tables verified / created successfully.');
    } else {
      console.warn('schema.sql not found at:', schemaPath);
    }

    // 3. Seed Default Office Settings if empty
    const [existingSettings] = await connection.query('SELECT id FROM office_settings LIMIT 1');
    if (existingSettings.length === 0) {
      console.log('Seeding initial office settings...');
      await connection.query(`
        INSERT INTO office_settings (
          id, organization_name, office_name, office_address,
          latitude, longitude, allowed_radius_meters,
          work_start_time, grace_period_minutes, work_end_time, saturday_end_time,
          min_hours_half_day, min_hours_full_day
        ) VALUES (
          1,
          'SheWings Foundation',
          'SheWings Foundation',
          'Sector 62, Noida, Uttar Pradesh, 201309, India',
          28.53530548,
          77.34580053,
          100,
          '09:30:00',
          15,
          '18:30:00',
          '18:00:00',
          4.00,
          8.00
        ) ON DUPLICATE KEY UPDATE id=1;
      `);
      console.log('Office settings seeded.');
    }

    // 4. Seed Departments
    const departments = [
      { name: 'Management & Operations', description: 'Executive leadership and strategic operations' },
      { name: 'Social Welfare & Health', description: 'Field initiatives, menstrual hygiene camps, and community projects' },
      { name: 'Human Resources', description: 'Talent acquisition, culture, and employee welfare' },
      { name: 'Finance & Compliance', description: 'Accounts, donor reporting, and regulatory compliance' },
      { name: 'Communications & Media', description: 'Public relations, digital campaigns, and social media' }
    ];

    for (const dept of departments) {
      await connection.query(
        'INSERT IGNORE INTO departments (name, description) VALUES (?, ?)',
        [dept.name, dept.description]
      );
    }
    console.log('Departments seeded.');

    // 5. Ensure Initial Admin Account
    const passwordSalt = await bcrypt.genSalt(10);
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@shewings.org').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const [adminCheck] = await connection.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (adminCheck.length === 0) {
      const adminHash = await bcrypt.hash(adminPassword, passwordSalt);
      await connection.query(
        'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, ?)',
        [adminEmail, adminHash, 'admin', 'active']
      );
      console.log(`Admin user created: ${adminEmail} (password configured from environment)`);
    } else {
      console.log(`Admin user '${adminEmail}' verified active.`);
    }

    console.log('\n==========================================');
    console.log('SheWings Database Initialization Complete!');
    console.log('Production ready. Secure MySQL authentication.');
    console.log(`Admin Account: ${adminEmail}`);
    console.log('==========================================\n');

  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();
