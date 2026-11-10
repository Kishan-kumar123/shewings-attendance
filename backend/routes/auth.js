const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/db');
const { authenticateToken, requireRole, JWT_SECRET } = require('../middleware/auth');
const { getKolkataDateString } = require('../utils/time');

/**
 * POST /api/auth/register
 * Self-registration for new staff members
 */
router.post('/register', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      departmentId,
      designation
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'First name, last name, email, and password are required.'
      });
    }

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (password.length < 6) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    // Check duplicate email
    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists. Please sign in.'
      });
    }

    const [existingEmp] = await connection.query('SELECT id FROM employees WHERE email = ?', [normalizedEmail]);
    if (existingEmp.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'An employee with this email address already exists.'
      });
    }

    // Auto-generate employee code (e.g. SW-101)
    const [[{ maxId }]] = await connection.query('SELECT MAX(id) as maxId FROM employees');
    let empCode = `SW-${(maxId || 100) + 1}`;
    const [dupCheck] = await connection.query('SELECT id FROM employees WHERE employee_id = ?', [empCode]);
    if (dupCheck.length > 0) {
      empCode = `SW-${(maxId || 100) + 2}`;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 1. Insert user
    const [userResult] = await connection.query(
      `INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'employee', 'active')`,
      [normalizedEmail, passwordHash]
    );
    const userId = userResult.insertId;

    // 2. Validate department if provided
    let validDeptId = departmentId ? parseInt(departmentId, 10) : null;
    let deptName = null;
    if (validDeptId) {
      const [deptRows] = await connection.query('SELECT id, name FROM departments WHERE id = ?', [validDeptId]);
      if (deptRows.length > 0) {
        deptName = deptRows[0].name;
      } else {
        validDeptId = null;
      }
    }

    const assignedDesignation = designation && designation.trim() ? designation.trim() : 'Staff Member';
    const today = getKolkataDateString();

    // 3. Insert employee
    const [empResult] = await connection.query(
      `INSERT INTO employees (
        user_id, employee_id, first_name, last_name, email, phone,
        department_id, designation, joining_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        userId,
        empCode,
        trimmedFirst,
        trimmedLast,
        normalizedEmail,
        phone ? phone.trim() : null,
        validDeptId,
        assignedDesignation,
        today
      ]
    );
    const employeeTableId = empResult.insertId;

    await connection.commit();

    // Generate JWT token
    const token = jwt.sign(
      {
        userId,
        role: 'employee',
        employeeTableId
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to SheWings Foundation.',
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        role: 'employee',
        displayName: `${trimmedFirst} ${trimmedLast}`,
        employeeTableId,
        employeeId: empCode,
        designation: assignedDesignation,
        department: deptName,
        avatarUrl: null
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create account. Please try again.'
    });
  } finally {
    connection.release();
  }
});

/**
 * POST /api/auth/login
 * Handles both Admin and Employee credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email address and password.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.status,
              e.id as employee_table_id, e.employee_id, e.first_name, e.last_name,
              e.designation, d.name as department_name, e.avatar_url
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE LOWER(u.email) = ?`,
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email address or password.'
      });
    }

    const user = users[0];

    // Check account status
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the administrator.'
      });
    }

    // Role portal tab validation (if explicitly requested by frontend)
    if (role === 'admin' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted: This account does not have administrator privileges. Please use Staff Login.'
      });
    }

    if (role === 'employee' && user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'This is an Administrator account. Please select the Admin Portal tab to sign in.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email address or password.'
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        employeeTableId: user.employee_table_id
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const displayName = user.role === 'admin'
      ? (user.first_name ? `${user.first_name} ${user.last_name}` : 'Super Admin')
      : `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Employee';

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName,
        employeeTableId: user.employee_table_id,
        employeeId: user.employee_id,
        designation: user.designation,
        department: user.department_name,
        avatarUrl: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    if (
      error.code === 'ECONNREFUSED' ||
      error.code === 'PROTOCOL_CONNECTION_LOST' ||
      error.code === 'ER_ACCESS_DENIED_ERROR' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT'
    ) {
      return res.status(503).json({
        success: false,
        message: 'Database service is temporarily unavailable. Please verify MySQL service status.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred while processing your login.'
    });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

/**
 * PUT /api/auth/admin/change-password
 * Dedicated protected endpoint for Administrator to change their password
 * Enforces strict admin authorization, current password verification, and bcrypt hashing
 */
router.put('/admin/change-password', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // 1. Enforce admin role authorization
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only administrator accounts have permission to perform this action.'
      });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // 2. Validate required fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password, new password, and confirm password are required.'
      });
    }

    // 3. Confirm password matching
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation password do not match.'
      });
    }

    // 4. Validate new password length
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters in length.'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be identical to your current password.'
      });
    }

    // 5. Fetch admin user record securely
    const [users] = await pool.query(
      'SELECT id, password_hash, role, status FROM users WHERE id = ? AND role = "admin"',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Administrator account not found.'
      });
    }

    const adminUser = users[0];
    if (adminUser.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Administrator account is deactivated. Contact system support.'
      });
    }

    // 6. Verify current password with existing bcrypt mechanism
    const isMatch = await bcrypt.compare(currentPassword, adminUser.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect. Please verify and try again.'
      });
    }

    // 7. Hash new password with 10 salt rounds (same algorithm used across backend)
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // 8. Update in database
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ? AND role = "admin"',
      [newHash, req.user.id]
    );

    return res.json({
      success: true,
      message: 'Administrator password changed successfully.'
    });
  } catch (err) {
    console.error('Admin password change error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update administrator password due to a server error.'
    });
  }
});

/**
 * PUT /api/auth/change-password
 * General user change password endpoint
 */
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Both current password and new password are required.'
      });
    }

    if (confirmPassword !== undefined && confirmPassword !== null && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation password do not match.'
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be identical to your current password.'
      });
    }

    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (err) {
    console.error('Password change error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
});

module.exports = router;
