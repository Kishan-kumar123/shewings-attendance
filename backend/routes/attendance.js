const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadSelfie, saveBase64Image } = require('../middleware/upload');
const { calculateDistanceMeters } = require('../utils/geo');
const {
  getKolkataDateString,
  getKolkataTime,
  parseISTDate,
  isPastAttendanceCutoff,
  determineAttendanceStatus,
  calculateWorkingMinutes,
  getKolkataDayOfWeek,
  isSunday,
  isSaturday,
  getScheduledOfficeHours,
  getWorkingDaysInMonth
} = require('../utils/time');
const {
  resolveDateRange,
  compileAttendanceData,
  generateExcelBuffer,
  generatePdfBuffer
} = require('../utils/attendanceExporter');

/**
 * GET /api/attendance/today
 * Check status of today's attendance for the logged-in employee (IST)
 */
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee record associated with this account.' });
    }

    const today = getKolkataDateString();
    const [rows] = await pool.query(
      `SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?`,
      [employeeId, today]
    );

    // Fetch office settings for scheduled hours and camp settings
    const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    const settings = settingsRows[0] || {};
    const schedule = getScheduledOfficeHours(today, settings);

    // Check if employee has an approved WFH request for today
    const [wfhRows] = await pool.query(
      `SELECT id, start_date, end_date, reason, status
       FROM wfh_requests
       WHERE employee_id = ? AND status = 'Approved' AND ? BETWEEN start_date AND end_date`,
      [employeeId, today]
    );

    return res.json({
      success: true,
      todayDate: today,
      isSunday: isSunday(today),
      schedule,
      campSettings: {
        customTimingsEnabled: Boolean(settings.camp_custom_timings_enabled),
        workStartTime: settings.camp_work_start_time || '09:30:00',
        gracePeriodMinutes: settings.camp_grace_period_minutes || 15,
        workEndTime: settings.camp_work_end_time || '18:30:00',
        saturdayEndTime: settings.camp_saturday_end_time || '18:00:00'
      },
      isWfhApprovedToday: wfhRows.length > 0,
      wfhRequest: wfhRows.length > 0 ? wfhRows[0] : null,
      hasRecord: rows.length > 0,
      attendance: rows.length > 0 ? rows[0] : null
    });
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance status from database.' });
  }
});

/**
 * POST /api/attendance/check-in
 * Employee check-in supporting THREE modes:
 * 1. OFFICE: Mandatory GPS within 100m geofence + live selfie
 * 2. WFH: Pre-approved WFH request on date required + live selfie (GPS recorded if granted)
 * 3. CAMP: Direct check-in without Admin approval or assignment, no geofence, live selfie required, GPS recorded if granted
 *
 * Rules:
 * - Start time: 9:30 AM (or camp_work_start_time if custom camp schedule enabled)
 * - Grace period: 15 minutes (<= 9:45 AM ON TIME, > 9:45 AM LATE)
 * - Server clock in Asia/Kolkata
 */
router.post('/check-in', authenticateToken, uploadSelfie.single('selfie'), async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    // Determine attendance mode
    let mode = String(req.body.attendanceMode || req.body.mode || 'OFFICE').trim().toUpperCase();
    if (!['OFFICE', 'WFH', 'CAMP'].includes(mode)) {
      mode = 'OFFICE';
    }

    // GPS coordinates extraction
    let latitude = parseFloat(req.body.latitude);
    let longitude = parseFloat(req.body.longitude);
    const hasValidCoords = !isNaN(latitude) && !isNaN(longitude);

    // Process live selfie
    let selfiePath = null;
    if (req.file) {
      selfiePath = `/uploads/selfies/${req.file.filename}`;
    } else if (req.body.selfieImage) {
      selfiePath = await saveBase64Image(req.body.selfieImage, `in-${employeeId}`);
    }

    if (!selfiePath) {
      return res.status(400).json({
        success: false,
        message: 'A live camera selfie is mandatory to verify your attendance.'
      });
    }

    const today = getKolkataDateString();

    // Check if already checked in today
    const [existing] = await pool.query(
      'SELECT id, check_in_time, check_out_time, attendance_mode FROM attendance WHERE employee_id = ? AND attendance_date = ?',
      [employeeId, today]
    );

    if (existing.length > 0 && existing[0].check_in_time) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked in for today.'
      });
    }

    // Fetch office settings
    const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    if (settingsRows.length === 0) {
      return res.status(500).json({ success: false, message: 'Office settings not found in database.' });
    }
    const settings = settingsRows[0];

    let distanceMeters = null;

    // Mode-specific validation
    if (mode === 'OFFICE') {
      if (!hasValidCoords) {
        return res.status(400).json({
          success: false,
          message: 'Accurate physical GPS coordinates (latitude and longitude) are mandatory for Office check-in.'
        });
      }

      distanceMeters = calculateDistanceMeters(
        latitude,
        longitude,
        Number(settings.latitude),
        Number(settings.longitude)
      );

      const allowedRadius = Number(settings.allowed_radius_meters) || 100;
      if (distanceMeters > allowedRadius) {
        return res.status(403).json({
          success: false,
          isGeofenceError: true,
          message: `Geofence verification failed. You are ${Math.round(distanceMeters)}m away from ${settings.office_name || 'the office'}. Office check-in is only permitted within ${allowedRadius}m.`,
          currentDistance: distanceMeters,
          allowedRadius: allowedRadius
        });
      }
    } else if (mode === 'WFH') {
      // WFH requires pre-approved WFH request covering today
      const [wfhApproved] = await pool.query(
        `SELECT id FROM wfh_requests
         WHERE employee_id = ? AND status = 'Approved' AND ? BETWEEN start_date AND end_date`,
        [employeeId, today]
      );

      if (wfhApproved.length === 0) {
        return res.status(403).json({
          success: false,
          isWfhNotApproved: true,
          message: 'Work From Home is only allowed on approved dates. You do not have an approved WFH request for today. Please apply for WFH in advance and wait for Admin approval, or select Office / Camp attendance.'
        });
      }

      // If coordinates not provided for WFH, store null
      if (!hasValidCoords) {
        latitude = null;
        longitude = null;
      }
    } else if (mode === 'CAMP') {
      // CAMP ATTENDANCE:
      // - No Admin approval required
      // - No employee assignment required
      // - No geofence required
      // - If GPS permission granted: record GPS coordinates
      // - If GPS permission denied/unavailable: store null without failing
      if (!hasValidCoords) {
        latitude = null;
        longitude = null;
      }
    }

    // Server-side timestamp evaluated in Asia/Kolkata
    const serverNow = new Date();

    // Determine status (Present/On Time or Late)
    // If CAMP mode and custom camp timings enabled, evaluate against camp schedule
    let status;
    if (mode === 'CAMP' && settings.camp_custom_timings_enabled) {
      status = determineAttendanceStatus(
        serverNow,
        settings.camp_work_start_time || '09:30:00',
        settings.camp_grace_period_minutes || 15
      );
    } else {
      status = determineAttendanceStatus(
        serverNow,
        settings.work_start_time || '09:30:00',
        settings.grace_period_minutes || 15
      );
    }

    // Insert or update attendance record into MySQL
    const [result] = await pool.query(
      `INSERT INTO attendance (
        employee_id, attendance_date, attendance_mode, check_in_time,
        check_in_lat, check_in_lng, check_in_distance_m,
        check_in_selfie, status
      ) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        attendance_mode = VALUES(attendance_mode),
        check_in_time = NOW(),
        check_in_lat = VALUES(check_in_lat),
        check_in_lng = VALUES(check_in_lng),
        check_in_distance_m = VALUES(check_in_distance_m),
        check_in_selfie = VALUES(check_in_selfie),
        status = VALUES(status)`,
      [
        employeeId,
        today,
        mode,
        latitude,
        longitude,
        distanceMeters,
        selfiePath,
        status
      ]
    );

    const attendanceId = result.insertId || (existing.length > 0 ? existing[0].id : null);

    // Record immutable audit event
    if (attendanceId) {
      await pool.query(
        `INSERT INTO attendance_events (
          attendance_id, employee_id, event_type, attendance_mode, event_timestamp,
          latitude, longitude, distance_meters, selfie_path, user_agent, ip_address
        ) VALUES (?, ?, 'check_in', ?, NOW(), ?, ?, ?, ?, ?, ?)`,
        [
          attendanceId,
          employeeId,
          mode,
          latitude,
          longitude,
          distanceMeters,
          selfiePath,
          req.headers['user-agent'] || '',
          req.ip || ''
        ]
      );
    }

    const [updatedRow] = await pool.query('SELECT * FROM attendance WHERE id = ?', [attendanceId]);

    const modeLabels = {
      OFFICE: 'Office Attendance',
      WFH: 'Work From Home Attendance',
      CAMP: 'Camp Attendance'
    };

    const timingMsg = status === 'Late'
      ? '(marked Late due to arrival after 15-minute grace period cutoff)'
      : '(marked ON TIME)';

    const message = `${modeLabels[mode]} recorded successfully! ${timingMsg}`;

    return res.json({
      success: true,
      message,
      status,
      attendanceMode: mode,
      attendance: updatedRow[0],
      distance: distanceMeters,
      hasGps: hasValidCoords
    });

  } catch (error) {
    console.error('Check-in error:', error);
    return res.status(500).json({ success: false, message: 'Server error processing check-in in database.' });
  }
});

/**
 * POST /api/attendance/check-out
 * Employee check-out with selfie verification and server timestamp.
 * Respects check-in mode:
 * - OFFICE requires geofence
 * - CAMP and WFH bypass geofence
 * Calculates actual worked time between recorded check-in and check-out timestamps.
 */
router.post('/check-out', authenticateToken, uploadSelfie.single('selfie'), async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const today = getKolkataDateString();

    const [existing] = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?',
      [employeeId, today]
    );

    if (existing.length === 0 || !existing[0].check_in_time) {
      return res.status(400).json({
        success: false,
        message: 'You have not checked in today yet. Check-in must be completed first.'
      });
    }

    if (existing[0].check_out_time) {
      return res.status(400).json({
        success: false,
        message: 'You have already checked out for today.'
      });
    }

    const mode = (existing[0].attendance_mode || 'OFFICE').toUpperCase();

    // Coordinates extraction
    let latitude = parseFloat(req.body.latitude);
    let longitude = parseFloat(req.body.longitude);
    const hasValidCoords = !isNaN(latitude) && !isNaN(longitude);

    // Process live selfie
    let selfiePath = null;
    if (req.file) {
      selfiePath = `/uploads/selfies/${req.file.filename}`;
    } else if (req.body.selfieImage) {
      selfiePath = await saveBase64Image(req.body.selfieImage, `out-${employeeId}`);
    }

    if (!selfiePath) {
      return res.status(400).json({
        success: false,
        message: 'Live camera selfie is required to verify your check-out.'
      });
    }

    let distanceMeters = null;

    // Fetch office settings
    const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    const settings = settingsRows[0] || {};

    // For OFFICE mode, geofence check is strictly enforced
    if (mode === 'OFFICE') {
      if (!hasValidCoords) {
        return res.status(400).json({
          success: false,
          message: 'Accurate physical GPS coordinates (latitude and longitude) are required for Office check-out.'
        });
      }

      distanceMeters = calculateDistanceMeters(
        latitude,
        longitude,
        Number(settings.latitude),
        Number(settings.longitude)
      );

      const allowedRadius = Number(settings.allowed_radius_meters) || 100;
      if (distanceMeters > allowedRadius) {
        return res.status(403).json({
          success: false,
          isGeofenceError: true,
          message: `Geofence verification failed. You are ${Math.round(distanceMeters)}m away from office. Office check-out must be inside the office radius (${allowedRadius}m).`,
          currentDistance: distanceMeters
        });
      }
    } else {
      // CAMP or WFH mode: geofence does not apply
      if (!hasValidCoords) {
        latitude = null;
        longitude = null;
      }
    }

    // Calculate actual worked time between recorded check-in and check-out
    const checkInDate = parseISTDate(existing[0].check_in_time);
    const checkOutDate = new Date();
    const workingMinutes = calculateWorkingMinutes(checkInDate, checkOutDate);

    await pool.query(
      `UPDATE attendance SET
        check_out_time = NOW(),
        check_out_lat = ?,
        check_out_lng = ?,
        check_out_distance_m = ?,
        check_out_selfie = ?,
        total_working_minutes = ?
       WHERE id = ?`,
      [
        latitude,
        longitude,
        distanceMeters,
        selfiePath,
        workingMinutes,
        existing[0].id
      ]
    );

    // Audit event
    await pool.query(
      `INSERT INTO attendance_events (
        attendance_id, employee_id, event_type, attendance_mode, event_timestamp,
        latitude, longitude, distance_meters, selfie_path, user_agent, ip_address
      ) VALUES (?, ?, 'check_out', ?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [
        existing[0].id,
        employeeId,
        mode,
        latitude,
        longitude,
        distanceMeters,
        selfiePath,
        req.headers['user-agent'] || '',
        req.ip || ''
      ]
    );

    const [updatedRow] = await pool.query('SELECT * FROM attendance WHERE id = ?', [existing[0].id]);

    const hours = Math.floor(workingMinutes / 60);
    const mins = workingMinutes % 60;

    return res.json({
      success: true,
      message: `Checked out successfully! Total actual worked duration: ${hours}h ${mins}m.`,
      attendanceMode: mode,
      attendance: updatedRow[0],
      workingMinutes
    });

  } catch (error) {
    console.error('Check-out error:', error);
    return res.status(500).json({ success: false, message: 'Server error processing check-out in database.' });
  }
});

/**
 * GET /api/attendance/history
 * History for logged-in employee
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee profile not found.' });
    }

    const { startDate, endDate, limit = 60 } = req.query;
    let query = `SELECT * FROM attendance WHERE employee_id = ?`;
    const params = [employeeId];

    if (startDate) {
      query += ` AND attendance_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND attendance_date <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY attendance_date DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, history: rows });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance history from database.' });
  }
});

/**
 * GET /api/attendance/all
 * Admin view of all employees for a chosen date (or all records)
 *
 * Rules:
 * - Admin sees: Present, Late, Absent, and On Leave employees
 * - Shows actual check-in and check-out times
 * - Shows total working hours
 * - Sunday is Weekly Off (employees are NEVER marked absent on Sunday)
 * - On working days, employees without check-in are marked Absent once cutoff passes or on past dates
 */
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { date, status, departmentId, search, mode, attendanceMode } = req.query;
    const targetDate = date || getKolkataDateString();
    const filterMode = (mode || attendanceMode || 'all').trim().toUpperCase();

    // 1. Fetch office settings
    const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    const settings = settingsRows[0] || {
      work_start_time: '09:30:00',
      grace_period_minutes: 15,
      work_end_time: '18:30:00',
      saturday_end_time: '18:00:00'
    };

    // 2. Fetch all active employees
    const [allEmployees] = await pool.query(`
      SELECT e.id as employee_id, e.employee_id as emp_code, e.first_name, e.last_name, e.designation,
             e.department_id, d.name as department_name, u.email as employee_email
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status = 'active'
      ORDER BY e.first_name ASC, e.last_name ASC
    `);

    // 3. Fetch attendance rows recorded for this date
    const [attendanceRows] = await pool.query(
      `SELECT * FROM attendance WHERE attendance_date = ?`,
      [targetDate]
    );
    const attendanceMap = new Map();
    attendanceRows.forEach(r => attendanceMap.set(r.employee_id, r));

    // 4. Fetch approved leaves covering this date
    const [leaveRows] = await pool.query(`
      SELECT lr.employee_id, lr.leave_type, lr.reason
      FROM leave_requests lr
      WHERE lr.status = 'Approved'
        AND ? BETWEEN lr.start_date AND lr.end_date
    `, [targetDate]);
    const leaveMap = new Map();
    leaveRows.forEach(l => leaveMap.set(l.employee_id, l));

    // 5. Evaluate date status
    const todayStr = getKolkataDateString();
    const isTargetSunday = isSunday(targetDate);
    const isTargetToday = targetDate === todayStr;
    const isTargetPast = targetDate < todayStr;
    const isTargetFuture = targetDate > todayStr;
    const pastCutoff = isPastAttendanceCutoff(settings.work_start_time, settings.grace_period_minutes);
    const schedule = getScheduledOfficeHours(targetDate, settings);

    // 6. Build unified attendance records for all active employees
    const allRecords = allEmployees.map(emp => {
      const att = attendanceMap.get(emp.employee_id);
      const leave = leaveMap.get(emp.employee_id);

      if (att && att.check_in_time) {
        // Checked in: Status is 'Present' (On Time) or 'Late'
        return {
          id: att.id,
          employee_id: emp.employee_id,
          emp_code: emp.emp_code,
          first_name: emp.first_name,
          last_name: emp.last_name,
          designation: emp.designation,
          department_id: emp.department_id,
          department_name: emp.department_name,
          employee_email: emp.employee_email,
          attendance_date: targetDate,
          attendance_mode: att.attendance_mode || 'OFFICE',
          check_in_time: att.check_in_time,
          check_in_lat: att.check_in_lat,
          check_in_lng: att.check_in_lng,
          check_in_distance_m: att.check_in_distance_m,
          check_in_selfie: att.check_in_selfie,
          check_out_time: att.check_out_time,
          check_out_lat: att.check_out_lat,
          check_out_lng: att.check_out_lng,
          check_out_distance_m: att.check_out_distance_m,
          check_out_selfie: att.check_out_selfie,
          total_working_minutes: Number(att.total_working_minutes) || 0,
          status: att.status, // 'Present' or 'Late'
          is_manual_correction: Boolean(att.is_manual_correction),
          correction_reason: att.correction_reason,
          notes: att.notes
        };
      }

      if (att && att.status === 'On Leave') {
        // Attendance row marked 'On Leave'
        return {
          id: att.id,
          employee_id: emp.employee_id,
          emp_code: emp.emp_code,
          first_name: emp.first_name,
          last_name: emp.last_name,
          designation: emp.designation,
          department_id: emp.department_id,
          department_name: emp.department_name,
          employee_email: emp.employee_email,
          attendance_date: targetDate,
          attendance_mode: null,
          check_in_time: null,
          check_out_time: null,
          total_working_minutes: 0,
          status: 'On Leave',
          notes: att.notes || 'Approved leave'
        };
      }

      if (leave) {
        // Approved leave from leave_requests
        return {
          id: null,
          employee_id: emp.employee_id,
          emp_code: emp.emp_code,
          first_name: emp.first_name,
          last_name: emp.last_name,
          designation: emp.designation,
          department_id: emp.department_id,
          department_name: emp.department_name,
          employee_email: emp.employee_email,
          attendance_date: targetDate,
          attendance_mode: null,
          check_in_time: null,
          check_out_time: null,
          total_working_minutes: 0,
          status: 'On Leave',
          notes: `Approved ${leave.leave_type} Leave: ${leave.reason}`
        };
      }

      // If Sunday: Sunday is a weekly off. Do NOT mark employees absent on Sunday.
      if (isTargetSunday) {
        return {
          id: null,
          employee_id: emp.employee_id,
          emp_code: emp.emp_code,
          first_name: emp.first_name,
          last_name: emp.last_name,
          designation: emp.designation,
          department_id: emp.department_id,
          department_name: emp.department_name,
          employee_email: emp.employee_email,
          attendance_date: targetDate,
          attendance_mode: null,
          check_in_time: null,
          check_out_time: null,
          total_working_minutes: 0,
          status: 'Weekly Off',
          notes: 'Sunday Weekly Off'
        };
      }

      // Monday to Saturday working day without check-in:
      let calculatedStatus = 'Absent';
      let statusNotes = 'Absent (No check-in recorded)';

      if (isTargetToday) {
        if (pastCutoff) {
          calculatedStatus = 'Absent';
          statusNotes = 'Absent (Grace period cutoff passed)';
        } else {
          calculatedStatus = 'Pending';
          statusNotes = 'Reporting window open (Cutoff at 9:45 AM)';
        }
      } else if (isTargetFuture) {
        calculatedStatus = 'Upcoming';
        statusNotes = 'Scheduled work day';
      }

      return {
        id: null,
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        first_name: emp.first_name,
        last_name: emp.last_name,
        designation: emp.designation,
        department_id: emp.department_id,
        department_name: emp.department_name,
        employee_email: emp.employee_email,
        attendance_date: targetDate,
        attendance_mode: null,
        check_in_time: null,
        check_out_time: null,
        total_working_minutes: 0,
        status: calculatedStatus,
        notes: statusNotes
      };
    });

    // 7. Calculate summary metrics for the target date
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let onLeaveCount = 0;
    let weeklyOffCount = 0;
    let officeCount = 0;
    let wfhCount = 0;
    let campCount = 0;

    allRecords.forEach(r => {
      if (r.status === 'Present') presentCount++;
      else if (r.status === 'Late') lateCount++;
      else if (r.status === 'Absent') absentCount++;
      else if (r.status === 'On Leave') onLeaveCount++;
      else if (r.status === 'Weekly Off') weeklyOffCount++;

      if (r.check_in_time) {
        const m = (r.attendance_mode || 'OFFICE').toUpperCase();
        if (m === 'CAMP') campCount++;
        else if (m === 'WFH') wfhCount++;
        else officeCount++;
      }
    });

    // 8. Apply filters (status, department, search, attendance_mode)
    let filtered = allRecords;

    if (filterMode && filterMode !== 'ALL') {
      filtered = filtered.filter(r => (r.attendance_mode || '').toUpperCase() === filterMode);
    }

    if (status && status !== 'all') {
      filtered = filtered.filter(r => r.status.toLowerCase() === status.toLowerCase());
    }

    if (departmentId && departmentId !== 'all') {
      const dId = parseInt(departmentId, 10);
      filtered = filtered.filter(r => r.department_id === dId);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.first_name && r.first_name.toLowerCase().includes(q)) ||
        (r.last_name && r.last_name.toLowerCase().includes(q)) ||
        (r.emp_code && r.emp_code.toLowerCase().includes(q)) ||
        (r.employee_email && r.employee_email.toLowerCase().includes(q)) ||
        (r.designation && r.designation.toLowerCase().includes(q))
      );
    }

    return res.json({
      success: true,
      targetDate,
      schedule,
      isSunday: isTargetSunday,
      isPastCutoff: pastCutoff,
      summary: {
        totalStaff: allEmployees.length,
        presentCount,
        lateCount,
        absentCount,
        onLeaveCount,
        weeklyOffCount,
        officeCount,
        wfhCount,
        campCount,
        attendancePercentage: allEmployees.length > 0
          ? Math.round(((presentCount + lateCount) / allEmployees.length) * 100)
          : 0
      },
      attendances: filtered
    });

  } catch (error) {
    console.error('Error fetching all attendances:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendances from database.' });
  }
});

/**
 * GET /api/attendance/stats
 * Real-time Dashboard overview statistics (Admin & Employee)
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const today = getKolkataDateString();

    if (req.user.role === 'admin') {
      // Fetch office settings
      const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
      const settings = settingsRows[0] || {
        work_start_time: '09:30:00',
        grace_period_minutes: 15,
        work_end_time: '18:30:00',
        saturday_end_time: '18:00:00'
      };

      // 1. Total active registered employees
      const [[{ totalEmployees }]] = await pool.query(
        "SELECT COUNT(*) as totalEmployees FROM employees WHERE status = 'active'"
      );

      // 2. Today's attendance counts & modes
      const [todayCounts] = await pool.query(`
        SELECT a.status, a.attendance_mode, COUNT(*) as count
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.attendance_date = ? AND e.status = 'active'
        GROUP BY a.status, a.attendance_mode
      `, [today]);

      let presentToday = 0;
      let lateToday = 0;
      let officeToday = 0;
      let wfhToday = 0;
      let campToday = 0;

      todayCounts.forEach(r => {
        if (r.status === 'Present') presentToday += r.count;
        if (r.status === 'Late') lateToday += r.count;

        const m = (r.attendance_mode || 'OFFICE').toUpperCase();
        if (m === 'CAMP') campToday += r.count;
        else if (m === 'WFH') wfhToday += r.count;
        else officeToday += r.count;
      });

      // 3. Approved leaves today
      const [[{ onLeaveToday }]] = await pool.query(`
        SELECT COUNT(DISTINCT lr.employee_id) as onLeaveToday
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        WHERE lr.status = 'Approved'
          AND ? BETWEEN lr.start_date AND lr.end_date
          AND e.status = 'active'
      `, [today]);

      const totalCheckedIn = presentToday + lateToday;

      // 4. Timezone rule for Absent Today:
      // Sunday is Weekly off: Do NOT mark employees absent on Sunday.
      const isSundayToday = isSunday(today);
      let absentToday = 0;

      if (!isSundayToday) {
        const pastCutoff = isPastAttendanceCutoff(settings.work_start_time, settings.grace_period_minutes);
        absentToday = pastCutoff
          ? Math.max(0, totalEmployees - totalCheckedIn - onLeaveToday)
          : 0;
      }

      // 5. Attendance percentage
      const attendancePercentage = totalEmployees > 0
        ? Math.round((totalCheckedIn / totalEmployees) * 100)
        : 0;

      // 6. Recent 7 days trend
      const [weeklyTrend] = await pool.query(`
        SELECT attendance_date,
               SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
               SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_count
        FROM attendance
        WHERE attendance_date >= DATE_SUB(?, INTERVAL 7 DAY)
        GROUP BY attendance_date
        ORDER BY attendance_date ASC
      `, [today]);

      // 7. Monthly Statistics (Current Month in IST, with accurately calculated working days)
      const currentMonthPrefix = today.substring(0, 7); // 'YYYY-MM'
      const workingDaysInfo = getWorkingDaysInMonth(currentMonthPrefix);

      const [[monthSummary]] = await pool.query(`
        SELECT
          COUNT(*) as totalCheckIns,
          SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as totalPresent,
          SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as totalLate,
          SUM(CASE WHEN attendance_mode = 'CAMP' THEN 1 ELSE 0 END) as totalCamp,
          SUM(CASE WHEN attendance_mode = 'WFH' THEN 1 ELSE 0 END) as totalWfh,
          SUM(CASE WHEN attendance_mode = 'OFFICE' THEN 1 ELSE 0 END) as totalOffice,
          SUM(total_working_minutes) as totalMinutes
        FROM attendance
        WHERE attendance_date LIKE ?
      `, [`${currentMonthPrefix}%`]);

      const totalMonthAttendance = (monthSummary?.totalPresent || 0) + (monthSummary?.totalLate || 0);
      const monthlyHours = ((monthSummary?.totalMinutes || 0) / 60).toFixed(1);

      return res.json({
        success: true,
        stats: {
          totalEmployees: Number(totalEmployees) || 0,
          presentToday,
          lateToday,
          absentToday,
          onLeaveToday: Number(onLeaveToday) || 0,
          officeToday,
          wfhToday,
          campToday,
          attendancePercentage,
          isSundayToday,
          isPastCutoff: !isSundayToday && isPastAttendanceCutoff(settings.work_start_time, settings.grace_period_minutes),
          todayDate: today,
          todaySchedule: getScheduledOfficeHours(today, settings),
          weeklyTrend,
          monthlyStats: {
            month: currentMonthPrefix,
            totalWorkingDays: workingDaysInfo.totalWorkingDays, // Monday to Saturday count excluding Sundays
            elapsedWorkingDays: workingDaysInfo.elapsedWorkingDays,
            sundaysCount: workingDaysInfo.sundaysCount,
            totalCheckIns: Number(monthSummary?.totalCheckIns) || 0,
            totalPresent: Number(monthSummary?.totalPresent) || 0,
            totalLate: Number(monthSummary?.totalLate) || 0,
            totalOffice: Number(monthSummary?.totalOffice) || 0,
            totalWfh: Number(monthSummary?.totalWfh) || 0,
            totalCamp: Number(monthSummary?.totalCamp) || 0,
            totalHoursWorked: monthlyHours,
            onTimeRate: totalMonthAttendance > 0
              ? Math.round(((monthSummary?.totalPresent || 0) / totalMonthAttendance) * 100)
              : 0
          }
        }
      });
    } else {
      // Employee specific stats
      const employeeId = req.user.employeeTableId;

      const [counts] = await pool.query(`
        SELECT
          COUNT(*) as totalDays,
          SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as presentDays,
          SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as lateDays,
          SUM(CASE WHEN attendance_mode = 'CAMP' THEN 1 ELSE 0 END) as campDays,
          SUM(CASE WHEN attendance_mode = 'WFH' THEN 1 ELSE 0 END) as wfhDays,
          SUM(CASE WHEN attendance_mode = 'OFFICE' THEN 1 ELSE 0 END) as officeDays,
          SUM(total_working_minutes) as totalMinutes
        FROM attendance
        WHERE employee_id = ?
      `, [employeeId]);

      const [[{ pendingLeaves }]] = await pool.query(`
        SELECT COUNT(*) as pendingLeaves
        FROM leave_requests
        WHERE employee_id = ? AND status = 'Pending'
      `, [employeeId]);

      const [[{ pendingWfh }]] = await pool.query(`
        SELECT COUNT(*) as pendingWfh
        FROM wfh_requests
        WHERE employee_id = ? AND status = 'Pending'
      `, [employeeId]);

      const totalMinutes = counts[0]?.totalMinutes || 0;
      const totalDays = counts[0]?.totalDays || 0;
      const avgMinutesPerDay = totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0;

      const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
      const settings = settingsRows[0] || {};

      return res.json({
        success: true,
        stats: {
          totalDays: totalDays,
          presentDays: counts[0]?.presentDays || 0,
          lateDays: counts[0]?.lateDays || 0,
          officeDays: counts[0]?.officeDays || 0,
          wfhDays: counts[0]?.wfhDays || 0,
          campDays: counts[0]?.campDays || 0,
          totalHoursWorked: (totalMinutes / 60).toFixed(1),
          avgHoursPerDay: (avgMinutesPerDay / 60).toFixed(1),
          pendingLeaves: Number(pendingLeaves) || 0,
          pendingWfh: Number(pendingWfh) || 0,
          todaySchedule: getScheduledOfficeHours(today, settings),
          isSunday: isSunday(today)
        }
      });
    }
  } catch (error) {
    console.error('Error fetching attendance stats:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch statistics from database.' });
  }
});

/**
 * GET /api/attendance/monthly-report
 * Admin Monthly Summary & Employee Attendance Report
 *
 * Rules:
 * - Applies official office timings & grace period
 * - Monday to Friday: 9:30 AM to 6:30 PM
 * - Saturday: 9:30 AM to 6:00 PM
 * - Sunday: Weekly Off (never marked absent)
 * - Actual worked time based on check-in and check-out
 * - Breakdown per employee: Present, Late, Absent, On Leave, Office, WFH, Camp, Total Worked Hours, Punctuality %
 */
router.get('/monthly-report', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const todayStr = getKolkataDateString();
    const targetMonth = req.query.month || todayStr.substring(0, 7); // 'YYYY-MM'

    // 1. Fetch office settings
    const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    const settings = settingsRows[0] || {
      work_start_time: '09:30:00',
      grace_period_minutes: 15,
      work_end_time: '18:30:00',
      saturday_end_time: '18:00:00'
    };

    // 2. Calculate working days metadata (Mon-Sat, excluding Sundays)
    const workingDaysInfo = getWorkingDaysInMonth(targetMonth);

    // 3. Fetch active employees
    const [employees] = await pool.query(`
      SELECT e.id as employee_id, e.employee_id as emp_code, e.first_name, e.last_name, e.designation,
             e.department_id, d.name as department_name, u.email as employee_email
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status = 'active'
      ORDER BY e.first_name ASC, e.last_name ASC
    `);

    // 4. Fetch all attendance records for this month including attendance_mode
    const [attendances] = await pool.query(`
      SELECT employee_id, attendance_date, attendance_mode, check_in_time, check_out_time, total_working_minutes, status
      FROM attendance
      WHERE attendance_date LIKE ?
    `, [`${targetMonth}%`]);

    // Group attendances by employee_id and date
    const empAttMap = new Map();
    attendances.forEach(att => {
      if (!empAttMap.has(att.employee_id)) {
        empAttMap.set(att.employee_id, new Map());
      }
      empAttMap.get(att.employee_id).set(att.attendance_date, att);
    });

    // 5. Fetch approved leaves overlapping this month
    const [startDayStr, endDayStr] = [`${targetMonth}-01`, `${targetMonth}-${String(workingDaysInfo.totalCalendarDays).padStart(2, '0')}`];
    const [approvedLeaves] = await pool.query(`
      SELECT employee_id, start_date, end_date, leave_type
      FROM leave_requests
      WHERE status = 'Approved'
        AND NOT (end_date < ? OR start_date > ?)
    `, [startDayStr, endDayStr]);

    // Build list of calendar days up to today or month end
    const isCurrentMonth = targetMonth === todayStr.substring(0, 7);
    const maxDay = isCurrentMonth ? parseInt(todayStr.substring(8, 10), 10) : workingDaysInfo.totalCalendarDays;
    const pastCutoffToday = isPastAttendanceCutoff(settings.work_start_time, settings.grace_period_minutes);

    // 6. Generate employee-wise reports
    const employeeReports = employees.map(emp => {
      let presentDays = 0;
      let lateDays = 0;
      let absentDays = 0;
      let onLeaveDays = 0;
      let weeklyOffDays = 0;
      let officeDays = 0;
      let wfhDays = 0;
      let campDays = 0;
      let totalMinutes = 0;

      const userAtts = empAttMap.get(emp.employee_id) || new Map();

      for (let d = 1; d <= maxDay; d++) {
        const dateStr = `${targetMonth}-${String(d).padStart(2, '0')}`;
        const isSun = isSunday(dateStr);
        const att = userAtts.get(dateStr);

        // Check if employee had approved leave covering this day
        const hasLeave = approvedLeaves.some(l => {
          if (l.employee_id !== emp.employee_id) return false;
          const s = typeof l.start_date === 'string' ? l.start_date.split('T')[0] : getKolkataDateString(l.start_date);
          const e = typeof l.end_date === 'string' ? l.end_date.split('T')[0] : getKolkataDateString(l.end_date);
          return dateStr >= s && dateStr <= e;
        });

        if (isSun) {
          // Sunday is weekly off: NEVER count absent
          weeklyOffDays++;
          if (att && att.check_in_time) {
            totalMinutes += Number(att.total_working_minutes) || 0;
            if (att.status === 'Present') presentDays++;
            else if (att.status === 'Late') lateDays++;

            const m = (att.attendance_mode || 'OFFICE').toUpperCase();
            if (m === 'CAMP') campDays++;
            else if (m === 'WFH') wfhDays++;
            else officeDays++;
          }
          continue;
        }

        // Mon-Sat:
        if (att && att.check_in_time) {
          totalMinutes += Number(att.total_working_minutes) || 0;
          if (att.status === 'Present') presentDays++;
          else if (att.status === 'Late') lateDays++;

          const m = (att.attendance_mode || 'OFFICE').toUpperCase();
          if (m === 'CAMP') campDays++;
          else if (m === 'WFH') wfhDays++;
          else officeDays++;
        } else if (hasLeave || (att && att.status === 'On Leave')) {
          onLeaveDays++;
        } else {
          // Working day without check-in or leave:
          if (dateStr < todayStr) {
            absentDays++;
          } else if (dateStr === todayStr && pastCutoffToday) {
            absentDays++;
          }
        }
      }

      const totalCheckIns = presentDays + lateDays;
      const totalHoursWorked = (totalMinutes / 60).toFixed(1);
      const avgHoursPerDay = totalCheckIns > 0 ? (totalMinutes / totalCheckIns / 60).toFixed(1) : '0.0';
      const punctualityRate = totalCheckIns > 0 ? Math.round((presentDays / totalCheckIns) * 100) : 0;

      return {
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        first_name: emp.first_name,
        last_name: emp.last_name,
        full_name: `${emp.first_name} ${emp.last_name}`,
        designation: emp.designation,
        department_name: emp.department_name || 'General',
        employee_email: emp.employee_email,
        presentDays,
        lateDays,
        absentDays,
        onLeaveDays,
        weeklyOffDays,
        officeDays,
        wfhDays,
        campDays,
        totalCheckIns,
        totalWorkingMinutes: totalMinutes,
        totalHoursWorked,
        avgHoursPerDay,
        punctualityRate
      };
    });

    // 7. Calculate organization summary
    const totalStaff = employees.length;
    let orgPresent = 0;
    let orgLate = 0;
    let orgAbsent = 0;
    let orgLeave = 0;
    let orgOffice = 0;
    let orgWfh = 0;
    let orgCamp = 0;
    let orgMinutes = 0;

    employeeReports.forEach(r => {
      orgPresent += r.presentDays;
      orgLate += r.lateDays;
      orgAbsent += r.absentDays;
      orgLeave += r.onLeaveDays;
      orgOffice += r.officeDays;
      orgWfh += r.wfhDays;
      orgCamp += r.campDays;
      orgMinutes += r.totalWorkingMinutes;
    });

    const orgCheckIns = orgPresent + orgLate;
    const orgPunctuality = orgCheckIns > 0 ? Math.round((orgPresent / orgCheckIns) * 100) : 0;
    const orgTotalHours = (orgMinutes / 60).toFixed(1);

    return res.json({
      success: true,
      month: targetMonth,
      workingDaysInfo,
      summary: {
        totalStaff,
        scheduledWorkingDays: workingDaysInfo.totalWorkingDays,
        elapsedWorkingDays: workingDaysInfo.elapsedWorkingDays,
        totalPresentCheckIns: orgPresent,
        totalLateCheckIns: orgLate,
        totalAbsentDays: orgAbsent,
        totalOnLeaveDays: orgLeave,
        totalOfficeDays: orgOffice,
        totalWfhDays: orgWfh,
        totalCampDays: orgCamp,
        totalHoursWorked: orgTotalHours,
        punctualityRate: orgPunctuality
      },
      employeeReports
    });

  } catch (error) {
    console.error('Error generating monthly report:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate monthly report from database.' });
  }
});

/**
 * POST /api/attendance/manual-adjustment
 * Admin manual adjustment for employee attendance
 */
router.post('/manual-adjustment', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { attendanceId, employeeId, attendanceDate, checkInTime, checkOutTime, status, reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason for manual adjustment is required for audit logs.' });
    }

    // Calculate working minutes if both times are present
    let workingMinutes = 0;
    if (checkInTime && checkOutTime) {
      workingMinutes = calculateWorkingMinutes(checkInTime, checkOutTime);
    }

    let targetId = attendanceId;

    if (!targetId) {
      if (!employeeId || !attendanceDate) {
        return res.status(400).json({ success: false, message: 'Employee ID and Date are required.' });
      }

      const [insertResult] = await pool.query(
        `INSERT INTO attendance (
          employee_id, attendance_date, check_in_time, check_out_time,
          total_working_minutes, status, is_manual_correction, correction_reason, corrected_by
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE
          check_in_time = VALUES(check_in_time),
          check_out_time = VALUES(check_out_time),
          total_working_minutes = VALUES(total_working_minutes),
          status = VALUES(status),
          is_manual_correction = 1,
          correction_reason = VALUES(correction_reason),
          corrected_by = VALUES(corrected_by)`,
        [
          employeeId,
          attendanceDate,
          checkInTime || null,
          checkOutTime || null,
          workingMinutes,
          status || 'Present',
          reason.trim(),
          req.user.id
        ]
      );
      targetId = insertResult.insertId;
    } else {
      const [oldRecord] = await pool.query('SELECT * FROM attendance WHERE id = ?', [targetId]);
      if (oldRecord.length === 0) {
        return res.status(404).json({ success: false, message: 'Attendance record not found.' });
      }

      const effectiveIn = checkInTime || oldRecord[0].check_in_time;
      const effectiveOut = checkOutTime || oldRecord[0].check_out_time;
      if (effectiveIn && effectiveOut) {
        workingMinutes = calculateWorkingMinutes(effectiveIn, effectiveOut);
      } else {
        workingMinutes = 0;
      }

      await pool.query(
        `UPDATE attendance SET
          check_in_time = COALESCE(?, check_in_time),
          check_out_time = COALESCE(?, check_out_time),
          total_working_minutes = ?,
          status = COALESCE(?, status),
          is_manual_correction = 1,
          correction_reason = ?,
          corrected_by = ?
         WHERE id = ?`,
        [checkInTime || null, checkOutTime || null, workingMinutes, status, reason.trim(), req.user.id, targetId]
      );

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, old_values, new_values, reason, ip_address)
         VALUES (?, 'MANUAL_ATTENDANCE_OVERRIDE', 'attendance', ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          targetId,
          JSON.stringify(oldRecord[0]),
          JSON.stringify(req.body),
          reason.trim(),
          req.ip || ''
        ]
      );
    }

    return res.json({ success: true, message: 'Attendance updated successfully with audit trail.' });
  } catch (error) {
    console.error('Error in manual adjustment:', error);
    return res.status(500).json({ success: false, message: 'Manual adjustment failed.' });
  }
});

/**
 * GET /api/attendance/export/admin
 * Export attendance records for individual employee or all employees
 * Supported formats: 'excel' (.xlsx), 'pdf' (.pdf)
 * Date filters: 'this_month', 'previous_month', 'custom'
 * Security: Strictly requires admin role
 */
router.get('/export/admin', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { format = 'excel', filterType = 'this_month', startDate, endDate, employeeId } = req.query;

    const data = await compileAttendanceData({
      employeeId: employeeId && employeeId !== 'all' ? employeeId : null,
      filterType,
      startDate,
      endDate
    });

    const isPdf = String(format).toLowerCase() === 'pdf';
    const isSingle = data.isSingleEmployee;
    const empSlug = isSingle && data.singleEmployee
      ? `${data.singleEmployee.emp_code}_${data.singleEmployee.full_name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : 'All_Staff';
    const filename = `SheWings_Attendance_${empSlug}_${data.dateRange.startDate}_to_${data.dateRange.endDate}.${isPdf ? 'pdf' : 'xlsx'}`;

    if (isPdf) {
      const pdfBuffer = await generatePdfBuffer(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    } else {
      const excelBuffer = await generateExcelBuffer(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      return res.send(excelBuffer);
    }
  } catch (error) {
    console.error('Admin attendance export error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to export attendance records.' });
  }
});

/**
 * GET /api/attendance/export/my
 * Export logged-in employee's own attendance records
 * Supported formats: 'excel' (.xlsx), 'pdf' (.pdf)
 * Date filters: 'this_month', 'previous_month', 'custom'
 * Security: Strictly scoped to req.user.employeeTableId (Zero Trust for client-provided ID)
 */
router.get('/export/my', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee record associated with this account.' });
    }

    const { format = 'excel', filterType = 'this_month', startDate, endDate } = req.query;

    // Strict self-service isolation: Pass req.user.employeeTableId directly
    const data = await compileAttendanceData({
      employeeId,
      filterType,
      startDate,
      endDate
    });

    const isPdf = String(format).toLowerCase() === 'pdf';
    const empSlug = data.singleEmployee
      ? `${data.singleEmployee.emp_code}_${data.singleEmployee.full_name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : `Staff_${employeeId}`;
    const filename = `SheWings_My_Attendance_${empSlug}_${data.dateRange.startDate}_to_${data.dateRange.endDate}.${isPdf ? 'pdf' : 'xlsx'}`;

    if (isPdf) {
      const pdfBuffer = await generatePdfBuffer(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    } else {
      const excelBuffer = await generateExcelBuffer(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      return res.send(excelBuffer);
    }
  } catch (error) {
    console.error('Employee attendance export error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to export your attendance records.' });
  }
});

/**
 * GET /api/attendance/my-history
 * Comprehensive daily attendance history for the logged-in employee
 * Returns complete daily records including Present, Absent, Late, WFH, Camp, On Leave, Weekly Off
 * Filter options: 'this_month', 'previous_month', 'custom' (startDate, endDate)
 * Security: Strictly uses req.user.employeeTableId
 */
router.get('/my-history', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.user.employeeTableId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee record associated with this account.' });
    }

    const { filterType = 'this_month', startDate, endDate } = req.query;

    const data = await compileAttendanceData({
      employeeId,
      filterType,
      startDate,
      endDate
    });

    const todayStr = getKolkataDateString();

    // For attendance history: elapsed days up to today (or all days if past/custom range)
    let historyRecords = data.records.filter(r => r.date <= todayStr);
    if (historyRecords.length === 0) {
      historyRecords = data.records;
    }

    // Always sort latest dates first (descending date order)
    historyRecords.sort((a, b) => b.date.localeCompare(a.date));

    return res.json({
      success: true,
      dateRange: data.dateRange,
      summary: data.singleEmployee,
      records: historyRecords
    });
  } catch (error) {
    console.error('Error fetching employee attendance history:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch attendance history.' });
  }
});

module.exports = router;
