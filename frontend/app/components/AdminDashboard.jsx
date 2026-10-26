'use client';

import React, { useState, useEffect } from 'react';
import {
  Users, CheckCircle2, Clock, UserX, Calendar,
  Search, Filter, Download, Plus, Edit2, ShieldAlert, MapPin,
  Settings, Check, X, FileText, ChevronRight, Eye, RefreshCw, Key,
  TrendingUp, BarChart3, Building2, UserCheck, Power, Tent, Home, Briefcase, Menu
} from 'lucide-react';
import {
  apiGetAttendanceStats,
  apiGetAllAttendances,
  apiGetEmployees,
  apiCreateEmployee,
  apiUpdateEmployee,
  apiGetEmployeeDetails,
  apiToggleEmployeeStatus,
  apiResetEmployeePassword,
  apiGetDepartments,
  apiGetAllLeaves,
  apiUpdateLeaveStatus,
  apiGetAllWFH,
  apiUpdateWFHStatus,
  apiUpdateOfficeSettings,
  apiManualAttendanceAdjustment,
  apiGetMonthlyReport,
  BACKEND_URL
} from '../lib/api';
import SelfieThumbnail from './SelfieThumbnail';

export default function AdminDashboard({ user, officeSettings, onOfficeSettingsUpdated }) {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'reports', 'employees', 'leaves', 'settings'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');

  // Stats
  const [stats, setStats] = useState(null);

  // Attendance tab state
  const [attendances, setAttendances] = useState([]);
  const [dateSummary, setDateSummary] = useState(null);
  const [isSundayDate, setIsSundayDate] = useState(false);
  const [dateSchedule, setDateSchedule] = useState(null);
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'OFFICE', 'WFH', 'CAMP'
  const [searchTerm, setSearchTerm] = useState('');

  // Reports tab state
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  // Employees tab state
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [empForm, setEmpForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    departmentId: '',
    designation: '',
    joiningDate: new Date().toISOString().split('T')[0],
    password: '',
    employeeId: ''
  });
  const [empSubmitting, setEmpSubmitting] = useState(false);
  const [empError, setEmpError] = useState('');

  // Employee Edit Modal
  const [editingEmp, setEditingEmp] = useState(null);
  const [editEmpForm, setEditEmpForm] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Employee Details Modal
  const [viewingEmp, setViewingEmp] = useState(null);
  const [viewingEmpLoading, setViewingEmpLoading] = useState(false);

  // Password Reset Modal
  const [resetPwEmp, setResetPwEmp] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMsg, setResetMsg] = useState({ type: '', text: '' });

  // Leaves & WFH Approvals tab state
  const [approvalsTab, setApprovalsTab] = useState('leaves'); // 'leaves', 'wfh'
  const [leaves, setLeaves] = useState([]);
  const [leaveFilter, setLeaveFilter] = useState('Pending');
  const [reviewingLeave, setReviewingLeave] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // WFH Requests state
  const [wfhRequests, setWfhRequests] = useState([]);
  const [wfhFilter, setWfhFilter] = useState('Pending');
  const [reviewingWfh, setReviewingWfh] = useState(null);
  const [wfhReviewNotes, setWfhReviewNotes] = useState('');
  const [wfhReviewSubmitting, setWfhReviewSubmitting] = useState(false);

  // Office settings form state (including Camp Timings)
  const [officeForm, setOfficeForm] = useState({
    organization_name: officeSettings?.organization_name || 'SheWings Foundation',
    office_name: officeSettings?.office_name || 'SheWings Foundation',
    office_address: officeSettings?.office_address || 'Sector 62, Noida, Uttar Pradesh, 201309, India',
    latitude: officeSettings?.latitude || 28.53530548,
    longitude: officeSettings?.longitude || 77.34580053,
    allowed_radius_meters: officeSettings?.allowed_radius_meters || 100,
    work_start_time: officeSettings?.work_start_time || '09:30:00',
    grace_period_minutes: officeSettings?.grace_period_minutes || 15,
    work_end_time: officeSettings?.work_end_time || '18:30:00',
    saturday_end_time: officeSettings?.saturday_end_time || '18:00:00',
    min_hours_half_day: officeSettings?.min_hours_half_day || 4.0,
    min_hours_full_day: officeSettings?.min_hours_full_day || 8.0,
    camp_custom_timings_enabled: Boolean(officeSettings?.camp_custom_timings_enabled),
    camp_work_start_time: officeSettings?.camp_work_start_time || '09:30:00',
    camp_grace_period_minutes: officeSettings?.camp_grace_period_minutes !== undefined ? officeSettings.camp_grace_period_minutes : 15,
    camp_work_end_time: officeSettings?.camp_work_end_time || '18:30:00',
    camp_saturday_end_time: officeSettings?.camp_saturday_end_time || '18:00:00'
  });
  const [settingsMsg, setSettingsMsg] = useState('');

  // Modals
  const [selectedSelfie, setSelectedSelfie] = useState(null);
  const [manualAdjustmentModal, setManualAdjustmentModal] = useState(null);
  const [adjForm, setAdjForm] = useState({ status: 'Present', reason: '', checkInTime: '', checkOutTime: '' });

  const loadAllData = async () => {
    setLoading(true);
    setDbError('');
    try {
      const [statsRes, attRes, empRes, deptRes, leavesRes, wfhRes] = await Promise.all([
        apiGetAttendanceStats(),
        apiGetAllAttendances({
          date: filterDate,
          status: filterStatus,
          departmentId: filterDept,
          mode: filterMode,
          search: searchTerm
        }),
        apiGetEmployees(),
        apiGetDepartments(),
        apiGetAllLeaves({ status: leaveFilter }),
        apiGetAllWFH({ status: wfhFilter })
      ]);

      if (statsRes && statsRes.success) setStats(statsRes.stats);
      if (attRes && attRes.success) {
        setAttendances(attRes.attendances || []);
        setDateSummary(attRes.summary || null);
        setIsSundayDate(Boolean(attRes.isSunday));
        setDateSchedule(attRes.schedule || null);
      }
      if (empRes && empRes.success) setEmployees(empRes.employees);
      if (deptRes && deptRes.success) setDepartments(deptRes.departments);
      if (leavesRes && leavesRes.success) setLeaves(leavesRes.leaves);
      if (wfhRes && wfhRes.success) setWfhRequests(wfhRes.requests || []);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
      setDbError(err.message || 'Unable to connect to MySQL database service. Please verify your backend server and database connection.');
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReport = async (month) => {
    setReportLoading(true);
    try {
      const res = await apiGetMonthlyReport(month || reportMonth);
      if (res && res.success) {
        setMonthlyReport(res);
      }
    } catch (err) {
      console.error('Error fetching monthly report:', err);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [filterDate, filterStatus, filterDept, filterMode, leaveFilter, wfhFilter]);

  useEffect(() => {
    if (activeTab === 'reports') {
      loadMonthlyReport(reportMonth);
    }
  }, [activeTab, reportMonth]);

  // Update office form state if officeSettings prop updates
  useEffect(() => {
    if (officeSettings) {
      setOfficeForm((prev) => ({
        ...prev,
        ...officeSettings,
        camp_custom_timings_enabled: Boolean(officeSettings.camp_custom_timings_enabled),
        camp_work_start_time: officeSettings.camp_work_start_time || prev.camp_work_start_time || '09:30:00',
        camp_grace_period_minutes: officeSettings.camp_grace_period_minutes !== undefined ? officeSettings.camp_grace_period_minutes : (prev.camp_grace_period_minutes ?? 15),
        camp_work_end_time: officeSettings.camp_work_end_time || prev.camp_work_end_time || '18:30:00',
        camp_saturday_end_time: officeSettings.camp_saturday_end_time || prev.camp_saturday_end_time || '18:00:00',
        saturday_end_time: officeSettings.saturday_end_time || prev.saturday_end_time || '18:00:00'
      }));
    }
  }, [officeSettings]);

  // Handle Search
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadAllData();
  };

  // Add Employee
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setEmpSubmitting(true);
    setEmpError('');
    try {
      await apiCreateEmployee(empForm);
      setShowAddEmpModal(false);
      setEmpForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        departmentId: '',
        designation: '',
        joiningDate: new Date().toISOString().split('T')[0],
        password: '',
        employeeId: ''
      });
      await loadAllData();
    } catch (err) {
      setEmpError(err.message || 'Failed to create employee in database.');
    } finally {
      setEmpSubmitting(false);
    }
  };

  // Edit Employee Open
  const handleOpenEditEmp = (emp) => {
    setEditingEmp(emp);
    setEditEmpForm({
      firstName: emp.first_name,
      lastName: emp.last_name,
      phone: emp.phone || '',
      departmentId: emp.department_id || '',
      designation: emp.designation,
      joiningDate: emp.joining_date ? emp.joining_date.split('T')[0] : '',
      status: emp.status,
      employeeId: emp.employee_id
    });
  };

  // Save Edited Employee
  const handleSaveEditEmp = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    try {
      await apiUpdateEmployee(editingEmp.id, editEmpForm);
      setEditingEmp(null);
      await loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to update employee details.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Toggle Employee Status (Active / Inactive)
  const handleToggleStatus = async (emp) => {
    const nextStatus = emp.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`Are you sure you want to mark ${emp.first_name} ${emp.last_name} as ${nextStatus}?`)) {
      return;
    }
    try {
      await apiToggleEmployeeStatus(emp.id, nextStatus);
      await loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to update employee status.');
    }
  };

  // View Employee Details
  const handleViewEmpDetails = async (empId) => {
    setViewingEmpLoading(true);
    setViewingEmp(null);
    try {
      const res = await apiGetEmployeeDetails(empId);
      if (res.success) {
        setViewingEmp(res.employee);
      }
    } catch (err) {
      alert(err.message || 'Failed to fetch employee details.');
    } finally {
      setViewingEmpLoading(false);
    }
  };

  // Admin Reset Password
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setResetMsg({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }
    setResetSubmitting(true);
    setResetMsg({ type: '', text: '' });
    try {
      const res = await apiResetEmployeePassword(resetPwEmp.id, newPassword);
      setResetMsg({ type: 'success', text: res.message || 'Password reset successfully!' });
      setTimeout(() => {
        setResetPwEmp(null);
        setNewPassword('');
        setResetMsg({ type: '', text: '' });
      }, 1500);
    } catch (err) {
      setResetMsg({ type: 'error', text: err.message || 'Failed to reset password.' });
    } finally {
      setResetSubmitting(false);
    }
  };

  // Review Leave
  const handleReviewLeave = async (status) => {
    if (!reviewingLeave) return;
    setReviewSubmitting(true);
    try {
      await apiUpdateLeaveStatus(reviewingLeave.id, status, reviewNotes);
      setReviewingLeave(null);
      setReviewNotes('');
      await loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to update leave request in database.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Review Work From Home (WFH) Request
  const handleReviewWfh = async (status) => {
    if (!reviewingWfh) return;
    setWfhReviewSubmitting(true);
    try {
      await apiUpdateWFHStatus(reviewingWfh.id, status, wfhReviewNotes);
      setReviewingWfh(null);
      setWfhReviewNotes('');
      await loadAllData();
    } catch (err) {
      alert(err.message || 'Failed to update WFH request in database.');
    } finally {
      setWfhReviewSubmitting(false);
    }
  };

  // Update Office Settings
  const handleSaveOfficeSettings = async (e) => {
    e.preventDefault();
    setSettingsMsg('');
    try {
      const res = await apiUpdateOfficeSettings(officeForm);
      setSettingsMsg('Office geofence and timing configuration saved to MySQL successfully!');
      if (onOfficeSettingsUpdated) {
        onOfficeSettingsUpdated(res.settings);
      }
      setTimeout(() => setSettingsMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to update office settings.');
    }
  };

  // Pin Current Location as Office
  const handlePinCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeForm((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(8)),
          longitude: Number(pos.coords.longitude.toFixed(8))
        }));
        alert(`Office coordinates pinned to your current GPS position: ${pos.coords.latitude.toFixed(8)}, ${pos.coords.longitude.toFixed(8)}`);
      },
      (err) => {
        alert('Could not acquire current location: ' + err.message);
      },
      { enableHighAccuracy: true }
    );
  };

  // Manual Attendance Adjustment
  const handleManualAdjustmentSubmit = async (e) => {
    e.preventDefault();
    if (!adjForm.reason.trim()) {
      alert('A valid reason for manual adjustment is required for audit logs.');
      return;
    }

    try {
      await apiManualAttendanceAdjustment({
        attendanceId: manualAdjustmentModal.id,
        employeeId: manualAdjustmentModal.employee_id,
        attendanceDate: manualAdjustmentModal.attendance_date,
        checkInTime: adjForm.checkInTime || undefined,
        checkOutTime: adjForm.checkOutTime || undefined,
        status: adjForm.status,
        reason: adjForm.reason
      });
      setManualAdjustmentModal(null);
      await loadAllData();
    } catch (err) {
      alert(err.message || 'Adjustment failed in database.');
    }
  };

  // Export Daily Attendance to CSV
  const handleExportCSV = () => {
    if (attendances.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const headers = [
      'Date',
      'Employee ID',
      'Employee Name',
      'Department',
      'Designation',
      'Attendance Mode',
      'Check-In Time',
      'Check-Out Time',
      'Actual Working Hours',
      'Total Working Minutes',
      'Check-In Lat',
      'Check-In Long',
      'Distance (m)',
      'Status',
      'Manual Correction',
      'Notes/Reason'
    ];

    const rows = attendances.map((a) => [
      a.attendance_date,
      a.emp_code,
      `"${a.first_name} ${a.last_name}"`,
      `"${a.department_name || ''}"`,
      `"${a.designation || ''}"`,
      a.attendance_mode || 'OFFICE',
      a.check_in_time || '--:--',
      a.check_out_time || (a.check_in_time ? 'Active Shift' : '--:--'),
      a.total_working_minutes > 0 ? (a.total_working_minutes / 60).toFixed(2) : '0.00',
      a.total_working_minutes || 0,
      a.check_in_lat ?? a.check_in_latitude ?? '',
      a.check_in_lng ?? a.check_in_longitude ?? '',
      a.check_in_distance_m || '',
      a.status,
      a.is_manual_correction ? 'Yes' : 'No',
      `"${a.correction_reason || a.notes || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shewings-attendance-${filterDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Monthly Summary Report to CSV
  const handleExportMonthlyCSV = () => {
    if (!monthlyReport || !monthlyReport.employeeReports || monthlyReport.employeeReports.length === 0) {
      alert('No monthly report data available to export.');
      return;
    }

    const headers = [
      'Month',
      'Staff ID',
      'Staff Name',
      'Department',
      'Designation',
      'Office Days',
      'WFH Days',
      'Camp Days',
      'Present Days (On-Time)',
      'Late Days',
      'Absent Days (Excl. Sundays)',
      'On Leave Days',
      'Total Check-Ins',
      'Total Hours Worked',
      'Avg Hours / Working Day',
      'Punctuality Rate %'
    ];

    const rows = monthlyReport.employeeReports.map((e) => [
      monthlyReport.month,
      e.emp_code,
      `"${e.full_name}"`,
      `"${e.department_name || ''}"`,
      `"${e.designation || ''}"`,
      e.officeDays || 0,
      e.wfhDays || 0,
      e.campDays || 0,
      e.presentDays,
      e.lateDays,
      e.absentDays,
      e.onLeaveDays,
      e.totalCheckIns,
      e.totalHoursWorked,
      e.avgHoursPerDay,
      `${e.punctualityRate}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shewings-monthly-summary-${monthlyReport.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFullSelfieUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url}`;
  };

  return (
    <div className="space-y-8">
      {/* Database Error Banner */}
      {dbError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div>
              <span className="font-bold">Database Notice: </span>
              <span>{dbError}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadAllData}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Admin Header Banner */}
      <div className="rounded-2xl sm:rounded-3xl p-4 sm:p-8 bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900/80 border border-blue-500/20 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-5 shadow-xl">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
              SheWings Administrator Command Center
            </h1>
            <span className="px-2 sm:px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] sm:text-xs font-semibold border border-blue-500/30 flex-shrink-0">
              Live Database Connected
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            Real-time MySQL attendance auditing, Asia/Kolkata timezone shift rules, GPS perimeter verification, and employee governance.
          </p>

          {/* Official Office Timings Badges */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3 text-[10px] sm:text-[11px]">
            <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 font-medium">
              <span className="text-blue-400 font-bold">Mon - Fri:</span> 9:30 AM – 6:30 PM
            </span>
            <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 font-medium">
              <span className="text-blue-400 font-bold">Saturday:</span> 9:30 AM – 6:00 PM
            </span>
            <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 font-medium">
              <span className="text-purple-400 font-bold">Sunday:</span> Weekly Off (No Absent)
            </span>
            <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-medium">
              <span className="text-emerald-400 font-bold">Grace:</span> 9:30–9:45 AM
            </span>
          </div>
        </div>

        <button
          onClick={loadAllData}
          disabled={loading}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition active:scale-95 flex-shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          <span>Refresh Database</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
        {/* Total Active Staff */}
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-slate-900/90 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs">
            <span>Total Staff</span>
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-1.5 sm:mt-2">
            {stats?.totalEmployees ?? 0}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">Active Accounts</div>
        </div>

        {/* Present Today */}
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-emerald-950/20 border border-emerald-500/20 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 text-[11px] sm:text-xs">
            <span>Present Today</span>
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-300 mt-1.5 sm:mt-2">
            {stats?.presentToday ?? 0}
          </div>
          <div className="text-[10px] sm:text-[11px] text-emerald-400/80 mt-0.5 truncate">&le; 9:45 AM</div>
        </div>

        {/* Late Today */}
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-amber-950/20 border border-amber-500/20 shadow-lg">
          <div className="flex items-center justify-between text-amber-400 text-[11px] sm:text-xs">
            <span>Late Today</span>
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 mt-1.5 sm:mt-2">
            {stats?.lateToday ?? 0}
          </div>
          <div className="text-[10px] sm:text-[11px] text-amber-400/80 mt-0.5 truncate">&gt; 9:45 AM</div>
        </div>

        {/* Absent Today */}
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-rose-950/20 border border-rose-500/20 shadow-lg">
          <div className="flex items-center justify-between text-rose-400 text-[11px] sm:text-xs">
            <span>Absent Today</span>
            <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-300 mt-1.5 sm:mt-2">
            {stats?.absentToday ?? 0}
          </div>
          <div className="text-[10px] sm:text-[11px] text-rose-400/80 mt-0.5 truncate">
            {stats?.isSundayToday
              ? 'Sunday: Weekly Off'
              : stats?.isPastCutoff
              ? 'Cutoff Exceeded'
              : 'Grace Window'}
          </div>
        </div>

        {/* On Leave Today */}
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-purple-950/20 border border-purple-500/20 shadow-lg">
          <div className="flex items-center justify-between text-purple-400 text-[11px] sm:text-xs">
            <span>On Leave</span>
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-300 mt-1.5 sm:mt-2">
            {stats?.onLeaveToday ?? 0}
          </div>
          <div className="text-[10px] sm:text-[11px] text-purple-400/80 mt-0.5 truncate">Approved Leaves</div>
        </div>

        {/* Attendance Rate % */}
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-blue-950/25 border border-blue-500/30 shadow-lg">
          <div className="flex items-center justify-between text-blue-400 text-[11px] sm:text-xs">
            <span>Attendance Rate</span>
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-300 mt-1.5 sm:mt-2">
            {stats?.attendancePercentage ?? 0}%
          </div>
          <div className="text-[10px] sm:text-[11px] text-blue-400/80 mt-0.5 truncate">Today's Ratio</div>
        </div>
      </div>

      {/* Monthly Statistics Summary Bar */}
      {stats?.monthlyStats && (
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs sm:text-sm">
            <BarChart3 className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>Monthly Stats ({stats.monthlyStats.month}):</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-slate-400 text-[11px] sm:text-xs">
            <div>
              <span className="text-slate-500">Working Days: </span>
              <span className="font-mono text-white font-semibold">{stats.monthlyStats.totalWorkingDays}</span>
            </div>
            <div>
              <span className="text-slate-500">Check-Ins: </span>
              <span className="font-mono text-white font-semibold">{stats.monthlyStats.totalCheckIns}</span>
            </div>
            <div>
              <span className="text-slate-500">On-Time Rate: </span>
              <span className="font-mono text-emerald-400 font-semibold">{stats.monthlyStats.onTimeRate}%</span>
            </div>
            <div>
              <span className="text-slate-500">Hours Logged: </span>
              <span className="font-mono text-blue-400 font-semibold">{stats.monthlyStats.totalHoursWorked} hrs</span>
            </div>
          </div>
        </div>
      )}

      {/* Admin Mobile Navigation Bar (< lg screens) with Collapsible Drawer Toggle */}
      <div className="lg:hidden flex items-center justify-between p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            {activeTab === 'attendance' && <Calendar className="w-4 h-4" />}
            {activeTab === 'reports' && <BarChart3 className="w-4 h-4" />}
            {activeTab === 'employees' && <Users className="w-4 h-4" />}
            {activeTab === 'leaves' && <FileText className="w-4 h-4" />}
            {activeTab === 'settings' && <Settings className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active View</div>
            <div className="text-xs font-bold text-white">
              {activeTab === 'attendance' && 'Daily Attendance Roster'}
              {activeTab === 'reports' && 'Reports & Monthly Summaries'}
              {activeTab === 'employees' && `Employee Directory (${employees.length})`}
              {activeTab === 'leaves' && `Leave Management (${leaves.length})`}
              {activeTab === 'settings' && 'Office & Geofence Settings'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-600/30 cursor-pointer active:scale-95"
          aria-label="Open Navigation Drawer"
        >
          <Menu className="w-4 h-4" />
          <span>Menu</span>
        </button>
      </div>

      {/* Mobile Collapsible Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 p-5 shadow-2xl flex flex-col justify-between z-10 animate-drawer-in">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
                    SW
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">SheWings Admin</h3>
                    <p className="text-[10px] text-slate-400">Attendance OS Navigation</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Navigation Links */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('attendance');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === 'attendance'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span>Daily Attendance Roster</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Today
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('reports');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === 'reports'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    <span>Reports & Summaries</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('employees');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === 'employees'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Employee Directory</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {employees.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('leaves');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === 'leaves'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Leave & WFH Approvals</span>
                  </div>
                  {leaves.filter(l => l.status === 'Pending').length + wfhRequests.filter(w => w.status === 'Pending').length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold">
                      {leaves.filter(l => l.status === 'Pending').length + wfhRequests.filter(w => w.status === 'Pending').length} Pending
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === 'settings'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-purple-400" />
                    <span>Office & Geofence Settings</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Drawer Footer info */}
            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>{user?.displayName || 'Administrator'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  loadAllData();
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Database</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Desktop Navigation Tabs (Hidden on small mobile, visible on desktop/tablets) */}
      <div className="hidden lg:flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center ${
            activeTab === 'attendance'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Daily Attendance Roster
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center ${
            activeTab === 'reports'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Reports & Monthly Summaries
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center gap-1.5 ${
            activeTab === 'employees'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>Employee Directory</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {employees.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('leaves')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center gap-1.5 ${
            activeTab === 'leaves'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>Leave Management</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {leaves.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Office & Geofence Settings
        </button>
      </div>

      {/* Tab 1: Daily Attendance Roster */}
      {activeTab === 'attendance' && (
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-2xl">
          {/* Sunday Weekly Off Notice Banner */}
          {isSundayDate && (
            <div className="p-4 bg-blue-500/10 border-b border-blue-500/20 text-blue-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>
                  <strong>Official Sunday Policy:</strong> Sunday is a weekly off. Employees are NOT marked absent on Sundays. Unscheduled staff are displayed as Weekly Off.
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold text-[10px] border border-blue-500/30">
                0 Absent Rule Applied
              </span>
            </div>
          )}

          {/* Date Summary Chips */}
          {dateSummary && (
            <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 font-semibold mr-1">Roster Summary for {filterDate}:</span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-medium">
                Total Staff: <strong className="text-white">{dateSummary.totalStaff}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 font-medium">
                Present (On-Time): <strong>{dateSummary.presentCount}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 font-medium">
                Late: <strong>{dateSummary.lateCount}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 font-medium">
                Absent: <strong>{dateSummary.absentCount}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-purple-950/30 border border-purple-500/30 text-purple-300 font-medium">
                On Leave: <strong>{dateSummary.onLeaveCount}</strong>
              </span>
              {dateSummary.officeCount !== undefined && (
                <span className="px-2.5 py-1 rounded-lg bg-blue-950/30 border border-blue-500/30 text-blue-300 font-medium">
                  Office: <strong>{dateSummary.officeCount}</strong>
                </span>
              )}
              {dateSummary.wfhCount !== undefined && (
                <span className="px-2.5 py-1 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-indigo-300 font-medium">
                  WFH: <strong>{dateSummary.wfhCount}</strong>
                </span>
              )}
              {dateSummary.campCount !== undefined && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 font-medium">
                  Camp: <strong>{dateSummary.campCount}</strong>
                </span>
              )}
              {isSundayDate && (
                <span className="px-2.5 py-1 rounded-lg bg-blue-950/30 border border-blue-500/30 text-blue-300 font-medium">
                  Weekly Off: <strong>{dateSummary.weeklyOffCount}</strong>
                </span>
              )}
            </div>
          )}

          {/* Filters Bar */}
          <div className="p-3.5 sm:p-5 border-b border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
              {/* Date Filter */}
              <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-xs min-h-[38px]">
                <Calendar className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="bg-transparent text-white focus:outline-none text-xs font-mono w-full"
                />
              </div>

              {/* Attendance Mode Filter */}
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none min-h-[38px]"
              >
                <option value="all">All Modes (Office, WFH, Camp)</option>
                <option value="OFFICE">Office Attendance</option>
                <option value="WFH">Work From Home (WFH)</option>
                <option value="CAMP">Camp Attendance</option>
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none min-h-[38px]"
              >
                <option value="all">All Statuses</option>
                <option value="Present">Present (On-Time)</option>
                <option value="Late">Late Arrival</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
                <option value="Weekly Off">Weekly Off (Sunday)</option>
              </select>

              {/* Department Filter */}
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none min-h-[38px]"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              {/* Search Bar */}
              <form onSubmit={handleSearchSubmit} className="flex-1 sm:flex-none">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search staff or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:w-52 py-2 pl-8 pr-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500 min-h-[38px]"
                  />
                </div>
              </form>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition min-h-[38px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Table */}
          {attendances.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-slate-400 text-sm">
              <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="font-semibold text-slate-300">No attendance records found for this date.</p>
              <p className="text-xs text-slate-500 mt-1">
                Real-time check-in and check-out records will appear here as employees mark attendance.
              </p>
            </div>
          ) : (
            <div className="table-responsive-container" tabIndex={0} role="region" aria-label="Daily Attendance Roster">
              <div className="sm:hidden px-3.5 py-2 bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                <span>&larr; Swipe table horizontally for full details &rarr;</span>
              </div>
              <table className="w-full text-left text-xs sm:text-sm min-w-[950px]">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Staff Member</th>
                    <th className="py-3.5 px-4">Department</th>
                    <th className="py-3.5 px-4">Mode</th>
                    <th className="py-3.5 px-4">Check-In</th>
                    <th className="py-3.5 px-4">Check-Out</th>
                    <th className="py-3.5 px-4">Duration</th>
                    <th className="py-3.5 px-4">Location / Geofence</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Selfies</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {attendances.map((record) => (
                    <tr key={record.id || `${record.employee_id}-${record.attendance_date}`} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">
                          {record.first_name} {record.last_name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {record.emp_code} • {record.designation}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {record.department_name || 'General'}
                      </td>

                      <td className="py-3.5 px-4">
                        {record.attendance_mode === 'CAMP' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
                            <Tent className="w-3 h-3" /> Camp
                          </span>
                        ) : record.attendance_mode === 'WFH' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 inline-flex items-center gap-1">
                            <Home className="w-3 h-3" /> WFH
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> Office
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {record.check_in_time ? (
                          <div className="font-mono text-slate-200">
                            {new Date(record.check_in_time).toLocaleTimeString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-600 font-mono">--:--</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {record.check_out_time ? (
                          <div className="font-mono text-slate-200">
                            {new Date(record.check_out_time).toLocaleTimeString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}
                          </div>
                        ) : record.check_in_time ? (
                          <span className="text-blue-400 font-medium">Active Shift</span>
                        ) : (
                          <span className="text-slate-600 font-mono">--:--</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {record.total_working_minutes > 0 ? (
                          <span className="font-mono text-slate-200 font-semibold">
                            {Math.floor(record.total_working_minutes / 60)}h {record.total_working_minutes % 60}m
                          </span>
                        ) : record.check_in_time && !record.check_out_time ? (
                          <span className="text-amber-400 font-mono text-xs">In Progress</span>
                        ) : (
                          <span className="text-slate-600 font-mono">--</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {record.attendance_mode === 'CAMP' ? (
                          (record.check_in_lat ?? record.check_in_latitude) && (record.check_in_lng ?? record.check_in_longitude) ? (
                            <a
                              href={`https://maps.google.com/?q=${record.check_in_lat ?? record.check_in_latitude},${record.check_in_lng ?? record.check_in_longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                              title="Open GPS in Google Maps"
                            >
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span>{Number(record.check_in_lat ?? record.check_in_latitude).toFixed(4)}, {Number(record.check_in_lng ?? record.check_in_longitude).toFixed(4)}</span>
                            </a>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">GPS Denied / Unrecorded</span>
                          )
                        ) : record.attendance_mode === 'WFH' ? (
                          <span className="text-purple-400 text-xs font-medium">Remote (Approved)</span>
                        ) : (
                          record.check_in_distance_m !== null && record.check_in_distance_m !== undefined ? (
                            <span className="text-[11px] font-mono text-slate-300">
                              {Math.round(record.check_in_distance_m)}m away
                            </span>
                          ) : (
                            <span className="text-slate-600">--</span>
                          )
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                            record.status === 'Present'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : record.status === 'Late'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : record.status === 'On Leave'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                              : record.status === 'Weekly Off'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : record.status === 'Pending'
                              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {record.status === 'Present' ? 'Present (On-Time)' : record.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {record.check_in_selfie ? (
                            <SelfieThumbnail
                              src={record.check_in_selfie}
                              alt="Check-in selfie"
                              className="w-7 h-7"
                              onClick={() =>
                                setSelectedSelfie({
                                  url: record.check_in_selfie.startsWith('http')
                                    ? record.check_in_selfie
                                    : `${BACKEND_URL}${record.check_in_selfie}`,
                                  label: `Check-In Selfie: ${record.first_name} ${record.last_name} (${record.attendance_mode || 'OFFICE'})`,
                                  time: record.check_in_time,
                                  distance: record.check_in_distance_m,
                                  lat: record.check_in_lat ?? record.check_in_latitude,
                                  lon: record.check_in_lng ?? record.check_in_longitude,
                                  mode: record.attendance_mode || 'OFFICE'
                                })
                              }
                            />
                          ) : null}
                          {record.check_out_selfie ? (
                            <SelfieThumbnail
                              src={record.check_out_selfie}
                              alt="Check-out selfie"
                              className="w-7 h-7"
                              onClick={() =>
                                setSelectedSelfie({
                                  url: record.check_out_selfie.startsWith('http')
                                    ? record.check_out_selfie
                                    : `${BACKEND_URL}${record.check_out_selfie}`,
                                  label: `Check-Out Selfie: ${record.first_name} ${record.last_name} (${record.attendance_mode || 'OFFICE'})`,
                                  time: record.check_out_time,
                                  distance: record.check_out_distance_m,
                                  lat: record.check_out_lat ?? record.check_out_latitude,
                                  lon: record.check_out_lng ?? record.check_out_longitude,
                                  mode: record.attendance_mode || 'OFFICE'
                                })
                              }
                            />
                          ) : null}
                          {!record.check_in_selfie && !record.check_out_selfie && (
                            <span className="text-slate-600 text-xs">None</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setManualAdjustmentModal(record);
                            setAdjForm({
                              status: record.status || 'Present',
                              reason: record.correction_reason || '',
                              checkInTime: record.check_in_time || '',
                              checkOutTime: record.check_out_time || ''
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white text-xs font-medium transition"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Reports & Monthly Summaries */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-2xl">
            {/* Reports Control Bar */}
            <div className="p-3.5 sm:p-5 border-b border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-xs min-h-[38px]">
                  <Calendar className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="text-slate-400 whitespace-nowrap">Report Month:</span>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => {
                      setReportMonth(e.target.value);
                      loadMonthlyReport(e.target.value);
                    }}
                    className="bg-transparent text-white focus:outline-none text-xs font-mono w-full"
                  />
                </div>

                <div className="relative flex-1 sm:flex-none">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search staff, ID, department..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="w-full sm:w-60 py-2 pl-8 pr-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500 min-h-[38px]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => loadMonthlyReport(reportMonth)}
                  disabled={reportLoading}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition min-h-[38px]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin text-blue-400' : ''}`} />
                  <span>Refresh Report</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportMonthlyCSV}
                  disabled={!monthlyReport}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition min-h-[38px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Monthly CSV</span>
                </button>
              </div>
            </div>

            {/* Monthly KPI Overview Bar */}
            {monthlyReport && (
              <div className="p-3.5 sm:p-5 border-b border-slate-800 bg-slate-950/40">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Working Days</div>
                    <div className="text-xl font-black text-white mt-1">
                      {monthlyReport.workingDaysInfo?.totalWorkingDays ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {monthlyReport.workingDaysInfo?.sundaysCount ?? 0} Sundays Off
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Elapsed Work Days</div>
                    <div className="text-xl font-black text-blue-300 mt-1">
                      {monthlyReport.workingDaysInfo?.elapsedWorkingDays ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">To date (Mon-Sat)</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/20">
                    <div className="text-[11px] text-emerald-400">On-Time (Present)</div>
                    <div className="text-xl font-black text-emerald-300 mt-1">
                      {monthlyReport.summary?.totalPresentCheckIns ?? 0}
                    </div>
                    <div className="text-[10px] text-emerald-400/70 mt-0.5">Check-ins &le; 9:45 AM</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20">
                    <div className="text-[11px] text-amber-400">Late Check-Ins</div>
                    <div className="text-xl font-black text-amber-300 mt-1">
                      {monthlyReport.summary?.totalLateCheckIns ?? 0}
                    </div>
                    <div className="text-[10px] text-amber-400/70 mt-0.5">Arrival &gt; 9:45 AM</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/20">
                    <div className="text-[11px] text-rose-400">Absent Days</div>
                    <div className="text-xl font-black text-rose-300 mt-1">
                      {monthlyReport.summary?.totalAbsentDays ?? 0}
                    </div>
                    <div className="text-[10px] text-rose-400/70 mt-0.5">Sundays excluded</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/20">
                    <div className="text-[11px] text-purple-400">Approved Leaves</div>
                    <div className="text-xl font-black text-purple-300 mt-1">
                      {monthlyReport.summary?.totalOnLeaveDays ?? 0}
                    </div>
                    <div className="text-[10px] text-purple-400/70 mt-0.5">Sanctioned Leaves</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-500/20">
                    <div className="text-[11px] text-indigo-400">Total Worked Hours</div>
                    <div className="text-xl font-black text-indigo-300 mt-1">
                      {monthlyReport.summary?.totalHoursWorked ?? '0.0'}
                    </div>
                    <div className="text-[10px] text-indigo-400/70 mt-0.5">
                      Punctuality: {monthlyReport.summary?.punctualityRate ?? 0}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Report Table */}
            {reportLoading ? (
              <div className="p-8 sm:p-12 text-center text-slate-400 text-sm">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
                <p>Generating Monthly Attendance Report...</p>
              </div>
            ) : !monthlyReport || !monthlyReport.employeeReports || monthlyReport.employeeReports.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-slate-400 text-sm">
                <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="font-semibold text-slate-300">No report data found for {reportMonth}.</p>
                <p className="text-xs text-slate-500 mt-1">Select a month above to load attendance and worked hours summaries.</p>
              </div>
            ) : (
              <div className="table-responsive-container" tabIndex={0} role="region" aria-label="Monthly Attendance Report">
                <div className="sm:hidden px-3.5 py-2 bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                  <span>&larr; Swipe table horizontally for full details &rarr;</span>
                </div>
                <table className="w-full text-left text-xs sm:text-sm min-w-[900px]">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Staff Member</th>
                      <th className="py-3.5 px-4">Department & Role</th>
                      <th className="py-3.5 px-4 text-center">Present (On-Time)</th>
                      <th className="py-3.5 px-4 text-center">Late</th>
                      <th className="py-3.5 px-4 text-center">Absent</th>
                      <th className="py-3.5 px-4 text-center">On Leave</th>
                      <th className="py-3.5 px-4 text-center">Total Check-Ins</th>
                      <th className="py-3.5 px-4 text-right">Total Hours</th>
                      <th className="py-3.5 px-4 text-right">Avg Hrs/Day</th>
                      <th className="py-3.5 px-4 text-right">Punctuality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {monthlyReport.employeeReports
                      .filter(e => {
                        if (!reportSearch.trim()) return true;
                        const q = reportSearch.toLowerCase();
                        return (
                          e.full_name.toLowerCase().includes(q) ||
                          e.emp_code.toLowerCase().includes(q) ||
                          e.department_name.toLowerCase().includes(q) ||
                          e.designation.toLowerCase().includes(q)
                        );
                      })
                      .map((emp) => (
                        <tr key={emp.employee_id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{emp.full_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{emp.emp_code}</div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-300">
                            <div>{emp.department_name}</div>
                            <div className="text-[11px] text-slate-500">{emp.designation}</div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              {emp.presentDays}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              emp.lateDays > 0
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800/40 text-slate-500 border-slate-700/40'
                            }`}>
                              {emp.lateDays}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              emp.absentDays > 0
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : 'bg-slate-800/40 text-slate-500 border-slate-700/40'
                            }`}>
                              {emp.absentDays}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              emp.onLeaveDays > 0
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                : 'bg-slate-800/40 text-slate-500 border-slate-700/40'
                            }`}>
                              {emp.onLeaveDays}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-200">
                            {emp.totalCheckIns}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-300">
                            {emp.totalHoursWorked} hrs
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                            {emp.avgHoursPerDay} hrs
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span className={`font-mono font-bold text-xs ${
                              emp.punctualityRate >= 80
                                ? 'text-emerald-400'
                                : emp.punctualityRate >= 50
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}>
                              {emp.punctualityRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Employee Directory */}
      {activeTab === 'employees' && (
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-2xl">
          <div className="p-3.5 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base">Foundation Staff Directory</h3>
              <p className="text-xs text-slate-400">Manage real employee accounts, credentials, and status in MySQL</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddEmpModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white font-semibold text-xs shadow-md shadow-blue-600/30 transition min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Staff Member</span>
            </button>
          </div>

          {employees.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-slate-400 text-sm">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="font-semibold text-slate-300">No staff members registered in the database yet.</p>
              <p className="text-xs text-slate-500 mt-1">
                Click 'Add New Staff Member' above to create real database accounts.
              </p>
            </div>
          ) : (
            <div className="table-responsive-container" tabIndex={0} role="region" aria-label="Employee Directory">
              <div className="sm:hidden px-3.5 py-2 bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                <span>&larr; Swipe table horizontally for full actions &rarr;</span>
              </div>
              <table className="w-full text-left text-xs sm:text-sm min-w-[850px]">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Staff ID</th>
                    <th className="py-3.5 px-4">Full Name</th>
                    <th className="py-3.5 px-4">Email & Phone</th>
                    <th className="py-3.5 px-4">Department</th>
                    <th className="py-3.5 px-4">Designation</th>
                    <th className="py-3.5 px-4">Joining Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                        {emp.employee_id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {emp.first_name} {emp.last_name}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-300">{emp.email}</div>
                        <div className="text-[11px] text-slate-400">{emp.phone || '--'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {emp.department_name || 'General'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {emp.designation}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-xs font-mono">
                        {emp.joining_date ? emp.joining_date.split('T')[0] : '--'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            emp.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details */}
                          <button
                            type="button"
                            onClick={() => handleViewEmpDetails(emp.id)}
                            title="View Employee Profile & History"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition min-h-[34px] min-w-[34px] flex items-center justify-center"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Details */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditEmp(emp)}
                            title="Edit Employee Info"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition min-h-[34px] min-w-[34px] flex items-center justify-center"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              setResetPwEmp(emp);
                              setNewPassword('');
                              setResetMsg({ type: '', text: '' });
                            }}
                            title="Reset Password"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white transition min-h-[34px] min-w-[34px] flex items-center justify-center"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active / Deactivate */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(emp)}
                            title={emp.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                            className={`p-2 rounded-lg transition min-h-[34px] min-w-[34px] flex items-center justify-center ${
                              emp.status === 'active'
                                ? 'bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white'
                                : 'bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Leave & Work From Home (WFH) Management */}
      {activeTab === 'leaves' && (
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-2xl">
          <div className="p-3.5 sm:p-5 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setApprovalsTab('leaves')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[36px] ${
                  approvalsTab === 'leaves'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Staff Leaves ({leaves.length})
              </button>
              <button
                type="button"
                onClick={() => setApprovalsTab('wfh')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[36px] ${
                  approvalsTab === 'wfh'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Work From Home (WFH) ({wfhRequests.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {['Pending', 'Approved', 'Rejected', 'all'].map((st) => (
                <button
                  key={st}
                  onClick={() => approvalsTab === 'leaves' ? setLeaveFilter(st) : setWfhFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition min-h-[32px] ${
                    (approvalsTab === 'leaves' ? leaveFilter === st : wfhFilter === st)
                      ? (approvalsTab === 'leaves' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-purple-600 text-white shadow-md shadow-purple-600/30')
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {approvalsTab === 'leaves' ? (
            leaves.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-slate-400 text-sm">
                No leave requests found for status: {leaveFilter}.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {leaves.map((l) => (
                  <div key={l.id} className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 hover:bg-slate-800/20 transition">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {l.first_name} {l.last_name}
                        </span>
                        <span className="text-xs font-mono text-blue-400">({l.emp_code})</span>
                        <span className="text-xs text-slate-400">• {l.department_name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            l.status === 'Approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : l.status === 'Rejected'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {l.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="font-semibold text-blue-300">{l.leave_type} Leave</span> from{' '}
                        <span className="font-mono text-white">{l.start_date ? l.start_date.split('T')[0] : ''}</span> to{' '}
                        <span className="font-mono text-white">{l.end_date ? l.end_date.split('T')[0] : ''}</span>
                      </div>
                      <div className="text-xs text-slate-400 italic">
                        "{l.reason}"
                      </div>
                      {l.review_notes && (
                        <div className="text-[11px] text-slate-500">
                          Admin Note: {l.review_notes}
                        </div>
                      )}
                    </div>

                    {l.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewingLeave(l);
                          setReviewNotes('');
                        }}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition min-h-[40px]"
                      >
                        Review Application
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            wfhRequests.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-slate-400 text-sm">
                No Work From Home requests found for status: {wfhFilter}.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {wfhRequests.map((req) => (
                  <div key={req.id} className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 hover:bg-slate-800/20 transition">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {req.first_name} {req.last_name}
                        </span>
                        <span className="text-xs font-mono text-purple-400">({req.emp_code})</span>
                        <span className="text-xs text-slate-400">• {req.department_name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            req.status === 'Approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : req.status === 'Rejected'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">
                        <span className="font-semibold text-purple-300">WFH Date(s):</span>{' '}
                        <span className="font-mono text-white font-bold">
                          {req.start_date ? (
                            req.start_date.split('T')[0] === (req.end_date ? req.end_date.split('T')[0] : '')
                              ? req.start_date.split('T')[0]
                              : `${req.start_date.split('T')[0]} to ${req.end_date.split('T')[0]}`
                          ) : ''}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 italic">
                        "{req.reason}"
                      </div>
                      {req.review_notes && (
                        <div className="text-[11px] text-slate-500">
                          Admin Note: {req.review_notes}
                        </div>
                      )}
                    </div>

                    {req.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewingWfh(req);
                          setWfhReviewNotes('');
                        }}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/30 transition min-h-[40px]"
                      >
                        Review WFH Request
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Tab 4: Office & Geofence Settings */}
      {activeTab === 'settings' && (
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 sm:pb-6 border-b border-slate-800 mb-6">
            <div>
              <h3 className="font-bold text-white text-base">Office Geofence & Shift Configuration</h3>
              <p className="text-xs text-slate-400">
                All coordinates, radii, and work timings are loaded directly from MySQL.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePinCurrentLocation}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold border border-slate-700 transition min-h-[40px]"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Pin Current Location</span>
            </button>
          </div>

          {settingsMsg && (
            <div className="mb-6 p-3.5 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{settingsMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveOfficeSettings} className="space-y-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  value={officeForm.organization_name}
                  onChange={(e) => setOfficeForm({ ...officeForm, organization_name: e.target.value })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Office / Branch Name</label>
                <input
                  type="text"
                  required
                  value={officeForm.office_name}
                  onChange={(e) => setOfficeForm({ ...officeForm, office_name: e.target.value })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">Physical Office Address</label>
                <input
                  type="text"
                  required
                  value={officeForm.office_address}
                  onChange={(e) => setOfficeForm({ ...officeForm, office_address: e.target.value })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Office Latitude (GPS)</label>
                <input
                  type="number"
                  step="0.00000001"
                  required
                  value={officeForm.latitude}
                  onChange={(e) => setOfficeForm({ ...officeForm, latitude: parseFloat(e.target.value) })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Office Longitude (GPS)</label>
                <input
                  type="number"
                  step="0.00000001"
                  required
                  value={officeForm.longitude}
                  onChange={(e) => setOfficeForm({ ...officeForm, longitude: parseFloat(e.target.value) })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Permitted Geofence Radius (Meters)
                </label>
                <input
                  type="number"
                  min="20"
                  max="5000"
                  required
                  value={officeForm.allowed_radius_meters}
                  onChange={(e) => setOfficeForm({ ...officeForm, allowed_radius_meters: parseInt(e.target.value, 10) })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Initial standard: 100 metres for SheWings Foundation perimeter
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  required
                  value={officeForm.grace_period_minutes}
                  onChange={(e) => setOfficeForm({ ...officeForm, grace_period_minutes: parseInt(e.target.value, 10) })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Default 15 min: Check-in up to 09:45:00 AM is ON TIME; 09:45:01 AM+ is LATE
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Official Reporting / Start Time (IST)</label>
                <input
                  type="time"
                  step="1"
                  required
                  value={officeForm.work_start_time}
                  onChange={(e) => setOfficeForm({ ...officeForm, work_start_time: e.target.value })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Standard: 09:30:00 AM (Mon–Sat)
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mon–Fri Closing Time (IST)</label>
                <input
                  type="time"
                  step="1"
                  required
                  value={officeForm.work_end_time}
                  onChange={(e) => setOfficeForm({ ...officeForm, work_end_time: e.target.value })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Standard: 18:30:00 (6:30 PM) &bull; 9.0 hours window
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Saturday Closing Time (IST)</label>
                <input
                  type="time"
                  step="1"
                  required
                  value={officeForm.saturday_end_time}
                  onChange={(e) => setOfficeForm({ ...officeForm, saturday_end_time: e.target.value })}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Standard: 18:00:00 (6:00 PM) &bull; 8.5 hours window
                </span>
              </div>
            </div>

            {/* Camp Attendance Timings Configuration */}
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
                    <Tent className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-white text-sm">Camp Attendance Schedule</h4>
                    <p className="text-[11px] text-slate-400">
                      Configure separate timing rules for field and camp duties without altering regular office timings.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={officeForm.camp_custom_timings_enabled}
                    onChange={(e) => setOfficeForm({ ...officeForm, camp_custom_timings_enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-0 focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-slate-200">
                    {officeForm.camp_custom_timings_enabled ? 'Custom Camp Timings Active' : 'Use Standard Office Timings'}
                  </span>
                </label>
              </div>

              {officeForm.camp_custom_timings_enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Camp Reporting Time (IST)</label>
                    <input
                      type="time"
                      step="1"
                      required
                      value={officeForm.camp_work_start_time}
                      onChange={(e) => setOfficeForm({ ...officeForm, camp_work_start_time: e.target.value })}
                      className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500 min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Camp Grace Period (Minutes)</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      required
                      value={officeForm.camp_grace_period_minutes}
                      onChange={(e) => setOfficeForm({ ...officeForm, camp_grace_period_minutes: parseInt(e.target.value, 10) || 0 })}
                      className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500 min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Camp Mon–Fri End (IST)</label>
                    <input
                      type="time"
                      step="1"
                      required
                      value={officeForm.camp_work_end_time}
                      onChange={(e) => setOfficeForm({ ...officeForm, camp_work_end_time: e.target.value })}
                      className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500 min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Camp Saturday End (IST)</label>
                    <input
                      type="time"
                      step="1"
                      required
                      value={officeForm.camp_saturday_end_time}
                      onChange={(e) => setOfficeForm({ ...officeForm, camp_saturday_end_time: e.target.value })}
                      className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500 min-h-[40px]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Official Rules & Policy Guide */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/40 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-blue-600/30 text-blue-400 font-bold text-xs flex-shrink-0">
                  ℹ
                </span>
                <h4 className="font-bold text-white text-xs tracking-wide">
                  SheWings Official Office Timings & Attendance Policy Rules
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-[11px]">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-semibold text-blue-400">1. Office Timings</div>
                  <ul className="text-slate-300 space-y-0.5 list-disc list-inside">
                    <li><strong className="text-white">Mon–Fri:</strong> 9:30 AM to 6:30 PM (9.0h)</li>
                    <li><strong className="text-white">Saturday:</strong> 9:30 AM to 6:00 PM (8.5h)</li>
                    <li><strong className="text-emerald-400">Sunday:</strong> Weekly Off (Never marked absent)</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-semibold text-indigo-400">2. Late & Grace Period</div>
                  <ul className="text-slate-300 space-y-0.5 list-disc list-inside">
                    <li><strong className="text-white">Reporting:</strong> 9:30 AM</li>
                    <li><strong className="text-emerald-400">&le; 9:45:00 AM:</strong> ON TIME (Present)</li>
                    <li><strong className="text-amber-400">&ge; 9:45:01 AM:</strong> LATE</li>
                    <li><strong className="text-white">Clock:</strong> Server time (Asia/Kolkata)</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-semibold text-purple-400">3. Working Hours</div>
                  <ul className="text-slate-300 space-y-0.5 list-disc list-inside">
                    <li>Calculated strictly between recorded check-in and check-out.</li>
                    <li>No full-day assumption without checkout.</li>
                    <li>No automatic lunch break deductions.</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-amber-500/30 space-y-1">
                  <div className="font-semibold text-amber-400">4. Camp Duty Policy</div>
                  <ul className="text-slate-300 space-y-0.5 list-disc list-inside">
                    <li>Direct employee selection (no admin approval needed).</li>
                    <li>Geofence bypassed; GPS recorded when granted.</li>
                    <li>Mandatory live selfie verification on in/out.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white font-bold text-sm shadow-md shadow-blue-600/30 transition min-h-[44px]"
              >
                Save Geofence & Shift Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: View Full High-Res Selfie */}
      {selectedSelfie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-md w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h4 className="text-sm font-bold text-white truncate pr-2">{selectedSelfie.label}</h4>
              <button
                onClick={() => setSelectedSelfie(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black aspect-[4/3] flex items-center justify-center">
              <img
                src={selectedSelfie.url}
                alt="Full selfie inspection"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-selfie.svg';
                }}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-1.5">
              <div>
                <span className="text-slate-500">Attendance Mode: </span>
                <span className="font-semibold text-white">{selectedSelfie.mode || 'OFFICE'}</span>
              </div>
              <div>
                <span className="text-slate-500">Timestamp: </span>
                {new Date(selectedSelfie.time).toLocaleString('en-IN')}
              </div>
              {selectedSelfie.mode === 'CAMP' ? (
                <div>
                  <span className="text-slate-500">Recorded GPS: </span>
                  {selectedSelfie.lat && selectedSelfie.lon ? (
                    <a
                      href={`https://maps.google.com/?q=${selectedSelfie.lat},${selectedSelfie.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline font-mono"
                    >
                      {Number(selectedSelfie.lat).toFixed(6)}, {Number(selectedSelfie.lon).toFixed(6)} (Open in Maps)
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">GPS Permission Denied / Not Provided</span>
                  )}
                </div>
              ) : selectedSelfie.distance !== null && selectedSelfie.distance !== undefined ? (
                <div>
                  <span className="text-slate-500">Distance from Office: </span>
                  {Math.round(selectedSelfie.distance)} meters (Geofence Verified)
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Review WFH Application */}
      {reviewingWfh && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-md w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Home className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <h4 className="text-base font-bold text-white">Review Work From Home</h4>
              </div>
              <button
                onClick={() => setReviewingWfh(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Employee:</span>
                  <span className="font-bold text-white">{reviewingWfh.first_name} {reviewingWfh.last_name} ({reviewingWfh.emp_code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Department:</span>
                  <span className="text-slate-200">{reviewingWfh.department_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">WFH Date(s):</span>
                  <span className="font-mono text-purple-300 font-bold">
                    {reviewingWfh.start_date ? (
                      reviewingWfh.start_date.split('T')[0] === (reviewingWfh.end_date ? reviewingWfh.end_date.split('T')[0] : '')
                        ? reviewingWfh.start_date.split('T')[0]
                        : `${reviewingWfh.start_date.split('T')[0]} to ${reviewingWfh.end_date.split('T')[0]}`
                    ) : ''}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-slate-400 block mb-1">Reason:</span>
                  <p className="text-slate-300 italic bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    "{reviewingWfh.reason}"
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Reviewer Note (Optional)</label>
                <textarea
                  rows="2"
                  value={wfhReviewNotes}
                  onChange={(e) => setWfhReviewNotes(e.target.value)}
                  placeholder="e.g. Approved for project deliverable deadline..."
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  disabled={wfhReviewSubmitting}
                  onClick={() => handleReviewWfh('Rejected')}
                  className="w-full sm:flex-1 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white font-bold transition flex items-center justify-center gap-1.5 min-h-[42px]"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  disabled={wfhReviewSubmitting}
                  onClick={() => handleReviewWfh('Approved')}
                  className="w-full sm:flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 min-h-[42px]"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve WFH</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Staff Member */}
      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-lg w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add New SheWings Staff Member</h3>
              <button
                onClick={() => setShowAddEmpModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {empError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {empError}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={empForm.firstName}
                    onChange={(e) => setEmpForm({ ...empForm, firstName: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={empForm.lastName}
                    onChange={(e) => setEmpForm({ ...empForm, lastName: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Staff ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. SW-101 (Auto if empty)"
                    value={empForm.employeeId}
                    onChange={(e) => setEmpForm({ ...empForm, employeeId: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email Address (Login Username)</label>
                <input
                  type="email"
                  required
                  placeholder="name@shewings.org"
                  value={empForm.email}
                  onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Department</label>
                  <select
                    value={empForm.departmentId}
                    onChange={(e) => setEmpForm({ ...empForm, departmentId: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Designation</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Field Officer"
                    value={empForm.designation}
                    onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Joining Date</label>
                  <input
                    type="date"
                    required
                    value={empForm.joiningDate}
                    onChange={(e) => setEmpForm({ ...empForm, joiningDate: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Initial Password</label>
                  <input
                    type="text"
                    placeholder="Default: Employee@123"
                    value={empForm.password}
                    onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={empSubmitting}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-md shadow-blue-600/30 min-h-[42px]"
                >
                  {empSubmitting ? 'Saving to Database...' : 'Create Staff Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Staff Member */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-lg w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white truncate pr-2">
                Edit Staff: {editingEmp.first_name} {editingEmp.last_name}
              </h3>
              <button
                onClick={() => setEditingEmp(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditEmp} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={editEmpForm.firstName}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, firstName: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={editEmpForm.lastName}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, lastName: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Staff ID</label>
                  <input
                    type="text"
                    required
                    value={editEmpForm.employeeId}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, employeeId: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editEmpForm.phone}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, phone: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Department</label>
                  <select
                    value={editEmpForm.departmentId}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, departmentId: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Designation</label>
                  <input
                    type="text"
                    required
                    value={editEmpForm.designation}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, designation: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Joining Date</label>
                  <input
                    type="date"
                    required
                    value={editEmpForm.joiningDate}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, joiningDate: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Account Status</label>
                  <select
                    value={editEmpForm.status}
                    onChange={(e) => setEditEmpForm({ ...editEmpForm, status: e.target.value })}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-md shadow-blue-600/30 min-h-[42px]"
                >
                  {editSubmitting ? 'Saving...' : 'Update Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Employee Details & History */}
      {viewingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-lg w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {viewingEmp.first_name ? viewingEmp.first_name[0] : 'E'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {viewingEmp.first_name} {viewingEmp.last_name}
                  </h3>
                  <p className="text-xs text-blue-400 font-mono">
                    {viewingEmp.employee_id} • {viewingEmp.designation}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingEmp(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <span className="text-slate-500">Email: </span>
                  <span className="text-slate-200 break-all">{viewingEmp.email}</span>
                </div>
                <div>
                  <span className="text-slate-500">Phone: </span>
                  <span className="text-slate-200">{viewingEmp.phone || '--'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Department: </span>
                  <span className="text-slate-200">{viewingEmp.department_name || 'General'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Status: </span>
                  <span className={viewingEmp.status === 'active' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {viewingEmp.status}
                  </span>
                </div>
              </div>

              {/* Attendance Stats Summary */}
              {viewingEmp.stats && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-slate-300">Lifetime Attendance Summary</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-base font-bold text-emerald-400">{viewingEmp.stats.presentDays || 0}</div>
                      <div className="text-[10px] text-slate-500">On-Time Days</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-base font-bold text-amber-400">{viewingEmp.stats.lateDays || 0}</div>
                      <div className="text-[10px] text-slate-500">Late Days</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-base font-bold text-blue-400">
                        {((viewingEmp.stats.totalMinutes || 0) / 60).toFixed(1)}h
                      </div>
                      <div className="text-[10px] text-slate-500">Work Hours</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Leaves */}
              {viewingEmp.recentLeaves && viewingEmp.recentLeaves.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-slate-300">Recent Leave Requests</h4>
                  <div className="space-y-1.5">
                    {viewingEmp.recentLeaves.map((l) => (
                      <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] p-2 rounded-lg bg-slate-900">
                        <div>
                          <span className="font-semibold text-white">{l.leave_type} Leave</span>
                          <span className="text-slate-400"> ({l.start_date.split('T')[0]} to {l.end_date.split('T')[0]})</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold self-start sm:self-auto ${
                          l.status === 'Approved' ? 'text-emerald-400 bg-emerald-500/10' :
                          l.status === 'Rejected' ? 'text-rose-400 bg-rose-500/10' :
                          'text-amber-400 bg-amber-500/10'
                        }`}>
                          {l.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingEmp(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold min-h-[40px]"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Employee Password */}
      {resetPwEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-sm w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 shadow-2xl">
            <h4 className="text-base font-bold text-white mb-1">Reset Employee Password</h4>
            <p className="text-xs text-slate-400 mb-4 break-all">
              Staff: {resetPwEmp.first_name} {resetPwEmp.last_name} ({resetPwEmp.email})
            </p>

            {resetMsg.text && (
              <div className={`mb-4 p-3 rounded-xl text-xs font-medium ${
                resetMsg.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              }`}>
                {resetMsg.text}
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">New Password</label>
                <input
                  type="text"
                  required
                  placeholder="Min 6 characters (e.g. Employee@2026)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-blue-500 min-h-[42px]"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPwEmp(null)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition shadow-md shadow-amber-600/30 min-h-[40px]"
                >
                  {resetSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Review Leave Application */}
      {reviewingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-md w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 shadow-2xl">
            <h4 className="text-base font-bold text-white mb-2">Review Leave Application</h4>
            <p className="text-xs text-slate-400 mb-4">
              {reviewingLeave.first_name} {reviewingLeave.last_name} ({reviewingLeave.leave_type} Leave)
            </p>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs mb-4 space-y-1">
              <div>
                <span className="text-slate-500">Period: </span>
                <span className="font-mono text-white">
                  {reviewingLeave.start_date ? reviewingLeave.start_date.split('T')[0] : ''} to {reviewingLeave.end_date ? reviewingLeave.end_date.split('T')[0] : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Reason: </span>
                <span className="italic text-slate-300">"{reviewingLeave.reason}"</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Admin Review Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Add comment or approval notes..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReviewingLeave(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => handleReviewLeave('Rejected')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/30 min-h-[40px]"
              >
                Reject Leave
              </button>
              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => handleReviewLeave('Approved')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-600/30 min-h-[40px]"
              >
                Approve Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manual Attendance Adjustment */}
      {manualAdjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-md w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 shadow-2xl">
            <h4 className="text-base font-bold text-white mb-1">Adjust Attendance Record</h4>
            <p className="text-xs text-slate-400 mb-4">
              Staff: {manualAdjustmentModal.first_name} {manualAdjustmentModal.last_name} ({manualAdjustmentModal.attendance_date})
            </p>

            <form onSubmit={handleManualAdjustmentSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Status Override</label>
                <select
                  value={adjForm.status}
                  onChange={(e) => setAdjForm({ ...adjForm, status: e.target.value })}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none min-h-[40px]"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                  <option value="On Leave">On Leave</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Audit Reason (Mandatory)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain reason for manual adjustment (e.g. Field assignment, approved GPS discrepancy)..."
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setManualAdjustmentModal(null)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-md shadow-blue-600/30 min-h-[40px]"
                >
                  Save Override with Audit Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
