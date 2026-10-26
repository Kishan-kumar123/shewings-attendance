const jwt = require('jsonwebtoken');
const pool = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'shewings_foundation_jwt_secure_auth_key_2026_xyz';

/**
 * Middleware to authenticate requests via Bearer token
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user details from database to verify still active
    const [users] = await pool.query(
      `SELECT u.id, u.email, u.role, u.status,
              e.id as employee_table_id, e.employee_id, e.first_name, e.last_name,
              e.department_id, e.designation, d.name as department_name
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE u.id = ?`,
      [decoded.userId]
    );

    if (users.length === 0 || users[0].status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated or does not exist.'
      });
    }

    req.user = {
      id: users[0].id,
      email: users[0].email,
      role: users[0].role,
      employeeTableId: users[0].employee_table_id,
      employeeId: users[0].employee_id,
      firstName: users[0].first_name,
      lastName: users[0].last_name,
      fullName: users[0].first_name ? `${users[0].first_name} ${users[0].last_name}` : 'Administrator',
      departmentId: users[0].department_id,
      departmentName: users[0].department_name,
      designation: users[0].designation
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token.'
    });
  }
}

/**
 * Middleware to enforce required roles (e.g. 'admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to access this resource.'
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET
};
