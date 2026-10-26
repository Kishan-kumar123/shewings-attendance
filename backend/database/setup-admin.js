const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getConnectionConfig() {
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
    database: process.env.DB_NAME || 'shewings_attendance',
    multipleStatements: true,
    ...(sslOptions ? { ssl: sslOptions } : {})
  };
}

async function setupAdmin() {
  const args = process.argv.slice(2);
  const resetPassword = args.includes('--reset') || args.includes('--force');

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@shewings.org').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

  if (!adminPassword || adminPassword.length < 6) {
    console.error('Error: ADMIN_PASSWORD must be at least 6 characters long.');
    process.exit(1);
  }

  let connection;
  try {
    const config = getConnectionConfig();
    console.log('Connecting to database server...');
    connection = await mysql.createConnection(config);

    // Check existing admin
    const [existing] = await connection.query(
      'SELECT id, email, status FROM users WHERE email = ?',
      [adminEmail]
    );

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    if (existing.length === 0) {
      await connection.query(
        'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, ?)',
        [adminEmail, passwordHash, 'admin', 'active']
      );
      console.log(`\n✔ Initial Administrator Account successfully created!`);
      console.log(`  Admin Email: ${adminEmail}`);
      console.log(`  Status:      Active`);
      console.log(`  Password:    Configured via ADMIN_PASSWORD environment variable`);
    } else if (resetPassword) {
      await connection.query(
        'UPDATE users SET password_hash = ?, status = ? WHERE id = ?',
        [passwordHash, 'active', existing[0].id]
      );
      console.log(`\n✔ Administrator password successfully reset!`);
      console.log(`  Admin Email: ${adminEmail}`);
      console.log(`  Status:      Active`);
      console.log(`  Password:    Updated via ADMIN_PASSWORD environment variable`);
    } else {
      console.log(`\nℹ Admin account '${adminEmail}' already exists (ID: ${existing[0].id}).`);
      console.log(`  To reset its password using ADMIN_PASSWORD from .env, run: npm run setup-admin -- --reset`);
    }

    console.log('\nSetup Admin script completed successfully.\n');
  } catch (error) {
    console.error('Admin setup failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupAdmin();
