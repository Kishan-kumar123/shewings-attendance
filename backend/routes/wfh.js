const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getKolkataDateString } = require('../utils/time');

/**
 * POST /api/wfh
 * Employee applies for Work From Home
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Start date, end date, and reason are required for WFH request.'
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date cannot be earlier than start date.'
      });
    }

    // Check for overlapping approved/pending WFH requests
    const [overlap] = await pool.query(`
      SELECT id FROM wfh_requests
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
        message: 'You already have an active or pending WFH request covering these dates.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO wfh_requests (employee_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [employeeId, startDate, endDate, reason.trim()]
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
 * Check if the logged-in employee has an approved WFH request for today
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
       WHERE employee_id = ? AND status = 'Approved' AND ? BETWEEN start_date AND end_date`,
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
 * Admin view of all employee WFH applications
 */
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT w.*,
             e.employee_id as emp_code, e.first_name, e.last_name,
             d.name as department_name, u.email as employee_email
      FROM wfh_requests w
      JOIN employees e ON e.id = w.employee_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND w.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY w.created_at DESC LIMIT 150`;

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, requests: rows });
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
    const { status, reviewNotes } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'Approved' or 'Rejected'." });
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
      [status, reviewNotes || null, req.user.id, id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, new_values, ip_address)
       VALUES (?, 'REVIEW_WFH', 'wfh_requests', ?, ?, ?)`,
      [
        req.user.id,
        id,
        JSON.stringify({ status, reviewNotes, employeeId: wfh.employee_id }),
        req.ip || ''
      ]
    );

    return res.json({
      success: true,
      message: `WFH application has been marked as ${status}.`
    });
  } catch (error) {
    console.error('Error reviewing WFH request:', error);
    return res.status(500).json({ success: false, message: 'Failed to update WFH request status.' });
  }
});

module.exports = router;
