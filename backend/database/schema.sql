-- SheWings Foundation: Office Attendance Management System
-- Database Schema for MySQL 8.0+

-- Note: Database creation and selection is handled by the connection pool or init-db script
-- All tables below are safely created using CREATE TABLE IF NOT EXISTS


-- 1. Users Table (Authentication for Admin and Employees)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB;

-- 2. Departments Table
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  employee_id VARCHAR(50) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  department_id INT NULL,
  designation VARCHAR(100) NOT NULL,
  joining_date DATE NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  avatar_url VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_emp_code (employee_id),
  INDEX idx_emp_dept (department_id),
  INDEX idx_emp_status (status)
) ENGINE=InnoDB;

-- 4. Office Settings Table (Single Config Row: Geofence and Work Timing)
CREATE TABLE IF NOT EXISTS office_settings (
  id INT PRIMARY KEY DEFAULT 1,
  organization_name VARCHAR(150) NOT NULL DEFAULT 'SheWings Foundation',
  office_name VARCHAR(150) NOT NULL DEFAULT 'SheWings Foundation',
  office_address TEXT NOT NULL,
  latitude DECIMAL(11, 8) NOT NULL DEFAULT 28.53530548,
  longitude DECIMAL(11, 8) NOT NULL DEFAULT 77.34580053,
  allowed_radius_meters INT NOT NULL DEFAULT 100,
  work_start_time TIME NOT NULL DEFAULT '09:30:00',
  grace_period_minutes INT NOT NULL DEFAULT 15,
  work_end_time TIME NOT NULL DEFAULT '18:30:00',
  saturday_end_time TIME NOT NULL DEFAULT '18:00:00',
  camp_custom_timings_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  camp_work_start_time TIME NOT NULL DEFAULT '09:30:00',
  camp_grace_period_minutes INT NOT NULL DEFAULT 15,
  camp_work_end_time TIME NOT NULL DEFAULT '18:30:00',
  camp_saturday_end_time TIME NOT NULL DEFAULT '18:00:00',
  min_hours_half_day DECIMAL(4, 2) NOT NULL DEFAULT 4.00,
  min_hours_full_day DECIMAL(4, 2) NOT NULL DEFAULT 8.00,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 5. Daily Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  attendance_mode ENUM('OFFICE', 'WFH', 'CAMP') NOT NULL DEFAULT 'OFFICE',
  check_in_time DATETIME NULL,
  check_in_lat DECIMAL(11, 8) NULL,
  check_in_lng DECIMAL(11, 8) NULL,
  check_in_distance_m DECIMAL(8, 2) NULL,
  check_in_selfie VARCHAR(255) NULL,
  check_out_time DATETIME NULL,
  check_out_lat DECIMAL(11, 8) NULL,
  check_out_lng DECIMAL(11, 8) NULL,
  check_out_distance_m DECIMAL(8, 2) NULL,
  check_out_selfie VARCHAR(255) NULL,
  total_working_minutes INT NOT NULL DEFAULT 0,
  status ENUM('Present', 'Late', 'Absent', 'On Leave', 'Incomplete') NOT NULL DEFAULT 'Incomplete',
  is_manual_correction BOOLEAN NOT NULL DEFAULT FALSE,
  correction_reason TEXT NULL,
  corrected_by INT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_date (employee_id, attendance_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_att_date (attendance_date),
  INDEX idx_att_mode (attendance_mode),
  INDEX idx_att_status (status),
  INDEX idx_att_emp_date (employee_id, attendance_date)
) ENGINE=InnoDB;

-- 6. Attendance Events Table (Immutable Audit Event Log for Each Check In/Out)
CREATE TABLE IF NOT EXISTS attendance_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attendance_id INT NOT NULL,
  employee_id INT NOT NULL,
  event_type ENUM('check_in', 'check_out', 'manual_adjustment') NOT NULL,
  attendance_mode ENUM('OFFICE', 'WFH', 'CAMP') NOT NULL DEFAULT 'OFFICE',
  event_timestamp DATETIME NOT NULL,
  latitude DECIMAL(11, 8) NULL,
  longitude DECIMAL(11, 8) NULL,
  distance_meters DECIMAL(8, 2) NULL,
  selfie_path VARCHAR(255) NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_event_time (event_timestamp),
  INDEX idx_event_type (event_type),
  INDEX idx_event_mode (attendance_mode)
) ENGINE=InnoDB;

-- 7. Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_type ENUM('Casual', 'Sick', 'Earned', 'Unpaid') NOT NULL DEFAULT 'Casual',
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
  INDEX idx_leave_emp (employee_id),
  INDEX idx_leave_status (status),
  INDEX idx_leave_dates (start_date, end_date)
) ENGINE=InnoDB;

-- 8. Audit Logs Table (Admin changes to attendance records or configurations)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_name VARCHAR(50) NOT NULL,
  entity_id INT NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  reason TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_time (created_at),
  INDEX idx_audit_entity (entity_name, entity_id)
) ENGINE=InnoDB;

-- 9. Work From Home (WFH) Requests Table
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

-- 10. Initial Seed for Office Settings (Single Record)
INSERT IGNORE INTO office_settings (
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
);

-- 11. Initial Seed for Foundation Departments
INSERT IGNORE INTO departments (id, name, description) VALUES
  (1, 'Management & Operations', 'Executive leadership and strategic operations'),
  (2, 'Social Welfare & Health', 'Field initiatives, menstrual hygiene camps, and community projects'),
  (3, 'Human Resources', 'Talent acquisition, culture, and employee welfare'),
  (4, 'Finance & Compliance', 'Accounts, donor reporting, and regulatory compliance'),
  (5, 'Communications & Media', 'Public relations, digital campaigns, and social media'),
  (6, 'Tech', 'Technology, IT infrastructure, web development, and digital systems');
