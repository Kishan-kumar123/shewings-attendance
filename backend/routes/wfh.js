const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getKolkataDateString } = require('../utils/time');

/**
 * POST /api/wfh
 * Employee applies for Work From Home
 * Secure: relies on req.user.employeeTableId from verified JWT
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const { startDate, endDate, reason, date, wfhDate } = req.body;

    const start = (startDate || wfhDate || date || '').toString().split('T')[0].trim();
    const end = (endDate || start).toString().split('T')[0].trim();

    if (!start || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'WFH date and reason are required to apply for Work From Home.'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid dates in YYYY-MM-DD format.'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'End date cannot be earlier than start date.'
      });
    }

    // Check for overlapping active (Pending or Approved) WFH requests for this employee
    const [overlap] = await pool.query(
      `SELECT id, start_date, end_date, status
       FROM wfh_requests
       WHERE employee_id = ?
         AND status IN ('Pending', 'Approved')
         AND (start_date <= ? AND end_date >= ?)
       LIMIT 1`,
      [employeeId, end, start]
    );

    if (overlap.length > 0) {
      const existing = overlap[0];
      const startStr = existing.start_date ? existing.start_date.split('T')[0] : existing.start_date;
      const endStr = existing.end_date ? existing.end_date.split('T')[0] : existing.end_date;
      return res.status(400).json({
        success: false,
        message: `You already have an active (${existing.status}) WFH request covering this date (${startStr}${startStr !== endStr ? ` to ${endStr}` : ''}).`
      });
    }

    const [result] = await pool.query(
      `INSERT INTO wfh_requests (employee_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [employeeId, start, end, reason.trim()]
    );

    return res.status(201).json({
      success: true,
      message: 'Work From Home request submitted successfully for Admin approval.',
      requestId: result.insertId
    });
  } catch (error) {
    console.error('Error applying for WFH:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit WFH request.' });
  }
});

/**
 * GET /api/wfh/my
 * Current employee's WFH requests
 * Secure: strictly filtered by logged-in employee ID
 */
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const [rows] = await pool.query(
      `SELECT w.*, u.email as reviewer_email
       FROM wfh_requests w
       LEFT JOIN users u ON u.id = w.reviewed_by
       WHERE w.employee_id = ?
       ORDER BY w.created_at DESC`,
      [employeeId]
    );

    return res.json({ success: true, requests: rows });
  } catch (error) {
    console.error('Error fetching employee WFH requests:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch WFH requests.' });
  }
});

/**
 * GET /api/wfh/today-status
 * Check if the logged-in employee has an approved WFH request covering today
 */
router.get('/today-status', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const today = getKolkataDateString();
    const [rows] = await pool.query(
      `SELECT * FROM wfh_requests
       WHERE employee_id = ? AND LOWER(TRIM(status)) = 'approved' AND ? BETWEEN start_date AND end_date`,
      [employeeId, today]
    );

    const isApprovedToday = rows.length > 0;
    return res.json({
      success: true,
      todayDate: today,
      isApprovedToday,
      wfhRequest: isApprovedToday ? rows[0] : null
    });
  } catch (error) {
    console.error('Error checking WFH today status:', error);
    return res.status(500).json({ success: false, message: 'Failed to check WFH status.' });
  }
});

/**
 * GET /api/wfh/all
 * Admin view of all employee WFH applications with live counts
 */
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const rawStatus = req.query.status;
    const status = rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim() : '';

    // Fetch aggregate status counts across all WFH requests (case- and whitespace-insensitive)
    const [[countRow]] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(TRIM(status)) = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN LOWER(TRIM(status)) = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN LOWER(TRIM(status)) = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM wfh_requests
    `);

    const counts = {
      total: Number(countRow?.total) || 0,
      pending: Number(countRow?.pending) || 0,
      approved: Number(countRow?.approved) || 0,
      rejected: Number(countRow?.rejected) || 0
    };

    let query = `
      SELECT w.*,
             e.employee_id as emp_code, e.first_name, e.last_name,
             d.name as department_name, u.email as employee_email,
             reviewer.email as reviewer_email,
             COALESCE(CONCAT(reviewer_emp.first_name, ' ', reviewer_emp.last_name), reviewer.email, 'Administrator') as reviewer_name
      FROM wfh_requests w
      LEFT JOIN employees e ON e.id = w.employee_id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN users reviewer ON reviewer.id = w.reviewed_by
      LEFT JOIN employees reviewer_emp ON reviewer_emp.user_id = reviewer.id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status.toLowerCase() !== 'all') {
      query += ` AND LOWER(TRIM(w.status)) = LOWER(TRIM(?))`;
      params.push(status);
    }

    query += ` ORDER BY w.created_at DESC LIMIT 200`;

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, requests: rows, counts });
  } catch (error) {
    console.error('Error fetching WFH requests for admin:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch WFH requests.' });
  }
});

/**
 * PUT /api/wfh/:id/status
 * Admin approve or reject WFH request
 */
router.put('/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reviewNotes } = req.body;
    const rawStatus = req.body.status ? req.body.status.toString().trim() : '';

    let status = '';
    if (/^approved$/i.test(rawStatus)) status = 'Approved';
    else if (/^rejected$/i.test(rawStatus)) status = 'Rejected';
    else if (/^pending$/i.test(rawStatus)) status = 'Pending';
    else {
      return res.status(400).json({
        success: false,
        message: "Status must be 'Approved', 'Rejected', or 'Pending'."
      });
    }

    const [rows] = await pool.query('SELECT * FROM wfh_requests WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'WFH request not found.' });
    }

    const wfh = rows[0];

    await pool.query(
      `UPDATE wfh_requests SET
        status = ?,
        review_notes = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
       WHERE id = ?`,
      [status, reviewNotes ? reviewNotes.trim() : null, req.user.id, id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, new_values, ip_address)
       VALUES (?, 'REVIEW_WFH', 'wfh_requests', ?, ?, ?)`,
      [
        req.user.id,
        id,
        JSON.stringify({
          status,
          reviewNotes: reviewNotes || null,
          employeeId: wfh.employee_id,
          startDate: wfh.start_date,
          endDate: wfh.end_date
        }),
        req.ip || ''
      ]
    );

    // Fetch updated record for immediate frontend sync
    const [updatedRows] = await pool.query(
      `SELECT w.*,
              e.employee_id as emp_code, e.first_name, e.last_name,
              d.name as department_name, u.email as employee_email,
              reviewer.email as reviewer_email
       FROM wfh_requests w
       JOIN employees e ON e.id = w.employee_id
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN users reviewer ON reviewer.id = w.reviewed_by
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE w.id = ?`,
      [id]
    );

    return res.json({
      success: true,
      message: `WFH application has been marked as ${status}.`,
      request: updatedRows[0] || null
    });
  } catch (error) {
    console.error('Error reviewing WFH request:', error);
    return res.status(500).json({ success: false, message: 'Failed to update WFH request status.' });
  }
});

module.exports = router;
