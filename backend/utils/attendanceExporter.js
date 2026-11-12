/**
 * SheWings Foundation: Attendance Export Engine
 * Generates official PDF and Excel (.xlsx) reports with SheWings branding.
 *
 * Supports:
 * - Individual employee attendance report
 * - All employees consolidated attendance report
 * - Date ranges: This Month, Previous Month, and Custom Date Range
 * - Metrics: Present, Late, Absent, WFH, Camp, On Leave, Weekly Off
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../database/db');
const {
  getKolkataDateString,
  getKolkataTime,
  parseISTDate,
  isSunday,
  getKolkataDayOfWeek,
  isPastAttendanceCutoff,
  calculateWorkingMinutes,
  getScheduledOfficeHours
} = require('./time');

/**
 * Format a datetime into standard IST 12-hour display time (e.g. "09:30 AM")
 */
function formatTime12(dateStr) {
  if (!dateStr) return '--:--';
  const d = parseISTDate(dateStr);
  if (!d) return '--:--';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Resolves date filters into concrete startDate and endDate (in YYYY-MM-DD IST)
 */
function resolveDateRange(filterType, customStart, customEnd) {
  const todayStr = getKolkataDateString();
  const [currentYear, currentMonth] = todayStr.split('-').map(Number);

  if (filterType === 'previous_month') {
    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevMonthPadded = String(prevMonth).padStart(2, '0');
    const lastDay = new Date(prevYear, prevMonth, 0).getDate();
    return {
      filterType: 'previous_month',
      startDate: `${prevYear}-${prevMonthPadded}-01`,
      endDate: `${prevYear}-${prevMonthPadded}-${String(lastDay).padStart(2, '0')}`,
      label: `Previous Month (${prevYear}-${prevMonthPadded})`
    };
  }

  if (filterType === 'custom' && customStart && customEnd) {
    const s = customStart.trim().split('T')[0];
    const e = customEnd.trim().split('T')[0];
    if (s <= e) {
      return {
        filterType: 'custom',
        startDate: s,
        endDate: e,
        label: `Custom Period (${s} to ${e})`
      };
    }
  }

  // Default: 'this_month'
  const currentMonthPadded = String(currentMonth).padStart(2, '0');
  const lastDayCurrent = new Date(currentYear, currentMonth, 0).getDate();
  return {
    filterType: 'this_month',
    startDate: `${currentYear}-${currentMonthPadded}-01`,
    endDate: `${currentYear}-${currentMonthPadded}-${String(lastDayCurrent).padStart(2, '0')}`,
    label: `This Month (${currentYear}-${currentMonthPadded})`
  };
}

/**
 * Compiles day-by-day attendance records for employees over a date range
 * Incorporates actual check-ins, approved leaves, Sunday weekly-offs, and Absent rules.
 */
async function compileAttendanceData({ employeeId = null, filterType = 'this_month', startDate = null, endDate = null }) {
  const range = resolveDateRange(filterType, startDate, endDate);
  const todayStr = getKolkataDateString();

  // 1. Fetch office settings
  const [settingsRows] = await pool.query('SELECT * FROM office_settings ORDER BY id ASC LIMIT 1');
  const settings = settingsRows[0] || {
    organization_name: 'SheWings Foundation',
    office_name: 'SheWings Foundation HQ',
    office_address: 'Sector 62, Noida, Uttar Pradesh, 201309, India',
    work_start_time: '09:30:00',
    grace_period_minutes: 15,
    work_end_time: '18:30:00',
    saturday_end_time: '18:00:00'
  };

  // 2. Fetch employee(s)
  let empQuery = `
    SELECT e.id as employee_id, e.employee_id as emp_code, e.first_name, e.last_name, e.designation,
           e.department_id, d.name as department_name, u.email as employee_email, e.phone
    FROM employees e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.status = 'active'
  `;
  const empParams = [];
  if (employeeId && employeeId !== 'all') {
    empQuery += ` AND e.id = ?`;
    empParams.push(parseInt(employeeId, 10));
  }
  empQuery += ` ORDER BY e.first_name ASC, e.last_name ASC`;

  const [employees] = await pool.query(empQuery, empParams);
  if (employees.length === 0) {
    throw new Error('No employee record found matching the criteria.');
  }

  // 3. Fetch attendance records in date range
  const empIds = employees.map(e => e.employee_id);
  const [attendanceRows] = await pool.query(
    `SELECT * FROM attendance
     WHERE employee_id IN (?) AND attendance_date >= ? AND attendance_date <= ?
     ORDER BY attendance_date ASC`,
    [empIds, range.startDate, range.endDate]
  );

  const attMap = new Map(); // key: `${empId}_${dateStr}`
  attendanceRows.forEach(r => {
    const dStr = typeof r.attendance_date === 'string'
      ? r.attendance_date.split('T')[0]
      : getKolkataDateString(r.attendance_date);
    attMap.set(`${r.employee_id}_${dStr}`, r);
  });

  // 4. Fetch approved leaves overlapping range
  const [leaveRows] = await pool.query(
    `SELECT employee_id, leave_type, reason, start_date, end_date
     FROM leave_requests
     WHERE employee_id IN (?) AND status = 'Approved'
       AND NOT (end_date < ? OR start_date > ?)`,
    [empIds, range.startDate, range.endDate]
  );

  const pastCutoffToday = isPastAttendanceCutoff(settings.work_start_time, settings.grace_period_minutes);

  // 5. Build date list
  const dateList = [];
  let cur = new Date(`${range.startDate}T12:00:00+05:30`);
  const endD = new Date(`${range.endDate}T12:00:00+05:30`);
  while (cur <= endD) {
    dateList.push(getKolkataDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // 6. Compile rows and summaries
  const compiledRecords = [];
  const employeeSummaries = [];

  for (const emp of employees) {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let onLeaveCount = 0;
    let weeklyOffCount = 0;
    let officeCount = 0;
    let wfhCount = 0;
    let campCount = 0;
    let totalMinutesWorked = 0;

    for (const dStr of dateList) {
      const isSun = isSunday(dStr);
      const dayOfWeekIdx = getKolkataDayOfWeek(dStr);
      const dayName = dayNames[dayOfWeekIdx];
      const att = attMap.get(`${emp.employee_id}_${dStr}`);

      // Check leave
      const leave = leaveRows.find(l => {
        if (l.employee_id !== emp.employee_id) return false;
        const s = typeof l.start_date === 'string' ? l.start_date.split('T')[0] : getKolkataDateString(l.start_date);
        const e = typeof l.end_date === 'string' ? l.end_date.split('T')[0] : getKolkataDateString(l.end_date);
        return dStr >= s && dStr <= e;
      });

      let status = 'Absent';
      let mode = null;
      let checkInTime = null;
      let checkOutTime = null;
      let workingMinutes = 0;
      let notes = '';

      if (att && att.check_in_time) {
        mode = att.attendance_mode || 'OFFICE';
        status = att.status; // 'Present' or 'Late'
        checkInTime = att.check_in_time;
        checkOutTime = att.check_out_time;
        workingMinutes = Number(att.total_working_minutes) || 0;
        notes = att.notes || (att.is_manual_correction ? `Manual Adjustment: ${att.correction_reason || ''}` : '');

        if (status === 'Present') presentCount++;
        else if (status === 'Late') lateCount++;
        else presentCount++;

        if (mode === 'CAMP') campCount++;
        else if (mode === 'WFH') wfhCount++;
        else officeCount++;

        totalMinutesWorked += workingMinutes;
      } else if (att && att.status === 'On Leave') {
        status = 'On Leave';
        notes = att.notes || 'Approved Leave';
        onLeaveCount++;
      } else if (leave) {
        status = 'On Leave';
        notes = `Approved ${leave.leave_type} Leave: ${leave.reason || ''}`.trim();
        onLeaveCount++;
      } else if (isSun) {
        status = 'Weekly Off';
        notes = 'Sunday Weekly Off';
        weeklyOffCount++;
      } else {
        // Monday-Saturday without check-in
        if (dStr < todayStr) {
          status = 'Absent';
          notes = 'Absent (No check-in recorded)';
          absentCount++;
        } else if (dStr === todayStr) {
          if (pastCutoffToday) {
            status = 'Absent';
            notes = 'Absent (Cutoff window closed)';
            absentCount++;
          } else {
            status = 'Pending';
            notes = 'Reporting window open';
          }
        } else {
          status = 'Scheduled';
          notes = 'Scheduled working day';
        }
      }

      const hoursWorked = workingMinutes > 0 ? (workingMinutes / 60).toFixed(2) : '0.00';
      const formattedDuration = workingMinutes > 0
        ? `${Math.floor(workingMinutes / 60)}h ${workingMinutes % 60}m`
        : (checkInTime && !checkOutTime && dStr === todayStr ? 'Active Shift' : '--');

      compiledRecords.push({
        id: att ? att.id : null,
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        full_name: `${emp.first_name} ${emp.last_name}`,
        department_name: emp.department_name || 'General',
        designation: emp.designation,
        employee_email: emp.employee_email,
        date: dStr,
        day: dayName,
        attendance_mode: mode || '--',
        status,
        check_in_raw: checkInTime,
        check_out_raw: checkOutTime,
        check_in_display: formatTime12(checkInTime),
        check_out_display: checkOutTime ? formatTime12(checkOutTime) : (checkInTime && dStr === todayStr ? 'Active Shift' : '--:--'),
        check_in_selfie: att ? (att.check_in_selfie || null) : null,
        check_out_selfie: att ? (att.check_out_selfie || null) : null,
        check_in_lat: att ? (att.check_in_lat ?? null) : null,
        check_in_lng: att ? (att.check_in_lng ?? null) : null,
        check_in_distance_m: att ? (att.check_in_distance_m ?? null) : null,
        working_minutes: workingMinutes,
        hours_worked: hoursWorked,
        formatted_duration: formattedDuration,
        notes
      });
    }

    const totalCheckIns = presentCount + lateCount;
    const totalHoursWorked = (totalMinutesWorked / 60).toFixed(1);
    const avgDailyHours = totalCheckIns > 0 ? (totalMinutesWorked / totalCheckIns / 60).toFixed(1) : '0.0';
    const punctualityRate = totalCheckIns > 0 ? Math.round((presentCount / totalCheckIns) * 100) : 0;

    employeeSummaries.push({
      employee_id: emp.employee_id,
      emp_code: emp.emp_code,
      full_name: `${emp.first_name} ${emp.last_name}`,
      department_name: emp.department_name || 'General',
      designation: emp.designation,
      employee_email: emp.employee_email,
      totalDays: dateList.length,
      presentDays: presentCount,
      lateDays: lateCount,
      absentDays: absentCount,
      onLeaveDays: onLeaveCount,
      weeklyOffDays: weeklyOffCount,
      officeDays: officeCount,
      wfhDays: wfhCount,
      campDays: campCount,
      totalCheckIns,
      totalMinutesWorked,
      totalHoursWorked,
      avgDailyHours,
      punctualityRate
    });
  }

  return {
    organization: settings.organization_name || 'SheWings Foundation',
    officeName: settings.office_name || 'SheWings Foundation HQ',
    officeAddress: settings.office_address || 'Sector 62, Noida, Uttar Pradesh, 201309, India',
    dateRange: range,
    generatedAt: new Date(),
    isSingleEmployee: employees.length === 1,
    singleEmployee: employees.length === 1 ? employeeSummaries[0] : null,
    employees,
    records: compiledRecords,
    summaries: employeeSummaries
  };
}

/**
 * Generate Excel (.xlsx) file as Buffer
 */
async function generateExcelBuffer(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SheWings Attendance OS';
  workbook.created = new Date();

  const brandNavy = 'FF1E3A8A';
  const brandBlue = 'FF2563EB';
  const whiteText = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  const subheadFont = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  const regularFont = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandNavy } };
  const lightRowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  // SHEET 1: Detailed Daily Attendance Roster
  const sheetTitle = data.isSingleEmployee ? 'My Attendance' : 'Attendance Roster';
  const sheet = workbook.addWorksheet(sheetTitle, {
    views: [{ showGridLines: true }]
  });

  // Top Banner Header
  sheet.mergeCells('A1:J1');
  const topCell = sheet.getCell('A1');
  topCell.value = `${data.organization} - Official Attendance Record`;
  topCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  topCell.fill = headerFill;
  topCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  // Metadata Block
  sheet.mergeCells('A2:J2');
  const metaCell = sheet.getCell('A2');
  metaCell.value = `Period: ${data.dateRange.startDate} to ${data.dateRange.endDate} (${data.dateRange.label}) | Generated on: ${getKolkataDateString()} ${getKolkataTime().timeString} IST`;
  metaCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  let startRow = 4;

  // If single employee, print Summary KPIs on top
  if (data.isSingleEmployee && data.singleEmployee) {
    const s = data.singleEmployee;
    sheet.mergeCells(`A${startRow}:J${startRow}`);
    const empCell = sheet.getCell(`A${startRow}`);
    empCell.value = `Staff: ${s.full_name} (${s.emp_code}) | Dept: ${s.department_name} | Role: ${s.designation}`;
    empCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
    sheet.getRow(startRow).height = 22;
    startRow++;

    // Summary KPI row
    const kpis = [
      ['Total Days', s.totalDays],
      ['Present', s.presentDays],
      ['Late', s.lateDays],
      ['Absent', s.absentDays],
      ['WFH', s.wfhDays],
      ['Camp', s.campDays],
      ['On Leave', s.onLeaveDays],
      ['Weekly Off', s.weeklyOffDays],
      ['Total Hours', `${s.totalHoursWorked} hrs`],
      ['Punctuality', `${s.punctualityRate}%`]
    ];

    sheet.getRow(startRow).values = kpis.map(k => k[0]);
    sheet.getRow(startRow).font = subheadFont;
    sheet.getRow(startRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    sheet.getRow(startRow).height = 20;

    sheet.getRow(startRow + 1).values = kpis.map(k => k[1]);
    sheet.getRow(startRow + 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: brandBlue } };
    sheet.getRow(startRow + 1).height = 22;

    for (let c = 1; c <= 10; c++) {
      sheet.getCell(startRow, c).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(startRow, c).border = thinBorder;
      sheet.getCell(startRow + 1, c).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(startRow + 1, c).border = thinBorder;
    }

    startRow += 3;
  }

  // Column Headers
  const columns = data.isSingleEmployee ? [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Day', key: 'day', width: 12 },
    { header: 'Type / Mode', key: 'mode', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Check-In', key: 'checkIn', width: 14 },
    { header: 'Check-Out', key: 'checkOut', width: 14 },
    { header: 'Working Hours', key: 'duration', width: 16 },
    { header: 'Hours (Dec)', key: 'decHours', width: 14 },
    { header: 'Notes / Remarks', key: 'notes', width: 32 }
  ] : [
    { header: 'Staff ID', key: 'empCode', width: 12 },
    { header: 'Staff Name', key: 'empName', width: 22 },
    { header: 'Department', key: 'dept', width: 18 },
    { header: 'Date', key: 'date', width: 13 },
    { header: 'Day', key: 'day', width: 11 },
    { header: 'Type / Mode', key: 'mode', width: 13 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Check-In', key: 'checkIn', width: 13 },
    { header: 'Check-Out', key: 'checkOut', width: 13 },
    { header: 'Working Hours', key: 'duration', width: 15 },
    { header: 'Notes / Remarks', key: 'notes', width: 28 }
  ];

  sheet.getRow(startRow).values = columns.map(c => c.header);
  sheet.getRow(startRow).font = whiteText;
  sheet.getRow(startRow).fill = headerFill;
  sheet.getRow(startRow).height = 24;

  for (let c = 1; c <= columns.length; c++) {
    sheet.getCell(startRow, c).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(startRow, c).border = thinBorder;
    sheet.getColumn(c).width = columns[c - 1].width;
  }

  // Populate records
  let rIndex = startRow + 1;
  data.records.forEach((r, idx) => {
    const rowValues = data.isSingleEmployee ? [
      r.date,
      r.day,
      r.attendance_mode,
      r.status,
      r.check_in_display,
      r.check_out_display,
      r.formatted_duration,
      r.hours_worked,
      r.notes
    ] : [
      r.emp_code,
      r.full_name,
      r.department_name,
      r.date,
      r.day,
      r.attendance_mode,
      r.status,
      r.check_in_display,
      r.check_out_display,
      r.formatted_duration,
      r.notes
    ];

    const row = sheet.getRow(rIndex);
    row.values = rowValues;
    row.font = regularFont;
    row.height = 20;

    if (idx % 2 === 1) {
      row.fill = lightRowFill;
    }

    for (let c = 1; c <= columns.length; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      // Center dates, times, modes, status
      if (c <= (data.isSingleEmployee ? 8 : 10)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }

    // Status styling
    const statusColIndex = data.isSingleEmployee ? 4 : 7;
    const statusCell = row.getCell(statusColIndex);
    if (r.status === 'Present') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF047857' } };
    } else if (r.status === 'Late') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } };
    } else if (r.status === 'Absent') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    } else if (r.status === 'Weekly Off') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF2563EB' } };
    } else if (r.status === 'On Leave') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF7C3AED' } };
    }

    rIndex++;
  });

  // SHEET 2: Staff KPI Summary (For All Employees report)
  if (!data.isSingleEmployee) {
    const summarySheet = workbook.addWorksheet('Staff KPI Summary', {
      views: [{ showGridLines: true }]
    });

    summarySheet.mergeCells('A1:N1');
    const sumTop = summarySheet.getCell('A1');
    sumTop.value = `${data.organization} - Staff Attendance KPI Summary`;
    sumTop.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    sumTop.fill = headerFill;
    sumTop.alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getRow(1).height = 30;

    summarySheet.mergeCells('A2:N2');
    const sumMeta = summarySheet.getCell('A2');
    sumMeta.value = `Period: ${data.dateRange.startDate} to ${data.dateRange.endDate} (${data.dateRange.label}) | Generated: ${getKolkataDateString()} ${getKolkataTime().timeString} IST`;
    sumMeta.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
    sumMeta.alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getRow(2).height = 20;

    const sumCols = [
      { header: 'Staff ID', width: 12 },
      { header: 'Staff Name', width: 22 },
      { header: 'Department', width: 18 },
      { header: 'Designation', width: 20 },
      { header: 'Total Days', width: 12 },
      { header: 'Present', width: 11 },
      { header: 'Late', width: 11 },
      { header: 'Absent', width: 11 },
      { header: 'WFH', width: 11 },
      { header: 'Camp', width: 11 },
      { header: 'On Leave', width: 11 },
      { header: 'Check-Ins', width: 12 },
      { header: 'Total Hours', width: 14 },
      { header: 'Punctuality', width: 14 }
    ];

    summarySheet.getRow(4).values = sumCols.map(c => c.header);
    summarySheet.getRow(4).font = whiteText;
    summarySheet.getRow(4).fill = headerFill;
    summarySheet.getRow(4).height = 24;

    for (let c = 1; c <= sumCols.length; c++) {
      summarySheet.getCell(4, c).alignment = { horizontal: 'center', vertical: 'middle' };
      summarySheet.getCell(4, c).border = thinBorder;
      summarySheet.getColumn(c).width = sumCols[c - 1].width;
    }

    let sRowIndex = 5;
    data.summaries.forEach((s, idx) => {
      const sRow = summarySheet.getRow(sRowIndex);
      sRow.values = [
        s.emp_code,
        s.full_name,
        s.department_name,
        s.designation,
        s.totalDays,
        s.presentDays,
        s.lateDays,
        s.absentDays,
        s.wfhDays,
        s.campDays,
        s.onLeaveDays,
        s.totalCheckIns,
        `${s.totalHoursWorked} hrs`,
        `${s.punctualityRate}%`
      ];
      sRow.font = regularFont;
      sRow.height = 20;
      if (idx % 2 === 1) sRow.fill = lightRowFill;

      for (let c = 1; c <= sumCols.length; c++) {
        sRow.getCell(c).border = thinBorder;
        sRow.getCell(c).alignment = {
          horizontal: c <= 4 ? 'left' : 'center',
          vertical: 'middle'
        };
      }
      sRowIndex++;
    });
  }

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate PDF document as Buffer with clean, professional A4 layout.
 */
function generatePdfBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      // 1. Create PDF document with exact A4 portrait dimensions
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0, // Manual margin management to prevent unexpected auto page-breaks
        layout: 'portrait',
        bufferPages: true,
        info: {
          Title: `SheWings Attendance Report - ${data.dateRange.startDate} to ${data.dateRange.endDate}`,
          Author: 'SheWings Foundation Attendance OS',
          Subject: 'Official Staff Attendance Record'
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Colors & Styling
      const primaryNavy = '#1E3A8A';
      const accentBlue = '#2563EB';
      const textDark = '#0F172A';
      const textMuted = '#475569';
      const textLight = '#64748B';
      const borderSubtle = '#E2E8F0';
      const rowAltBg = '#F8FAFC';

      // Page dimensions
      const pageWidthPt = doc.page.width;   // 595.28 pt
      const pageHeightPt = doc.page.height; // 841.89 pt
      const marginLeft = 36;
      const contentWidth = pageWidthPt - (marginLeft * 2); // 523.28 pt
      const footerBottomMargin = 42;
      const maxY = pageHeightPt - footerBottomMargin;

      // Status Badge Style Resolver (Requirement 6)
      const getStatusBadge = (status, mode) => {
        const s = (status || '').trim();
        const m = (mode || '').trim().toUpperCase();

        if (s === 'Present') {
          return {
            label: 'Present',
            bg: '#DCFCE7',      // Soft Green
            border: '#86EFAC',
            text: '#15803D'     // Green
          };
        }
        if (s === 'Late') {
          return {
            label: 'Late',
            bg: '#FFEDD5',      // Soft Orange
            border: '#FDBA74',
            text: '#C2410C'     // Orange
          };
        }
        if (s === 'Absent') {
          return {
            label: 'Absent',
            bg: '#FEE2E2',      // Soft Red
            border: '#FCA5A5',
            text: '#B91C1C'     // Red
          };
        }
        if (s === 'WFH' || (s === 'Present' && m === 'WFH')) {
          return {
            label: 'WFH',
            bg: '#DBEAFE',      // Soft Blue
            border: '#93C5FD',
            text: '#1D4ED8'     // Blue
          };
        }
        if (s === 'Camp' || (s === 'Present' && m === 'CAMP')) {
          return {
            label: 'Camp',
            bg: '#F3E8FF',      // Soft Purple
            border: '#D8B4FE',
            text: '#7E22CE'     // Purple
          };
        }
        if (s === 'Weekly Off') {
          return {
            label: 'Weekly Off',
            bg: '#F1F5F9',      // Soft Grey
            border: '#CBD5E1',
            text: '#475569'     // Grey
          };
        }
        if (s === 'On Leave') {
          return {
            label: 'On Leave',
            bg: '#EDE9FE',      // Soft Indigo
            border: '#C4B5FD',
            text: '#6D28D9'     // Indigo/Purple
          };
        }
        return {
          label: s || '-',
          bg: '#F8FAFC',
          border: '#E2E8F0',
          text: '#64748B'
        };
      };

      // Format Attendance Type label and color
      const getModeBadge = (mode) => {
        if (!mode || mode === '--' || mode === '-') return { label: '-', color: textLight };
        const m = mode.trim().toUpperCase();
        if (m === 'OFFICE') return { label: 'Office', color: primaryNavy };
        if (m === 'WFH') return { label: 'WFH', color: '#1D4ED8' };
        if (m === 'CAMP') return { label: 'Camp', color: '#7E22CE' };
        return { label: mode, color: textDark };
      };

      // Column Definitions
      // Individual report: 7 columns (Date, Day, Check-In, Check-Out, Working Hours, Status, Attendance Type)
      const individualCols = [
        { key: 'date', title: 'Date', width: 70, align: 'center' },
        { key: 'day', title: 'Day', width: 65, align: 'center' },
        { key: 'checkIn', title: 'Check-In', width: 65, align: 'center' },
        { key: 'checkOut', title: 'Check-Out', width: 65, align: 'center' },
        { key: 'hours', title: 'Working Hours', width: 78, align: 'center' },
        { key: 'status', title: 'Status', width: 85, align: 'center', isStatus: true },
        { key: 'type', title: 'Attendance Type', width: 95.28, align: 'center', isType: true }
      ];

      // All-staff report: 9 columns (Emp ID, Staff Name, Date, Day, Check-In, Check-Out, Working Hours, Status, Attendance Type)
      const allStaffCols = [
        { key: 'empCode', title: 'Emp ID', width: 46, align: 'center' },
        { key: 'empName', title: 'Staff Name', width: 82, align: 'left' },
        { key: 'date', title: 'Date', width: 58, align: 'center' },
        { key: 'day', title: 'Day', width: 42, align: 'center' },
        { key: 'checkIn', title: 'Check-In', width: 54, align: 'center' },
        { key: 'checkOut', title: 'Check-Out', width: 54, align: 'center' },
        { key: 'hours', title: 'Working Hours', width: 65, align: 'center' },
        { key: 'status', title: 'Status', width: 60, align: 'center', isStatus: true },
        { key: 'type', title: 'Attendance Type', width: 62.28, align: 'center', isType: true }
      ];

      const activeCols = data.isSingleEmployee ? individualCols : allStaffCols;

      // Draw Main First Page Header
      const drawFirstPageHeader = () => {
        const topY = 32;
        const bannerHeight = 56;

        // Top Navy Brand Banner
        doc.rect(marginLeft, topY, contentWidth, bannerHeight).fill(primaryNavy);

        // SheWings Title & Subtitle (Left)
        doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
          .text(data.organization || 'SheWings Foundation', marginLeft + 14, topY + 11, {
            width: contentWidth * 0.55,
            align: 'left',
            lineBreak: false
          });
        doc.fillColor('#93C5FD').fontSize(8).font('Helvetica')
          .text(`Official Attendance Management System | ${data.officeName || 'Headquarters'}`, marginLeft + 14, topY + 28, {
            width: contentWidth * 0.55,
            align: 'left',
            lineBreak: false
          });
        doc.fillColor('#E0E7FF').fontSize(7).font('Helvetica')
          .text(`Generated on: ${getKolkataDateString()} at ${getKolkataTime().timeString} IST`, marginLeft + 14, topY + 40, {
            width: contentWidth * 0.55,
            align: 'left',
            lineBreak: false
          });

        // Report Title & Period (Right)
        doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
          .text('STAFF ATTENDANCE REPORT', marginLeft + contentWidth * 0.5, topY + 11, {
            width: contentWidth * 0.5 - 14,
            align: 'right',
            lineBreak: false
          });
        doc.fillColor('#BFDBFE').fontSize(8).font('Helvetica-Bold')
          .text(`Period: ${data.dateRange.startDate} to ${data.dateRange.endDate}`, marginLeft + contentWidth * 0.5, topY + 26, {
            width: contentWidth * 0.5 - 14,
            align: 'right',
            lineBreak: false
          });
        doc.fillColor('#E0E7FF').fontSize(7.5).font('Helvetica')
          .text(data.dateRange.label || 'Date Range Record', marginLeft + contentWidth * 0.5, topY + 39, {
            width: contentWidth * 0.5 - 14,
            align: 'right',
            lineBreak: false
          });

        let nextY = topY + bannerHeight + 10;

        // Metadata Card
        if (data.isSingleEmployee && data.singleEmployee) {
          const s = data.singleEmployee;
          const cardHeight = 56;

          doc.roundedRect(marginLeft, nextY, contentWidth, cardHeight, 4)
            .fillAndStroke('#F8FAFC', borderSubtle);

          // Left Employee Info
          doc.fillColor(textDark).fontSize(11).font('Helvetica-Bold')
            .text(s.full_name, marginLeft + 12, nextY + 8, { width: 230, lineBreak: false, ellipsis: true });
          doc.fillColor(accentBlue).fontSize(9).font('Helvetica-Bold')
            .text(`Staff ID: ${s.emp_code}`, marginLeft + 12, nextY + 22, { width: 230, lineBreak: false });
          doc.fillColor(textMuted).fontSize(7.5).font('Helvetica')
            .text(`Dept: ${s.department_name} | Role: ${s.designation}`, marginLeft + 12, nextY + 33, { width: 230, lineBreak: false, ellipsis: true });
          doc.fillColor(textLight).fontSize(7).font('Helvetica')
            .text(`Email: ${s.employee_email}`, marginLeft + 12, nextY + 43, { width: 230, lineBreak: false, ellipsis: true });

          // Right KPI Badges
          const kpis = [
            { label: 'PRESENT', val: s.presentDays, color: '#15803D' },
            { label: 'LATE', val: s.lateDays, color: '#C2410C' },
            { label: 'ABSENT', val: s.absentDays, color: '#B91C1C' },
            { label: 'WFH', val: s.wfhDays, color: '#1D4ED8' },
            { label: 'CAMP', val: s.campDays, color: '#7E22CE' },
            { label: 'HOURS', val: `${s.totalHoursWorked}h`, color: primaryNavy }
          ];

          const kpiBoxWidth = 42;
          const kpiBoxHeight = 40;
          const kpiGap = 4;
          let kpiX = marginLeft + contentWidth - 12 - (kpis.length * (kpiBoxWidth + kpiGap) - kpiGap);

          kpis.forEach(k => {
            doc.roundedRect(kpiX, nextY + 8, kpiBoxWidth, kpiBoxHeight, 3)
              .fillAndStroke('#FFFFFF', borderSubtle);
            doc.fillColor(k.color).fontSize(11).font('Helvetica-Bold')
              .text(String(k.val), kpiX, nextY + 14, { width: kpiBoxWidth, align: 'center', lineBreak: false });
            doc.fillColor(textLight).fontSize(6.5).font('Helvetica-Bold')
              .text(k.label, kpiX, nextY + 28, { width: kpiBoxWidth, align: 'center', lineBreak: false });
            kpiX += kpiBoxWidth + kpiGap;
          });

          nextY += cardHeight + 12;
        } else {
          // All Staff Summary Card
          const cardHeight = 32;
          doc.roundedRect(marginLeft, nextY, contentWidth, cardHeight, 4)
            .fillAndStroke('#F8FAFC', borderSubtle);

          doc.fillColor(textDark).fontSize(9).font('Helvetica-Bold')
            .text(`Consolidated Staff Attendance Roster | Total Active Staff: ${data.employees.length} | Total Day Records: ${data.records.length}`, marginLeft + 12, nextY + 7, { width: contentWidth - 24, lineBreak: false });
          doc.fillColor(textMuted).fontSize(7.5).font('Helvetica')
            .text(`Date Range: ${data.dateRange.startDate} to ${data.dateRange.endDate} (${data.dateRange.label}) | All Department Units Included`, marginLeft + 12, nextY + 19, { width: contentWidth - 24, lineBreak: false });

          nextY += cardHeight + 12;
        }

        return nextY;
      };

      // Draw Continuation Header (on subsequent pages)
      const drawContinuationHeader = () => {
        const topY = 32;
        const bannerHeight = 30;

        doc.rect(marginLeft, topY, contentWidth, bannerHeight).fill(primaryNavy);

        doc.fillColor('#FFFFFF').fontSize(9.5).font('Helvetica-Bold')
          .text(`${data.organization || 'SheWings Foundation'} - Staff Attendance Report (Continued)`, marginLeft + 12, topY + 7, {
            width: contentWidth * 0.65,
            align: 'left',
            lineBreak: false
          });

        const subInfo = data.isSingleEmployee && data.singleEmployee
          ? `${data.singleEmployee.full_name} (${data.singleEmployee.emp_code})`
          : `All Staff (${data.employees.length} Employees)`;

        doc.fillColor('#BFDBFE').fontSize(7.5).font('Helvetica')
          .text(`${subInfo} | ${data.dateRange.startDate} to ${data.dateRange.endDate}`, marginLeft + contentWidth * 0.4, topY + 8, {
            width: contentWidth * 0.6 - 12,
            align: 'right',
            lineBreak: false
          });

        return topY + bannerHeight + 10;
      };

      // Draw Table Header Row
      const drawTableHeaderRow = (currentY) => {
        const headerHeight = 22;

        // Navy background for table header
        doc.rect(marginLeft, currentY, contentWidth, headerHeight).fill(primaryNavy);

        let curX = marginLeft;
        activeCols.forEach(col => {
          const padX = 2;
          doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
            .text(col.title, curX + padX, currentY + 6.5, {
              width: col.width - (padX * 2),
              align: col.align,
              lineBreak: false
            });
          curX += col.width;
        });

        return currentY + headerHeight;
      };

      // Draw Table Data Row (Zero diagonal jump, exact coordinates)
      const drawTableRow = (rowY, record, isOdd) => {
        const rowHeight = 18;

        // Row background
        if (isOdd) {
          doc.rect(marginLeft, rowY, contentWidth, rowHeight).fill(rowAltBg);
        } else {
          doc.rect(marginLeft, rowY, contentWidth, rowHeight).fill('#FFFFFF');
        }

        // Bottom border
        doc.strokeColor(borderSubtle).lineWidth(0.5)
          .moveTo(marginLeft, rowY + rowHeight).lineTo(marginLeft + contentWidth, rowY + rowHeight).stroke();

        // Prepare values according to requirements:
        // Missing check-in / check-out / hours / mode -> display "-"
        const checkInText = record.check_in_raw ? formatTime12(record.check_in_raw) : '-';
        const checkOutText = record.check_out_raw ? formatTime12(record.check_out_raw) : '-';
        const hoursText = record.working_minutes > 0
          ? `${Math.floor(record.working_minutes / 60)}h ${record.working_minutes % 60}m`
          : '-';
        const statusBadge = getStatusBadge(record.status, record.attendance_mode);
        const modeBadge = getModeBadge(record.attendance_mode);

        const rowValues = data.isSingleEmployee ? {
          date: record.date,
          day: record.day,
          checkIn: checkInText,
          checkOut: checkOutText,
          hours: hoursText,
          status: statusBadge,
          type: modeBadge
        } : {
          empCode: record.emp_code,
          empName: record.full_name,
          date: record.date,
          day: record.day ? record.day.substring(0, 3) : '-',
          checkIn: checkInText,
          checkOut: checkOutText,
          hours: hoursText,
          status: statusBadge,
          type: modeBadge
        };

        let curX = marginLeft;
        activeCols.forEach(col => {
          const val = rowValues[col.key];

          if (col.isStatus) {
            // Render beautiful rounded status badge pill
            const badgeW = data.isSingleEmployee ? 68 : 54;
            const badgeH = 12.5;
            const badgeX = curX + (col.width - badgeW) / 2;
            const badgeY = rowY + (rowHeight - badgeH) / 2;

            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.5)
              .fillAndStroke(val.bg, val.border);

            doc.fillColor(val.text).fontSize(7).font('Helvetica-Bold')
              .text(val.label, badgeX, badgeY + 2.5, {
                width: badgeW,
                align: 'center',
                lineBreak: false
              });
          } else if (col.isType) {
            // Attendance Type cell
            const padX = 3;
            const textY = rowY + (rowHeight - 7.5) / 2 - 0.5;
            doc.fillColor(val.color).fontSize(7.5).font(val.label !== '-' ? 'Helvetica-Bold' : 'Helvetica')
              .text(val.label, curX + padX, textY, {
                width: col.width - (padX * 2),
                align: col.align,
                lineBreak: false
              });
          } else {
            // Regular text cell
            const padX = 3;
            const textY = rowY + (rowHeight - 7.5) / 2 - 0.5;
            const font = (col.key === 'date' || col.key === 'empCode') ? 'Helvetica-Bold' : 'Helvetica';
            const color = (col.key === 'checkIn' || col.key === 'checkOut') && val === '-' ? textLight : textDark;

            doc.fillColor(color).fontSize(7.5).font(font)
              .text(String(val || '-'), curX + padX, textY, {
                width: col.width - (padX * 2),
                align: col.align,
                lineBreak: false,
                ellipsis: true
              });
          }

          curX += col.width;
        });

        return rowY + rowHeight;
      };

      // RENDER PROCESS:
      let currentY = drawFirstPageHeader();
      currentY = drawTableHeaderRow(currentY);

      const rowHeight = 18;

      data.records.forEach((record, idx) => {
        // Page break check (Requirement 8)
        if (currentY + rowHeight > maxY) {
          doc.addPage();
          currentY = drawContinuationHeader();
          currentY = drawTableHeaderRow(currentY);
        }

        const isOdd = idx % 2 === 1;
        currentY = drawTableRow(currentY, record, isOdd);
      });

      // Page numbers and footer on all pages (Requirement 9)
      const pageRange = doc.bufferedPageRange();
      for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
        doc.switchToPage(i);
        const footerY = pageHeightPt - 28;

        // Divider line above footer
        doc.strokeColor(borderSubtle).lineWidth(0.5)
          .moveTo(marginLeft, footerY - 6).lineTo(marginLeft + contentWidth, footerY - 6).stroke();

        // Footer left text
        doc.fillColor(textLight).fontSize(7).font('Helvetica')
          .text(
            `${data.organization || 'SheWings Foundation'} • Confidential Staff Attendance Record • System Generated`,
            marginLeft,
            footerY,
            { width: contentWidth * 0.7, align: 'left', lineBreak: false }
          );

        // Footer right text
        doc.fillColor(textMuted).fontSize(7).font('Helvetica-Bold')
          .text(
            `Page ${i + 1} of ${pageRange.count}`,
            marginLeft + contentWidth * 0.7,
            footerY,
            { width: contentWidth * 0.3, align: 'right', lineBreak: false }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  resolveDateRange,
  compileAttendanceData,
  generateExcelBuffer,
  generatePdfBuffer
};
