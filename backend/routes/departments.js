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

/**
 * POST /api/departments
 * Add a new department (Admin only)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied: Administrator role required.' });
    }

    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required.' });
    }

    const trimmedName = name.trim();
    const [existing] = await pool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'A department with this name already exists.' });
    }

    const [result] = await pool.query(
      'INSERT INTO departments (name, description) VALUES (?, ?)',
      [trimmedName, description ? description.trim() : null]
    );

    return res.status(201).json({
      success: true,
      message: 'Department created successfully.',
      department: {
        id: result.insertId,
        name: trimmedName,
        description: description ? description.trim() : null,
        employee_count: 0
      }
    });
  } catch (error) {
    console.error('Error creating department:', error);
    return res.status(500).json({ success: false, message: 'Failed to create department.' });
  }
});

module.exports = router;
