const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/departments
 * List all departments with employee counts (Public)
 */
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
      GROUP BY d.id
      ORDER BY d.name ASC
    `);

    return res.json({ success: true, departments: rows });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch departments.' });
  }
});

module.exports = router;
