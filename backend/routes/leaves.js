const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getKolkataDateString } = require('../utils/time');

/**
 * POST /api/leaves
 * Employee applies for leave
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const { leaveType, startDate, endDate, reason } = req.body;

    if (!startDate || !endDate || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Leave type, start date, end date, and reason are required.'
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date cannot be earlier than start date.'
      });
    }

    // Check for overlapping approved/pending leaves
    const [overlap] = await pool.query(`
      SELECT id FROM leave_requests
      WHERE employee_id = ?
        AND status IN ('Pending', 'Approved')
        AND (
          (start_date BETWEEN ? AND ?) OR
          (end_date BETWEEN ? AND ?) OR
          (? BETWEEN start_date AND end_date)
        )
    `, [employeeId, startDate, endDate, startDate, endDate, startDate]);

    if (overlap.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active or pending leave request covering these dates.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [employeeId, leaveType || 'Casual', startDate, endDate, reason.trim()]
    );

    return res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully for administrator review.',
      leaveId: result.insertId
    });
  } catch (error) {
    console.error('Error applying for leave:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit leave request to database.' });
  }
});

/**
 * GET /api/leaves/my
 * Current employee's leave requests
 */
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const [rows] = await pool.query(
      `SELECT lr.*, u.email as reviewer_email
       FROM leave_requests lr
       LEFT JOIN users u ON u.id = lr.reviewed_by
       WHERE lr.employee_id = ?
       ORDER BY lr.created_at DESC`,
      [employeeId]
    );

    return res.json({ success: true, leaves: rows });
  } catch (error) {
    console.error('Error fetching employee leaves:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch leave requests from database.' });
  }
});

/**
 * GET /api/leaves/all
 * Admin view of all employee leave applications
 */
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT lr.*,
             e.employee_id as emp_code, e.first_name, e.last_name,
             d.name as department_name, u.email as employee_email
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND lr.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY lr.created_at DESC LIMIT 150`;

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, leaves: rows });
  } catch (error) {
    console.error('Error fetching leaves for admin:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch leave requests from database.' });
  }
});

/**
 * PUT /api/leaves/:id/status
 * Admin approve or reject leave request
 */
router.put('/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, reviewNotes } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'Approved' or 'Rejected'." });
    }

    const [leaves] = await pool.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (leaves.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    const leave = leaves[0];

    await pool.query(
      `UPDATE leave_requests SET
        status = ?,
        review_notes = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
       WHERE id = ?`,
      [status, reviewNotes || null, req.user.id, id]
    );

    // Timezone-safe date traversal
    const startStr = typeof leave.start_date === 'string' ? leave.start_date.split('T')[0] : getKolkataDateString(leave.start_date);
    const endStr = typeof leave.end_date === 'string' ? leave.end_date.split('T')[0] : getKolkataDateString(leave.end_date);

    const [sY, sM, sD] = startStr.split('-').map(Number);
    const [eY, eM, eD] = endStr.split('-').map(Number);

    const cur = new Date(sY, sM - 1, sD, 12, 0, 0);
    const end = new Date(eY, eM - 1, eD, 12, 0, 0);

    if (status === 'Approved') {
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        await pool.query(`
          INSERT INTO attendance (employee_id, attendance_date, status, notes)
          VALUES (?, ?, 'On Leave', ?)
          ON DUPLICATE KEY UPDATE
            status = IF(check_in_time IS NULL, 'On Leave', status),
            notes = IF(check_in_time IS NULL, VALUES(notes), notes)
        `, [leave.employee_id, dateStr, `Approved ${leave.leave_type} Leave: ${leave.reason.substring(0, 100)}`]);

        cur.setDate(cur.getDate() + 1);
      }
    } else if (status === 'Rejected') {
      // Revert placeholder 'On Leave' records if employee hadn't checked in
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        await pool.query(`
          DELETE FROM attendance
          WHERE employee_id = ?
            AND attendance_date = ?
            AND status = 'On Leave'
            AND check_in_time IS NULL
        `, [leave.employee_id, dateStr]);

        cur.setDate(cur.getDate() + 1);
      }
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, new_values, ip_address)
       VALUES (?, 'REVIEW_LEAVE', 'leave_requests', ?, ?, ?)`,
      [
        req.user.id,
        id,
        JSON.stringify({ status, reviewNotes, employeeId: leave.employee_id }),
        req.ip || ''
      ]
    );

    return res.json({
      success: true,
      message: `Leave application has been marked as ${status}.`
    });
  } catch (error) {
    console.error('Error reviewing leave:', error);
    return res.status(500).json({ success: false, message: 'Failed to update leave status in database.' });
  }
});

module.exports = router;
