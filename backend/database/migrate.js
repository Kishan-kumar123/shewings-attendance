const pool = require('./db');
const bcrypt = require('bcryptjs');

async function migrateDatabase() {
  console.log('Running database schema verification & migration...');
  try {
    // 1. Verify saturday_end_time in office_settings
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'office_settings' AND COLUMN_NAME = 'saturday_end_time'"
    );

    if (cols.length === 0) {
      console.log('Adding saturday_end_time column to office_settings...');
      await pool.query(
        "ALTER TABLE office_settings ADD COLUMN saturday_end_time TIME NOT NULL DEFAULT '18:00:00' AFTER work_end_time"
      );
      console.log('Column saturday_end_time added successfully.');
    } else {
      console.log('Column saturday_end_time already present in office_settings.');
    }

    // 2. Add camp timing settings columns to office_settings if missing
    const campCols = [
      { name: 'camp_custom_timings_enabled', def: "TINYINT(1) NOT NULL DEFAULT 0 AFTER saturday_end_time" },
      { name: 'camp_work_start_time', def: "TIME NOT NULL DEFAULT '09:30:00' AFTER camp_custom_timings_enabled" },
      { name: 'camp_grace_period_minutes', def: "INT NOT NULL DEFAULT 15 AFTER camp_work_start_time" },
      { name: 'camp_work_end_time', def: "TIME NOT NULL DEFAULT '18:30:00' AFTER camp_grace_period_minutes" },
      { name: 'camp_saturday_end_time', def: "TIME NOT NULL DEFAULT '18:00:00' AFTER camp_work_end_time" }
    ];

    for (const col of campCols) {
      const [existingCol] = await pool.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'office_settings' AND COLUMN_NAME = ?",
        [col.name]
      );
      if (existingCol.length === 0) {
        console.log(`Adding ${col.name} to office_settings...`);
        await pool.query(`ALTER TABLE office_settings ADD COLUMN ${col.name} ${col.def}`);
      }
    }

    // 3. Ensure office_settings has a base configuration record
    const [existingSettings] = await pool.query('SELECT id FROM office_settings LIMIT 1');
    if (existingSettings.length === 0) {
      console.log('Seeding initial office settings into empty office_settings table...');
      await pool.query(`
        INSERT INTO office_settings (
          id, organization_name, office_name, office_address,
          latitude, longitude, allowed_radius_meters,
          work_start_time, grace_period_minutes, work_end_time, saturday_end_time,
          camp_custom_timings_enabled, camp_work_start_time, camp_grace_period_minutes,
          camp_work_end_time, camp_saturday_end_time,
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
          0,
          '09:30:00',
          15,
          '18:30:00',
          '18:00:00',
          4.00,
          8.00
        ) ON DUPLICATE KEY UPDATE id = 1;
      `);
      console.log('Office settings seeded successfully.');
    } else {
      await pool.query(`
        UPDATE office_settings SET
          work_start_time = COALESCE(work_start_time, '09:30:00'),
          work_end_time = COALESCE(work_end_time, '18:30:00'),
          saturday_end_time = COALESCE(saturday_end_time, '18:00:00'),
          grace_period_minutes = COALESCE(grace_period_minutes, 15),
          camp_custom_timings_enabled = COALESCE(camp_custom_timings_enabled, 0),
          camp_work_start_time = COALESCE(camp_work_start_time, '09:30:00'),
          camp_grace_period_minutes = COALESCE(camp_grace_period_minutes, 15),
          camp_work_end_time = COALESCE(camp_work_end_time, '18:30:00'),
          camp_saturday_end_time = COALESCE(camp_saturday_end_time, '18:00:00')
        WHERE id = ?
      `, [existingSettings[0].id]);
    }

    // Ensure standard departments exist
    const defaultDepts = [
      { name: 'Management & Operations', description: 'Executive leadership and strategic operations' },
      { name: 'Social Welfare & Health', description: 'Field initiatives, menstrual hygiene camps, and community projects' },
      { name: 'Human Resources', description: 'Talent acquisition, culture, and employee welfare' },
      { name: 'Finance & Compliance', description: 'Accounts, donor reporting, and regulatory compliance' },
      { name: 'Communications & Media', description: 'Public relations, digital campaigns, and social media' },
      { name: 'Tech', description: 'Technology, IT infrastructure, web development, and digital systems' }
    ];
    for (const dept of defaultDepts) {
      await pool.query(
        'INSERT IGNORE INTO departments (name, description) VALUES (?, ?)',
        [dept.name, dept.description]
      );
    }

    // 4. Check and add attendance_mode to attendance table
    const [attModeCols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'attendance_mode'"
    );
    if (attModeCols.length === 0) {
      console.log('Adding attendance_mode to attendance table...');
      await pool.query(`
        ALTER TABLE attendance
        ADD COLUMN attendance_mode ENUM('OFFICE', 'WFH', 'CAMP') NOT NULL DEFAULT 'OFFICE' AFTER attendance_date,
        ADD INDEX idx_att_mode (attendance_mode)
      `);
      console.log('Column attendance_mode added to attendance.');
    } else {
      console.log('Column attendance_mode already present in attendance.');
    }

    // 5. Check and add attendance_mode to attendance_events table
    const [eventModeCols] = await pool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_events' AND COLUMN_NAME = 'attendance_mode'"
    );
    if (eventModeCols.length === 0) {
      console.log('Adding attendance_mode to attendance_events table...');
      await pool.query(`
        ALTER TABLE attendance_events
        ADD COLUMN attendance_mode ENUM('OFFICE', 'WFH', 'CAMP') NOT NULL DEFAULT 'OFFICE' AFTER event_type,
        ADD INDEX idx_event_mode (attendance_mode)
      `);
      console.log('Column attendance_mode added to attendance_events.');
    } else {
      console.log('Column attendance_mode already present in attendance_events.');
    }

    // 6. Ensure wfh_requests table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wfh_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
        reviewed_by INT NULL,
        review_notes TEXT NULL,
        reviewed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_wfh_emp (employee_id),
        INDEX idx_wfh_status (status),
        INDEX idx_wfh_dates (start_date, end_date)
      ) ENGINE=InnoDB;
    `);
    console.log('Table wfh_requests verified / created.');

    // 7. Ensure default administrator account exists
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@shewings.org').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const [adminCheck] = await pool.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (adminCheck.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(adminPassword, salt);
      await pool.query(
        'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, ?)',
        [adminEmail, hash, 'admin', 'active']
      );
      console.log(`Default admin account created: ${adminEmail}`);
    } else {
      console.log(`Admin account '${adminEmail}' verified active.`);
    }

    const [settings] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    console.log('Verified Office Settings:', {
      office_name: settings[0]?.office_name,
      work_start_time: settings[0]?.work_start_time,
      work_end_time: settings[0]?.work_end_time,
      saturday_end_time: settings[0]?.saturday_end_time,
      grace_period_minutes: settings[0]?.grace_period_minutes,
      camp_custom_timings_enabled: settings[0]?.camp_custom_timings_enabled,
      camp_work_start_time: settings[0]?.camp_work_start_time,
      camp_grace_period_minutes: settings[0]?.camp_grace_period_minutes
    });

    console.log('Database migration completed successfully.');
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

if (require.main === module) {
  migrateDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrateDatabase;
