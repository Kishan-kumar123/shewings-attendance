```javascript
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getInitConnectionConfig() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.JAWSDB_URL;

  const isSslRequested =
    process.env.DB_SSL === 'true' ||
    process.env.DB_SSL === '1' ||
    Boolean(
      databaseUrl &&
      (
        databaseUrl.includes('ssl-mode') ||
        databaseUrl.includes('ssl=true') ||
        databaseUrl.includes('tidbcloud') ||
        databaseUrl.includes('aivencloud')
      )
    );

  const sslOptions = isSslRequested
    ? {
        rejectUnauthorized:
          process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false'
            ? false
            : true
      }
    : undefined;

  if (databaseUrl) {
    return {
      uri: databaseUrl,
      multipleStatements: true,
      ...(sslOptions ? { ssl: sslOptions } : {})
    };
  }

  const requiredVariables = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME'
  ];

  const missingVariables = requiredVariables.filter(
    (key) => !process.env[key] || !process.env[key].trim()
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required database environment variables: ${missingVariables.join(', ')}`
    );
  }

  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    ...(sslOptions ? { ssl: sslOptions } : {})
  };
}

async function initDatabase() {
  const adminEmail = (
    process.env.ADMIN_EMAIL || 'admin@shewings.org'
  ).trim().toLowerCase();

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      'ADMIN_PASSWORD must be configured and at least 12 characters long.'
    );
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.JAWSDB_URL;

  const dbName = process.env.DB_NAME;

  if (!databaseUrl && (!dbName || !dbName.trim())) {
    throw new Error(
      'DB_NAME must be configured when using individual database variables.'
    );
  }

  const config = getInitConnectionConfig();

  console.log('Connecting to MySQL database server...');

  let connection;

  try {
    connection = await mysql.createConnection(config);

    console.log('Connected to MySQL server.');

    // 1. Create/select database when using individual DB variables.
    // Cloud database users may not have CREATE DATABASE privileges.
    if (!databaseUrl) {
      try {
        console.log(`Ensuring database '${dbName}' exists...`);

        await connection.query(
          `CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\`
           DEFAULT CHARACTER SET utf8mb4
           COLLATE utf8mb4_unicode_ci;`
        );

        await connection.query(
          `USE \`${dbName.replace(/`/g, '')}\`;`
        );
      } catch (err) {
        console.log(
          `Database selection notice: ${err.message}. Continuing...`
        );
      }
    }

    // 2. Apply database schema.
    const schemaPath = path.join(__dirname, 'schema.sql');

    if (fs.existsSync(schemaPath)) {
      console.log('Applying database schema from schema.sql...');

      const schemaSql = fs.readFileSync(schemaPath, 'utf8');

      await connection.query(schemaSql);

      console.log('Database tables verified / created successfully.');
    } else {
      throw new Error(`schema.sql not found at: ${schemaPath}`);
    }

    // 3. Seed default office settings only when none exist.
    const [existingSettings] = await connection.query(
      'SELECT id FROM office_settings LIMIT 1'
    );

    if (existingSettings.length === 0) {
      console.log('Seeding initial office settings...');

      await connection.query(`
        INSERT INTO office_settings (
          id,
          organization_name,
          office_name,
          office_address,
          latitude,
          longitude,
          allowed_radius_meters,
          work_start_time,
          grace_period_minutes,
          work_end_time,
          saturday_end_time,
          min_hours_half_day,
          min_hours_full_day
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
        ) ON DUPLICATE KEY UPDATE id = 1;
      `);

      console.log('Office settings seeded.');
    }

    // 4. Seed departments without duplicating existing entries.
    const departments = [
      {
        name: 'Management & Operations',
        description: 'Executive leadership and strategic operations'
      },
      {
        name: 'Social Welfare & Health',
        description: 'Field initiatives, menstrual hygiene camps, and community projects'
      },
      {
        name: 'Human Resources',
        description: 'Talent acquisition, culture, and employee welfare'
      },
      {
        name: 'Finance & Compliance',
        description: 'Accounts, donor reporting, and regulatory compliance'
      },
      {
        name: 'Communications & Media',
        description: 'Public relations, digital campaigns, and social media'
      },
      {
        name: 'Tech',
        description: 'Technology, IT infrastructure, web development, and digital systems'
      }
    ];

    for (const department of departments) {
      await connection.query(
        'INSERT IGNORE INTO departments (name, description) VALUES (?, ?)',
        [department.name, department.description]
      );
    }

    console.log('Departments verified.');

    // 5. Create the initial admin only if the account does not exist.
    const [existingAdmin] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [adminEmail]
    );

    if (existingAdmin.length === 0) {
      const passwordSalt = await bcrypt.genSalt(10);
      const adminHash = await bcrypt.hash(adminPassword, passwordSalt);

      await connection.query(
        `INSERT INTO users
          (email, password_hash, role, status)
         VALUES (?, ?, ?, ?)`,
        [adminEmail, adminHash, 'admin', 'active']
      );

      console.log(`Initial admin account created: ${adminEmail}`);
    } else {
      console.log(`Admin account already exists: ${adminEmail}`);
      console.log(
        'Existing admin password was not changed by this initialization.'
      );
    }

    console.log('\n==========================================');
    console.log('SheWings Database Initialization Complete!');
    console.log(`Admin Account: ${adminEmail}`);
    console.log('==========================================\n');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase().catch((error) => {
  console.error('Initialization error:', error.message);
  process.exitCode = 1;
});
```