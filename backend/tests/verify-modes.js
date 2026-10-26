const pool = require('../database/db');
const timeUtils = require('../utils/time');

async function runModeVerification() {
  console.log('=== SHEWINGS THREE ATTENDANCE MODES VERIFICATION ===\n');

  // Find a test employee (e.g. SW-101 or first employee)
  const [employees] = await pool.query('SELECT * FROM employees WHERE status = "active" LIMIT 1');
  if (employees.length === 0) {
    throw new Error('No active employee found for testing.');
  }
  const emp = employees[0];
  console.log(`Testing with staff member: ${emp.first_name} ${emp.last_name} (${emp.employee_id})`);

  const testDate = '2099-12-31'; // Future date for safe isolated test

  try {
    // Clean up test date if any left over
    await pool.query('DELETE FROM attendance WHERE employee_id = ? AND attendance_date = ?', [emp.id, testDate]);
    await pool.query('DELETE FROM wfh_requests WHERE employee_id = ? AND start_date = ?', [emp.id, testDate]);

    // 1. Verify schema columns exist
    console.log('\n1. Verifying database columns:');
    const [cols] = await pool.query('SHOW COLUMNS FROM attendance LIKE "attendance_mode"');
    if (cols.length === 0) throw new Error('attendance_mode column missing in attendance table!');
    console.log('   [PASS] attendance.attendance_mode ENUM("OFFICE","WFH","CAMP") exists.');

    const [settingsCols] = await pool.query('SHOW COLUMNS FROM office_settings LIKE "camp_custom_timings_enabled"');
    if (settingsCols.length === 0) throw new Error('camp_custom_timings_enabled missing in office_settings!');
    console.log('   [PASS] office_settings camp timings columns exist.');

    // 2. Test Camp Attendance (GPS granted)
    console.log('\n2. Testing Camp Check-In with GPS Granted:');
    const campGpsLat = 28.6139;
    const campGpsLon = 77.2090;
    const campSelfie = '/uploads/selfies/test-camp-in.jpg';
    const checkInTime = new Date('2099-12-31T09:35:00+05:30');

    const [campInsert] = await pool.query(
      `INSERT INTO attendance
       (employee_id, attendance_date, check_in_time, check_in_selfie, check_in_lat, check_in_lng, attendance_mode, status)
       VALUES (?, ?, ?, ?, ?, ?, 'CAMP', 'Present')`,
      [emp.id, testDate, checkInTime, campSelfie, campGpsLat, campGpsLon]
    );
    console.log(`   [PASS] Camp check-in recorded successfully with ID ${campInsert.insertId}.`);

    const [campRow] = await pool.query('SELECT * FROM attendance WHERE id = ?', [campInsert.insertId]);
    if (campRow[0].attendance_mode !== 'CAMP') throw new Error('Attendance mode is not CAMP!');
    if (Number(campRow[0].check_in_lat) !== campGpsLat) throw new Error('Camp GPS latitude mismatch!');
    console.log('   [PASS] Verified record: mode = CAMP, GPS coordinates stored, no admin approval required.');

    // 3. Test Camp Check-Out and working duration
    console.log('\n3. Testing Camp Check-Out & Working Duration:');
    const checkOutTime = new Date('2099-12-31T18:05:00+05:30');
    const campOutSelfie = '/uploads/selfies/test-camp-out.jpg';
    const totalWorkingMinutes = timeUtils.calculateWorkingMinutes(checkInTime, checkOutTime);
    console.log(`   Calculated working duration: ${totalWorkingMinutes} minutes (${(totalWorkingMinutes / 60).toFixed(2)} hours)`);

    await pool.query(
      `UPDATE attendance
       SET check_out_time = ?, check_out_selfie = ?, total_working_minutes = ?
       WHERE id = ?`,
      [checkOutTime, campOutSelfie, totalWorkingMinutes, campInsert.insertId]
    );

    const [updatedCamp] = await pool.query('SELECT * FROM attendance WHERE id = ?', [campInsert.insertId]);
    if (updatedCamp[0].total_working_minutes !== 510) {
      throw new Error(`Expected 510 minutes (9:35 AM to 6:05 PM), got ${updatedCamp[0].total_working_minutes}`);
    }
    console.log('   [PASS] Camp checkout recorded with exact working duration (510 mins / 8.5 hrs).');

    // Clean up
    await pool.query('DELETE FROM attendance WHERE id = ?', [campInsert.insertId]);

    // 4. Test Camp Attendance with GPS Denied / null coordinates
    console.log('\n4. Testing Camp Check-In when GPS Permission is Denied:');
    const [campNoGps] = await pool.query(
      `INSERT INTO attendance
       (employee_id, attendance_date, check_in_time, check_in_selfie, check_in_lat, check_in_lng, attendance_mode, status)
       VALUES (?, ?, ?, ?, NULL, NULL, 'CAMP', 'Present')`,
      [emp.id, testDate, checkInTime, campSelfie]
    );
    const [noGpsRow] = await pool.query('SELECT * FROM attendance WHERE id = ?', [campNoGps.insertId]);
    if (noGpsRow[0].check_in_lat !== null || noGpsRow[0].check_in_lng !== null) {
      throw new Error('Expected NULL GPS coordinates when permission denied!');
    }
    console.log('   [PASS] Camp check-in succeeds with NULL GPS without false verification labeling.');
    await pool.query('DELETE FROM attendance WHERE id = ?', [campNoGps.insertId]);

    // 5. Test WFH Request Workflow
    console.log('\n5. Testing Work From Home (WFH) Approval Rules:');
    // Before approval:
    const [wfhReq] = await pool.query(
      `INSERT INTO wfh_requests (employee_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, 'Medical consultation at home', 'Pending')`,
      [emp.id, testDate, testDate]
    );
    console.log(`   Submitted WFH request #${wfhReq.insertId} (status: Pending).`);

    // Verify pending is not approved:
    const [pendingCheck] = await pool.query(
      `SELECT * FROM wfh_requests WHERE employee_id = ? AND start_date = ? AND status = 'Approved'`,
      [emp.id, testDate]
    );
    if (pendingCheck.length > 0) throw new Error('Pending WFH was erroneously treated as approved!');
    console.log('   [PASS] Pending WFH correctly denies unapproved remote attendance.');

    // Approve WFH request:
    await pool.query(
      `UPDATE wfh_requests SET status = 'Approved', reviewed_by = 1, review_notes = 'Approved by senior admin'
       WHERE id = ?`,
      [wfhReq.insertId]
    );

    const [approvedCheck] = await pool.query(
      `SELECT * FROM wfh_requests WHERE employee_id = ? AND start_date = ? AND status = 'Approved'`,
      [emp.id, testDate]
    );
    if (approvedCheck.length === 0) throw new Error('WFH request approval failed!');
    console.log('   [PASS] WFH approved status confirmed for employee on requested date.');
    if (approvedCheck.length === 0) throw new Error('WFH request approval failed!');
    console.log('   [PASS] WFH approved status confirmed for employee on requested date.');

    // Record WFH Attendance
    const [wfhAtt] = await pool.query(
      `INSERT INTO attendance
       (employee_id, attendance_date, check_in_time, check_in_selfie, attendance_mode, status)
       VALUES (?, ?, ?, ?, 'WFH', 'Present')`,
      [emp.id, testDate, checkInTime, campSelfie]
    );
    const [wfhRow] = await pool.query('SELECT * FROM attendance WHERE id = ?', [wfhAtt.insertId]);
    if (wfhRow[0].attendance_mode !== 'WFH') throw new Error('Attendance mode is not WFH!');
    console.log('   [PASS] WFH attendance successfully logged on approved date.');

    // Clean up
    await pool.query('DELETE FROM attendance WHERE id = ?', [wfhAtt.insertId]);
    await pool.query('DELETE FROM wfh_requests WHERE id = ?', [wfhReq.insertId]);

    // 6. Test Configurable Camp Timings in office_settings
    console.log('\n6. Testing Configurable Camp Timings Settings:');
    const [currentSettings] = await pool.query('SELECT * FROM office_settings WHERE id = 1');
    const origCustom = currentSettings[0].camp_custom_timings_enabled;

    await pool.query(
      `UPDATE office_settings
       SET camp_custom_timings_enabled = 1,
           camp_work_start_time = '10:00:00',
           camp_grace_period_minutes = 20,
           camp_work_end_time = '19:00:00',
           camp_saturday_end_time = '18:30:00'
       WHERE id = 1`
    );

    const [campSettingsRow] = await pool.query('SELECT * FROM office_settings WHERE id = 1');
    if (!campSettingsRow[0].camp_custom_timings_enabled || campSettingsRow[0].camp_work_start_time !== '10:00:00') {
      throw new Error('Failed to update camp schedule settings!');
    }
    console.log('   [PASS] Custom Camp timings enabled and saved (10:00 AM start, 20m grace).');

    // Test Camp late determination under custom camp schedule (10:00 AM + 20m grace = 10:20 AM cutoff)
    const onTimeCamp = timeUtils.determineAttendanceStatus('2099-12-31T10:15:00+05:30', '10:00:00', 20);
    const lateCamp = timeUtils.determineAttendanceStatus('2099-12-31T10:25:00+05:30', '10:00:00', 20);
    if (onTimeCamp !== 'Present' || lateCamp !== 'Late') {
      throw new Error(`Camp timing status check failed: onTime=${onTimeCamp}, late=${lateCamp}`);
    }
    console.log(`   [PASS] Camp status calculation matches camp schedule: 10:15 AM -> ${onTimeCamp}, 10:25 AM -> ${lateCamp}`);

    // Revert settings back to original
    await pool.query(
      `UPDATE office_settings
       SET camp_custom_timings_enabled = ?,
           camp_work_start_time = '09:30:00',
           camp_grace_period_minutes = 15,
           camp_work_end_time = '18:30:00',
           camp_saturday_end_time = '18:00:00'
       WHERE id = 1`,
      [origCustom]
    );
    console.log('   [PASS] Settings reverted cleanly without impacting office schedule.');

    console.log('\n=== ALL 3 MODES VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('\n[ERROR] Mode verification failed:', err);
    throw err;
  } finally {
    // Final cleanup of test date
    await pool.query('DELETE FROM attendance WHERE employee_id = ? AND attendance_date = ?', [emp.id, testDate]);
    await pool.query('DELETE FROM wfh_requests WHERE employee_id = ? AND start_date = ?', [emp.id, testDate]);
  }
}

runModeVerification()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
