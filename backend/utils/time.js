/**
 * SheWings Attendance System: Timezone and Date Utilities
 * Ensures all dates and times are evaluated in 'Asia/Kolkata' (IST, UTC+5:30)
 *
 * Official Office Rules:
 * - Reporting Time: 9:30 AM (09:30:00)
 * - 15-Minute Grace Period: 9:30 AM to 9:45 AM (inclusive)
 * - Exactly 09:45:00 AM -> ON TIME ('Present')
 * - 09:45:01 AM or later -> LATE ('Late')
 * - Monday to Friday: 9:30 AM to 6:30 PM (18:30:00)
 * - Saturday: 9:30 AM to 6:00 PM (18:00:00)
 * - Sunday: Weekly off. Employees must NOT be marked absent on Sunday.
 */

const TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current or given date string in 'YYYY-MM-DD' format according to Asia/Kolkata
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} 'YYYY-MM-DD'
 */
function getKolkataDateString(date = new Date()) {
  let d;
  if (typeof date === 'string' && date.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    d = new Date(`${date}T12:00:00+05:30`);
  } else {
    d = date instanceof Date ? date : new Date(date);
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Returns time parts, total seconds, and total minutes of the day in Asia/Kolkata
 * @param {Date|string|number} [date=new Date()]
 * @returns {{ hour: number, minute: number, second: number, totalMinutes: number, totalSeconds: number, timeString: string }}
 */
function getKolkataTime(date = new Date()) {
  let d;
  if (typeof date === 'string' && date.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    d = new Date(`${date}T12:00:00+05:30`);
  } else {
    d = date instanceof Date ? date : new Date(date);
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
  const totalMinutes = hour * 60 + minute;
  const totalSeconds = (hour * 3600) + (minute * 60) + second;
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

  return { hour, minute, second, totalMinutes, totalSeconds, timeString };
}

/**
 * Calculate total seconds from midnight for start time + grace period
 * @param {string} workStartTime 'HH:MM:SS' or 'HH:MM'
 * @param {number} gracePeriodMinutes
 * @returns {number} cutoff in seconds from midnight
 */
function getCutoffSeconds(workStartTime = '09:30:00', gracePeriodMinutes = 15) {
  const [startH, startM, startS] = (workStartTime || '09:30:00').split(':').map(Number);
  const startSeconds = (startH * 3600) + ((startM || 0) * 60) + (startS || 0);
  const graceSeconds = (Number(gracePeriodMinutes) || 0) * 60;
  return startSeconds + graceSeconds;
}

/**
 * Determines whether current Asia/Kolkata time has passed the attendance cutoff
 * Cutoff = work_start_time + grace_period_minutes (in exact seconds)
 * At exactly 9:45:00 AM, cutoff has NOT passed (still on time).
 * At 9:45:01 AM or later, cutoff has passed.
 * @param {string} workStartTime 'HH:MM:SS' or 'HH:MM'
 * @param {number} gracePeriodMinutes
 * @returns {boolean}
 */
function isPastAttendanceCutoff(workStartTime = '09:30:00', gracePeriodMinutes = 15) {
  const cutoffSec = getCutoffSeconds(workStartTime, gracePeriodMinutes);
  const current = getKolkataTime();
  return current.totalSeconds > cutoffSec;
}

/**
 * Determines whether a check-in time is 'Late' or 'Present' (On Time)
 * Rules:
 * - Reporting time: 9:30 AM
 * - Check-in from 9:30 AM to 9:45 AM, inclusive -> ON TIME ('Present')
 * - Check-in at exactly 09:45:00 AM -> ON TIME ('Present')
 * - Check-in at 09:45:01 AM or later -> LATE ('Late')
 * - Early check-in before 9:30 AM -> ON TIME ('Present')
 *
 * @param {Date|string} checkInTime
 * @param {string} workStartTime 'HH:MM:SS'
 * @param {number} gracePeriodMinutes
 * @returns {'Present'|'Late'}
 */
function determineAttendanceStatus(checkInTime, workStartTime = '09:30:00', gracePeriodMinutes = 15) {
  const cutoffSec = getCutoffSeconds(workStartTime, gracePeriodMinutes);
  const checkIn = getKolkataTime(checkInTime);

  // Exact boundary comparison:
  // <= cutoffSec (e.g. 35100s for 09:45:00) is ON TIME ('Present')
  // > cutoffSec (e.g. 35101s for 09:45:01) is LATE ('Late')
  return checkIn.totalSeconds > cutoffSec ? 'Late' : 'Present';
}

/**
 * Returns Day of Week in Asia/Kolkata: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 * @param {Date|string|number} [date=new Date()]
 * @returns {number} 0-6
 */
function getKolkataDayOfWeek(date = new Date()) {
  let d;
  if (typeof date === 'string' && date.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    d = new Date(`${date}T12:00:00+05:30`);
  } else {
    d = date instanceof Date ? date : new Date(date);
  }

  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short'
  }).format(d);

  const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  return dayMap[dayStr] !== undefined ? dayMap[dayStr] : d.getDay();
}

/**
 * Returns true if the date is a Sunday in Asia/Kolkata
 * @param {Date|string|number} [date=new Date()]
 * @returns {boolean}
 */
function isSunday(date = new Date()) {
  return getKolkataDayOfWeek(date) === 0;
}

/**
 * Returns true if the date is a Saturday in Asia/Kolkata
 * @param {Date|string|number} [date=new Date()]
 * @returns {boolean}
 */
function isSaturday(date = new Date()) {
  return getKolkataDayOfWeek(date) === 6;
}

/**
 * Returns the scheduled office hours for a given date
 * Mon-Fri: 9:30 AM to 6:30 PM (9h scheduled)
 * Sat: 9:30 AM to 6:00 PM (8.5h scheduled)
 * Sun: Weekly off (0h scheduled)
 *
 * @param {Date|string|number} [date=new Date()]
 * @param {object} [settings={}]
 */
function getScheduledOfficeHours(date = new Date(), settings = {}) {
  const dayOfWeek = getKolkataDayOfWeek(date);
  const startTime = settings.work_start_time || '09:30:00';
  const monFriEndTime = settings.work_end_time || '18:30:00';
  const saturdayEndTime = settings.saturday_end_time || '18:00:00';

  if (dayOfWeek === 0) {
    return {
      isWeeklyOff: true,
      dayName: 'Sunday',
      startTime: null,
      endTime: null,
      scheduledHours: 0,
      formattedHours: 'Weekly Off',
      description: 'Sunday (Weekly Off)'
    };
  }

  if (dayOfWeek === 6) {
    return {
      isWeeklyOff: false,
      dayName: 'Saturday',
      startTime,
      endTime: saturdayEndTime,
      scheduledHours: 8.5,
      formattedHours: '8h 30m',
      description: 'Saturday Timing (9:30 AM - 6:00 PM)'
    };
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    isWeeklyOff: false,
    dayName: dayNames[dayOfWeek],
    startTime,
    endTime: monFriEndTime,
    scheduledHours: 9.0,
    formattedHours: '9h 00m',
    description: 'Monday to Friday Timing (9:30 AM - 6:30 PM)'
  };
}

/**
 * Safely parses any date or timestamp representation into a JavaScript Date object,
 * ensuring naive datetime strings (e.g. "2026-10-26 16:06:54" from MySQL)
 * are accurately interpreted in 'Asia/Kolkata' (IST, UTC+05:30).
 *
 * @param {Date|string|number} dateValue
 * @returns {Date|null}
 */
function parseISTDate(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return isNaN(dateValue.getTime()) ? null : dateValue;
  if (typeof dateValue === 'number') return new Date(dateValue);
  if (typeof dateValue !== 'string') return null;

  const trimmed = dateValue.trim();
  if (!trimmed) return null;

  // Already an ISO string with Z or explicit timezone offset (+HH:MM / -HH:MM)
  if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // Date-only string "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00+05:30`);
    return isNaN(d.getTime()) ? null : d;
  }

  // Datetime string without offset like "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss"
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(trimmed)) {
    const normalized = trimmed.replace(' ', 'T');
    const d = new Date(`${normalized}+05:30`);
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Calculate actual worked time between recorded check-in and check-out timestamps
 * - Returns 0 if check-out time is missing (does NOT assume worked whole day)
 * - Does NOT automatically deduct lunch breaks
 * @param {Date|string} checkInTime
 * @param {Date|string} checkOutTime
 * @returns {number} working minutes
 */
function calculateWorkingMinutes(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return 0;
  const inDate = parseISTDate(checkInTime);
  const outDate = parseISTDate(checkOutTime);
  if (!inDate || !outDate) return 0;
  const inMs = inDate.getTime();
  const outMs = outDate.getTime();
  if (isNaN(inMs) || isNaN(outMs) || outMs <= inMs) return 0;
  return Math.round((outMs - inMs) / (1000 * 60));
}

/**
 * Calculate working days in a month (Monday to Saturday, excluding Sundays)
 * Also calculates elapsed working days up to today if looking at current month
 * @param {string} monthStr 'YYYY-MM'
 * @returns {{ totalWorkingDays: number, elapsedWorkingDays: number, totalCalendarDays: number, sundaysCount: number }}
 */
function getWorkingDaysInMonth(monthStr) {
  const [yearStr, monthNumStr] = (monthStr || getKolkataDateString().substring(0, 7)).split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10); // 1-12

  // Total days in month
  const totalCalendarDays = new Date(year, month, 0).getDate();
  const todayStr = getKolkataDateString();
  const currentMonthPrefix = todayStr.substring(0, 7);
  const currentDay = parseInt(todayStr.substring(8, 10), 10);

  let totalWorkingDays = 0;
  let elapsedWorkingDays = 0;
  let sundaysCount = 0;

  for (let d = 1; d <= totalCalendarDays; d++) {
    const dayStr = `${yearStr}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = getKolkataDayOfWeek(dayStr);
    const isSun = dayOfWeek === 0;

    if (isSun) {
      sundaysCount++;
    } else {
      totalWorkingDays++;
      if (monthStr === currentMonthPrefix) {
        if (d <= currentDay) {
          elapsedWorkingDays++;
        }
      } else if (monthStr < currentMonthPrefix) {
        elapsedWorkingDays++;
      }
    }
  }

  return {
    month: monthStr,
    totalCalendarDays,
    totalWorkingDays,
    elapsedWorkingDays,
    sundaysCount
  };
}

module.exports = {
  TIMEZONE,
  getKolkataDateString,
  getKolkataTime,
  parseISTDate,
  getCutoffSeconds,
  isPastAttendanceCutoff,
  determineAttendanceStatus,
  getKolkataDayOfWeek,
  isSunday,
  isSaturday,
  getScheduledOfficeHours,
  calculateWorkingMinutes,
  getWorkingDaysInMonth
};
