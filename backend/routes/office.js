const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getScheduledOfficeHours } = require('../utils/time');

/**
 * GET /api/office/settings
 * Accessible by authenticated users to verify geofence parameters and official timings
 */
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Office settings not configured.' });
    }

    const settings = rows[0];
    const todaySchedule = getScheduledOfficeHours(new Date(), settings);

    return res.json({
      success: true,
      settings: settings,
      todaySchedule,
      officialTimings: {
        mondayToFriday: {
          start: settings.work_start_time || '09:30:00',
          end: settings.work_end_time || '18:30:00',
          label: '9:30 AM - 6:30 PM'
        },
        saturday: {
          start: settings.work_start_time || '09:30:00',
          end: settings.saturday_end_time || '18:00:00',
          label: '9:30 AM - 6:00 PM'
        },
        sunday: {
          isWeeklyOff: true,
          label: 'Weekly Off (Do not mark employees absent)'
        },
        gracePeriod: {
          minutes: settings.grace_period_minutes || 15,
          onTimeCutoff: '09:45:00',
          label: '15-minute grace period (9:30 AM to 9:45 AM inclusive ON TIME; 9:45:01 AM+ LATE)'
        }
      },
      campTimings: {
        customTimingsEnabled: Boolean(settings.camp_custom_timings_enabled),
        workStartTime: settings.camp_work_start_time || '09:30:00',
        gracePeriodMinutes: settings.camp_grace_period_minutes || 15,
        workEndTime: settings.camp_work_end_time || '18:30:00',
        saturdayEndTime: settings.camp_saturday_end_time || '18:00:00'
      }
    });
  } catch (error) {
    console.error('Error fetching office settings:', error);
    return res.status(500).json({ success: false, message: 'Error fetching office settings.' });
  }
});

/**
 * PUT /api/office/settings
 * Admin only: Update office location, geofence radius, work timings, and camp timings
 */
router.put('/settings', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      organization_name,
      office_name,
      office_address,
      latitude,
      longitude,
      allowed_radius_meters,
      work_start_time,
      grace_period_minutes,
      work_end_time,
      saturday_end_time,
      camp_custom_timings_enabled,
      camp_work_start_time,
      camp_grace_period_minutes,
      camp_work_end_time,
      camp_saturday_end_time,
      min_hours_half_day,
      min_hours_full_day
    } = req.body;

    // Fetch old values for audit log
    const [oldRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    const oldValues = oldRows[0] || null;
    const targetId = oldValues?.id || 1;

    await pool.query(
      `UPDATE office_settings SET
        organization_name = COALESCE(?, organization_name),
        office_name = COALESCE(?, office_name),
        office_address = COALESCE(?, office_address),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        allowed_radius_meters = COALESCE(?, allowed_radius_meters),
        work_start_time = COALESCE(?, work_start_time),
        grace_period_minutes = COALESCE(?, grace_period_minutes),
        work_end_time = COALESCE(?, work_end_time),
        saturday_end_time = COALESCE(?, saturday_end_time),
        camp_custom_timings_enabled = COALESCE(?, camp_custom_timings_enabled),
        camp_work_start_time = COALESCE(?, camp_work_start_time),
        camp_grace_period_minutes = COALESCE(?, camp_grace_period_minutes),
        camp_work_end_time = COALESCE(?, camp_work_end_time),
        camp_saturday_end_time = COALESCE(?, camp_saturday_end_time),
        min_hours_half_day = COALESCE(?, min_hours_half_day),
        min_hours_full_day = COALESCE(?, min_hours_full_day),
        updated_by = ?
       WHERE id = ?`,
      [
        organization_name,
        office_name,
        office_address,
        latitude,
        longitude,
        allowed_radius_meters,
        work_start_time,
        grace_period_minutes,
        work_end_time,
        saturday_end_time,
        camp_custom_timings_enabled !== undefined ? (camp_custom_timings_enabled ? 1 : 0) : null,
        camp_work_start_time,
        camp_grace_period_minutes,
        camp_work_end_time,
        camp_saturday_end_time,
        min_hours_half_day,
        min_hours_full_day,
        req.user.id,
        targetId
      ]
    );

    // Record audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_user_id, action_type, entity_name, entity_id, old_values, new_values, ip_address)
       VALUES (?, 'UPDATE_OFFICE_SETTINGS', 'office_settings', 1, ?, ?, ?)`,
      [
        req.user.id,
        JSON.stringify(oldValues),
        JSON.stringify(req.body),
        req.ip || null
      ]
    );

    const [updatedRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
    const updatedSettings = updatedRows[0];
    const todaySchedule = getScheduledOfficeHours(new Date(), updatedSettings);

    return res.json({
      success: true,
      message: 'Office settings updated successfully.',
      settings: updatedSettings,
      todaySchedule
    });
  } catch (error) {
    console.error('Error updating office settings:', error);
    return res.status(500).json({ success: false, message: 'Failed to update office settings.' });
  }
});

module.exports = router;
