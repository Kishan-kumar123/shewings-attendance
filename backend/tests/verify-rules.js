const pool = require('../database/db');
const timeUtils = require('../utils/time');

async function runTests() {
  console.log('=== SHEWINGS ATTENDANCE VERIFICATION SUITE ===\n');

  // 1. Office Timings verification
  const [settingsRows] = await pool.query('SELECT * FROM office_settings WHERE id = 1');
  const settings = settingsRows[0];
  console.log('1. Office Timings in Database:');
  console.log(`   - Start time: ${settings.work_start_time}`);
  console.log(`   - Grace period: ${settings.grace_period_minutes} mins`);
  console.log(`   - Mon-Fri Closing: ${settings.work_end_time}`);
  console.log(`   - Saturday Closing: ${settings.saturday_end_time}`);

  if (settings.work_start_time !== '09:30:00' || settings.work_end_time !== '18:30:00' || settings.saturday_end_time !== '18:00:00') {
    throw new Error('Office timings do not match requirements!');
  }
  console.log('   [PASS] Office timings configured correctly.\n');

  // 2. Grace Period Boundaries
  console.log('2. Grace Period Boundaries (Reporting 9:30 AM, 15 min grace):');
  const boundaryCases = [
    { time: '2026-10-23T09:15:00+05:30', expected: 'Present', label: '09:15:00 (Early)' },
    { time: '2026-10-23T09:30:00+05:30', expected: 'Present', label: '09:30:00 (Start Time)' },
    { time: '2026-10-23T09:44:59+05:30', expected: 'Present', label: '09:44:59 (Within Grace Period)' },
    { time: '2026-10-23T09:45:00+05:30', expected: 'Present', label: '09:45:00 (Exact Cutoff Boundary)' },
    { time: '2026-10-23T09:45:01+05:30', expected: 'Late', label: '09:45:01 (Cutoff Boundary + 1s)' },
    { time: '2026-10-23T09:45:30+05:30', expected: 'Late', label: '09:45:30 (Late)' },
    { time: '2026-10-23T10:00:00+05:30', expected: 'Late', label: '10:00:00 (Late)' }
  ];

  for (const c of boundaryCases) {
    const status = timeUtils.determineAttendanceStatus(c.time, settings.work_start_time, settings.grace_period_minutes);
    const pass = status === c.expected;
    console.log(`   ${pass ? '[PASS]' : '[FAIL]'} ${c.label} -> ${status} (expected ${c.expected})`);
    if (!pass) throw new Error(`Boundary test failed for ${c.label}`);
  }
  console.log('   [PASS] All boundary checks passed strictly.\n');

  // 3. Sunday Weekly Off Rules
  console.log('3. Sunday Weekly Off Rules:');
  const sundayStr = '2026-10-25'; // October 25, 2026 is a Sunday
  const isSun = timeUtils.isSunday(sundayStr);
  console.log(`   - ${sundayStr} isSunday: ${isSun}`);
  if (!isSun) throw new Error('Sunday check failed for 2026-10-25');

  const sunSchedule = timeUtils.getScheduledOfficeHours(sundayStr, settings);
  console.log(`   - Scheduled hours: ${sunSchedule.scheduledHours}`);
  console.log(`   - Weekly off flag: ${sunSchedule.isWeeklyOff}`);
  if (!sunSchedule.isWeeklyOff || sunSchedule.scheduledHours !== 0) {
    throw new Error('Sunday schedule does not mark weekly off!');
  }
  console.log('   [PASS] Sunday is correctly recognized as weekly off.\n');

  // 4. Saturday Scheduled Hours
  console.log('4. Saturday Working Hours:');
  const satStr = '2026-10-24'; // October 24, 2026 is a Saturday
  const satSchedule = timeUtils.getScheduledOfficeHours(satStr, settings);
  console.log(`   - Saturday start: ${satSchedule.startTime}`);
  console.log(`   - Saturday closing: ${satSchedule.endTime}`);
  console.log(`   - Saturday scheduled hours: ${satSchedule.scheduledHours} (${satSchedule.formattedHours})`);
  if (satSchedule.startTime !== '09:30:00' || satSchedule.endTime !== '18:00:00' || satSchedule.scheduledHours !== 8.5) {
    throw new Error('Saturday working window mismatch!');
  }
  console.log('   [PASS] Saturday working hours verified.\n');

  // 5. Monday-Friday Scheduled Hours
  console.log('5. Monday to Friday Working Hours:');
  const friStr = '2026-10-23'; // Friday
  const friSchedule = timeUtils.getScheduledOfficeHours(friStr, settings);
  console.log(`   - Weekday start: ${friSchedule.startTime}`);
  console.log(`   - Weekday closing: ${friSchedule.endTime}`);
  console.log(`   - Weekday scheduled hours: ${friSchedule.scheduledHours} (${friSchedule.formattedHours})`);
  if (friSchedule.startTime !== '09:30:00' || friSchedule.endTime !== '18:30:00' || friSchedule.scheduledHours !== 9.0) {
    throw new Error('Weekday working window mismatch!');
  }
  console.log('   [PASS] Weekday working hours verified.\n');

  // 6. Actual Working Minutes calculation
  console.log('6. Working Duration Calculation:');
  const checkIn = '2026-10-23T09:30:00+05:30';
  const checkOut = '2026-10-23T18:30:00+05:30';
  const workedMins = timeUtils.calculateWorkingMinutes(checkIn, checkOut);
  console.log(`   - 9:30 AM to 6:30 PM worked minutes: ${workedMins} (${(workedMins/60).toFixed(1)} hrs)`);
  if (workedMins !== 540) throw new Error('Working minutes calculation failed!');

  // No checkout = 0 worked minutes
  const noCheckOutMins = timeUtils.calculateWorkingMinutes(checkIn, null);
  console.log(`   - No check-out worked minutes: ${noCheckOutMins}`);
  if (noCheckOutMins !== 0) throw new Error('Must not assume full day without checkout!');
  console.log('   [PASS] Actual worked duration verified.\n');

  // 7. Month Working Days Calculation (Sundays excluded)
  console.log('7. Monthly Working Days Calculation (Oct 2026):');
  const monthInfo = timeUtils.getWorkingDaysInMonth('2026-10');
  console.log(`   - Total calendar days: ${monthInfo.totalCalendarDays}`);
  console.log(`   - Sundays count: ${monthInfo.sundaysCount}`);
  console.log(`   - Total working days (Mon-Sat): ${monthInfo.totalWorkingDays}`);
  console.log(`   - Elapsed working days up to Oct 23: ${monthInfo.elapsedWorkingDays}`);
  if (monthInfo.totalWorkingDays !== 27 || monthInfo.sundaysCount !== 4) {
    throw new Error('Month working days calculation mismatch!');
  }
  console.log('   [PASS] Monthly working days correctly excludes Sundays.\n');

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
