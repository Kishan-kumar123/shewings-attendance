const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/employees
 * List all employees with user and department details (Admin)
 */
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { departmentId, status, search } = req.query;

    let query = `
      SELECT e.id, e.user_id, e.employee_id, e.first_name, e.last_name,
             e.email, e.phone, e.designation, e.joining_date, e.status, e.avatar_url,
             e.created_at, d.id as department_id, d.name as department_name,
             u.role
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE 1=1
    `;
    const params = [];

    if (departmentId && departmentId !== 'all') {
      query += ` AND e.department_id = ?`;
      params.push(parseInt(departmentId, 10));
    }
    if (status && status !== 'all') {
      query += ` AND e.status = ?`;
      params.push(status);
    }
    if (search) {
      query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_id LIKE ? OR e.email LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY e.id DESC`;

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, employees: rows });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch employees from database.' });
  }
});

/**
 * GET /api/employees/:id
 * View single employee details (Admin or the employee themselves)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Enforce ownership: only Admin or employee themselves can view details
    if (req.user.role !== 'admin' && req.user.employeeTableId !== id) {
      return res.status(403).json({ success: false, message: 'Forbidden. You can only view your own profile.' });
    }

    const [rows] = await pool.query(`
      SELECT e.id, e.user_id, e.employee_id, e.first_name, e.last_name,
             e.email, e.phone, e.designation, e.joining_date, e.status, e.avatar_url,
             e.created_at, d.id as department_id, d.name as department_name,
             u.role
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const employee = rows[0];

    // Fetch summary statistics for this employee
    const [statsRows] = await pool.query(`
      SELECT
        COUNT(*) as totalDays,
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as presentDays,
        SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as lateDays,
        SUM(total_working_minutes) as totalMinutes
      FROM attendance
      WHERE employee_id = ?
    `, [id]);

    const [recentLeaves] = await pool.query(`
      SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 5
    `, [id]);

    return res.json({
      success: true,
      employee: {
        ...employee,
        stats: statsRows[0] || {},
        recentLeaves
      }
    });
  } catch (error) {
    console.error('Error fetching employee details:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch employee details.' });
  }
});

/**
 * POST /api/employees
 * Create a new employee and linked user account (Admin)
 */
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      designation,
      joiningDate,
      password,
      employeeId
    } = req.body;

    if (!firstName || !lastName || !email || !designation || !joiningDate) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, email, designation, and joining date are required.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Check duplicate email in users or employees
    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'An account with this email address already exists.' });
    }

    const [existingEmpEmail] = await connection.query('SELECT id FROM employees WHERE email = ?', [normalizedEmail]);
    if (existingEmpEmail.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'An employee with this email address already exists.' });
    }

    // Determine and validate unique employee ID
    let empCode = employeeId ? employeeId.trim() : null;
    if (empCode) {
      const [existingEmpId] = await connection.query('SELECT id FROM employees WHERE employee_id = ?', [empCode]);
      if (existingEmpId.length > 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Employee ID '${empCode}' is already assigned to another staff member.` });
      }
    } else {
      // Auto-generate employee ID
      const [[{ maxId }]] = await connection.query('SELECT MAX(id) as maxId FROM employees');
      empCode = `SW-${(maxId || 100) + 1}`;
      // Verify generated ID does not conflict
      const [dupCheck] = await connection.query('SELECT id FROM employees WHERE employee_id = ?', [empCode]);
      if (dupCheck.length > 0) {
        empCode = `SW-${(maxId || 100) + 2}`;
      }
    }

    // Hash password securely with bcrypt
    const rawPassword = password && password.trim() ? password.trim() : 'Employee@123';
    if (rawPassword.length < 6) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPassword, salt);

    // 1. Insert into users
    const [userResult] = await connection.query(
      `INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'employee', 'active')`,
      [normalizedEmail, passwordHash]
    );
    const userId = userResult.insertId;

    // 2. Insert into employees
    const [empResult] = await connection.query(
      `INSERT INTO employees (
        user_id, employee_id, first_name, last_name, email, phone,
        department_id, designation, joining_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        userId,
        empCode,
        firstName.trim(),
        lastName.trim(),
        normalizedEmail,
        phone ? phone.trim() : null,
        departmentId ? parseInt(departmentId, 10) : null,
        designation.trim(),
        joiningDate
      ]
    );

    // 3. Audit log
    await connection.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, new_values, ip_address)
       VALUES (?, 'CREATE_EMPLOYEE', 'employees', ?, ?, ?)`,
      [
        req.user.id,
        empResult.insertId,
        JSON.stringify({ employeeId: empCode, email: normalizedEmail, name: `${firstName} ${lastName}` }),
        req.ip || ''
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: `Employee ${firstName} ${lastName} (${empCode}) created successfully!`,
      employee: {
        id: empResult.insertId,
        employeeId: empCode,
        name: `${firstName} ${lastName}`,
        email: normalizedEmail,
        temporaryPassword: rawPassword
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating employee:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create employee.' });
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/employees/:id
 * Update employee record (Admin)
 * Supports updating personal info, email, phone, department, designation, joining date, status, and staff ID
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const id = parseInt(req.params.id, 10);
    const { firstName, lastName, email, phone, departmentId, designation, joiningDate, status, employeeId } = req.body;

    const [empRows] = await connection.query('SELECT * FROM employees WHERE id = ?', [id]);
    if (empRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const currentEmp = empRows[0];

    // Validate and check email if provided
    let normalizedEmail = null;
    if (email !== undefined && email !== null) {
      normalizedEmail = email.trim().toLowerCase();

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
      }

      // Check duplicate in users table (exclude current user)
      const [dupUser] = await connection.query(
        'SELECT id FROM users WHERE LOWER(email) = ? AND id != ?',
        [normalizedEmail, currentEmp.user_id]
      );
      if (dupUser.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'An account with this email address already exists. Please choose a different email.'
        });
      }

      // Check duplicate in employees table (exclude current employee)
      const [dupEmp] = await connection.query(
        'SELECT id FROM employees WHERE LOWER(email) = ? AND id != ?',
        [normalizedEmail, id]
      );
      if (dupEmp.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Another employee is already registered with this email address.'
        });
      }
    }

    // If employeeId is being modified, ensure uniqueness
    if (employeeId && employeeId.trim() !== currentEmp.employee_id) {
      const [dupId] = await connection.query(
        'SELECT id FROM employees WHERE employee_id = ? AND id != ?',
        [employeeId.trim(), id]
      );
      if (dupId.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Employee ID '${employeeId}' is already in use by another staff member.`
        });
      }
    }

    // Update employees table
    await connection.query(
      `UPDATE employees SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        department_id = ?,
        designation = COALESCE(?, designation),
        joining_date = COALESCE(?, joining_date),
        status = COALESCE(?, status),
        employee_id = COALESCE(?, employee_id)
       WHERE id = ?`,
      [
        firstName ? firstName.trim() : null,
        lastName ? lastName.trim() : null,
        normalizedEmail,
        phone !== undefined ? phone : null,
        departmentId ? parseInt(departmentId, 10) : null,
        designation ? designation.trim() : null,
        joiningDate || null,
        status || null,
        employeeId ? employeeId.trim() : null,
        id
      ]
    );

    // Sync users table: email and status
    const userUpdates = [];
    const userParams = [];
    if (normalizedEmail) {
      userUpdates.push('email = ?');
      userParams.push(normalizedEmail);
    }
    if (status) {
      userUpdates.push('status = ?');
      userParams.push(status);
    }
    if (userUpdates.length > 0) {
      userParams.push(currentEmp.user_id);
      await connection.query(
        `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`,
        userParams
      );
    }

    // Audit log
    await connection.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, old_values, new_values, ip_address)
       VALUES (?, 'UPDATE_EMPLOYEE', 'employees', ?, ?, ?, ?)`,
      [
        req.user.id,
        id,
        JSON.stringify(currentEmp),
        JSON.stringify(req.body),
        req.ip || ''
      ]
    );

    await connection.commit();
    return res.json({ success: true, message: 'Employee details updated successfully in database.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating employee:', error);
    return res.status(500).json({ success: false, message: 'Failed to update employee.' });
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/employees/:id/status
 * Toggle or set employee active / inactive status (Admin)
 */
router.put('/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'active' or 'inactive'." });
    }

    const [empRows] = await pool.query('SELECT user_id, first_name, last_name FROM employees WHERE id = ?', [id]);
    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const emp = empRows[0];
    await pool.query('UPDATE employees SET status = ? WHERE id = ?', [status, id]);
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, emp.user_id]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, new_values, reason, ip_address)
       VALUES (?, 'TOGGLE_EMPLOYEE_STATUS', 'employees', ?, ?, ?, ?)`,
      [
        req.user.id,
        id,
        JSON.stringify({ status }),
        `Admin changed status to ${status}`,
        req.ip || ''
      ]
    );

    return res.json({
      success: true,
      message: `Employee ${emp.first_name} ${emp.last_name} has been marked ${status}.`
    });
  } catch (error) {
    console.error('Error updating employee status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update employee status.' });
  }
});

/**
 * PUT /api/employees/:id/reset-password
 * Admin resets employee password securely
 */
router.put('/:id/reset-password', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    const [empRows] = await pool.query('SELECT user_id, first_name, last_name, email FROM employees WHERE id = ?', [id]);
    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const emp = empRows[0];
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword.trim(), salt);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, emp.user_id]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, reason, ip_address)
       VALUES (?, 'ADMIN_RESET_PASSWORD', 'users', ?, ?, ?)`,
      [
        req.user.id,
        emp.user_id,
        `Admin reset password for ${emp.first_name} ${emp.last_name} (${emp.email})`,
        req.ip || ''
      ]
    );

    return res.json({
      success: true,
      message: `Password for ${emp.first_name} ${emp.last_name} has been updated successfully.`
    });
  } catch (error) {
    console.error('Error resetting employee password:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset employee password.' });
  }
});

module.exports = router;
