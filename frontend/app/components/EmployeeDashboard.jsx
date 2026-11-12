'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar, Clock, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck,
  User, MapPin, Camera, FileText, Send, X, ExternalLink, ChevronRight,
  Tent, Building2, Home, Laptop, Compass, Check, Info, Download, RefreshCw,
  Eye, ChevronUp
} from 'lucide-react';
import {
  apiGetTodayAttendance,
  apiCheckIn,
  apiCheckOut,
  apiGetAttendanceHistory,
  apiGetAttendanceStats,
  apiApplyLeave,
  apiGetMyLeaves,
  apiApplyWFH,
  apiGetMyWFH,
  apiGetMyAttendanceHistory,
  apiDownloadMyAttendance,
  BACKEND_URL
} from '../lib/api';
import CameraCapture from './CameraCapture';
import GeoLocationStatus from './GeoLocationStatus';
import SelfieThumbnail from './SelfieThumbnail';

export default function EmployeeDashboard({ user, officeSettings }) {
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [wfhList, setWfhList] = useState([]);
  const [isWfhApprovedToday, setIsWfhApprovedToday] = useState(false);
  const [wfhTodayRequest, setWfhTodayRequest] = useState(null);
  const [campSettings, setCampSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'wfh', 'leaves'

  // Three Attendance Modes: 'OFFICE' | 'WFH' | 'CAMP'
  const [selectedMode, setSelectedMode] = useState('OFFICE');

  // Modal states
  const [modalMode, setModalMode] = useState(null); // 'check-in' or 'check-out'
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Live Location & Selfie for modal
  const [locationData, setLocationData] = useState(null);
  const [capturedSelfie, setCapturedSelfie] = useState(null);

  // Leave Form state
  const [leaveType, setLeaveType] = useState('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState({ type: '', text: '' });

  // WFH Form state
  const [wfhStartDate, setWfhStartDate] = useState('');
  const [wfhEndDate, setWfhEndDate] = useState('');
  const [wfhReason, setWfhReason] = useState('');
  const [wfhSubmitting, setWfhSubmitting] = useState(false);
  const [wfhMsg, setWfhMsg] = useState({ type: '', text: '' });

  // Shift Timer
  const [shiftElapsed, setShiftElapsed] = useState('');

  // My Attendance History Filter & Download state
  const [historyFilter, setHistoryFilter] = useState('this_month'); // 'this_month', 'previous_month', 'custom'
  const [customHistoryStart, setCustomHistoryStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [customHistoryEnd, setCustomHistoryEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historySummary, setHistorySummary] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [downloadPdfLoading, setDownloadPdfLoading] = useState(false);
  const [downloadExcelLoading, setDownloadExcelLoading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [selectedSelfie, setSelectedSelfie] = useState(null);

  const loadMyHistory = async (filter = historyFilter, start = customHistoryStart, end = customHistoryEnd) => {
    setHistoryLoading(true);
    setDownloadError('');
    setShowAllHistory(false); // Default to showing only recent 3 days on filter change
    try {
      const params = { filterType: filter };
      if (filter === 'custom') {
        params.startDate = start;
        params.endDate = end;
      }
      const res = await apiGetMyAttendanceHistory(params);
      if (res.success) {
        setHistoryRecords(res.records || []);
        setHistorySummary(res.summary || null);
      }
    } catch (err) {
      console.error('Error loading my attendance history:', err);
      setDownloadError(err.message || 'Failed to load attendance history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDownloadReport = async (format) => {
    if (format === 'pdf') setDownloadPdfLoading(true);
    else setDownloadExcelLoading(true);
    setDownloadError('');

    try {
      const params = {
        format,
        filterType: historyFilter
      };
      if (historyFilter === 'custom') {
        if (!customHistoryStart || !customHistoryEnd) {
          throw new Error('Please select both Start Date and End Date.');
        }
        if (customHistoryStart > customHistoryEnd) {
          throw new Error('Start Date cannot be after End Date.');
        }
        params.startDate = customHistoryStart;
        params.endDate = customHistoryEnd;
      }

      await apiDownloadMyAttendance(params);
    } catch (err) {
      setDownloadError(err.message || `Failed to download ${format.toUpperCase()} report.`);
    } finally {
      if (format === 'pdf') setDownloadPdfLoading(false);
      else setDownloadExcelLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [todayRes, statsRes, histRes, leavesRes, wfhRes] = await Promise.all([
        apiGetTodayAttendance(),
        apiGetAttendanceStats(),
        apiGetAttendanceHistory({ limit: 30 }),
        apiGetMyLeaves(),
        apiGetMyWFH()
      ]);

      if (todayRes.success) {
        setTodayAttendance(todayRes.attendance);
        setIsWfhApprovedToday(Boolean(todayRes.isWfhApprovedToday));
        setWfhTodayRequest(todayRes.wfhRequest || null);
        if (todayRes.campSettings) setCampSettings(todayRes.campSettings);
        if (todayRes.attendance?.attendance_mode) {
          setSelectedMode(todayRes.attendance.attendance_mode);
        }
      }
      if (statsRes.success) setStats(statsRes.stats);
      if (histRes.success) setHistory(histRes.history);
      if (leavesRes.success) setLeaves(leavesRes.leaves);
      if (wfhRes.success) setWfhList(wfhRes.requests);
    } catch (err) {
      console.error('Error loading employee dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadMyHistory('this_month');
  }, []);

  useEffect(() => {
    if (historyFilter !== 'custom') {
      loadMyHistory(historyFilter);
    }
  }, [historyFilter]);

  // Update shift timer every second if checked in
  useEffect(() => {
    if (!todayAttendance || !todayAttendance.check_in_time || todayAttendance.check_out_time) {
      setShiftElapsed('');
      return;
    }

    const interval = setInterval(() => {
      const checkIn = parseISTDate(todayAttendance.check_in_time);
      if (!checkIn) return;
      const now = new Date();
      const diffMs = Math.max(0, now - checkIn);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      setShiftElapsed(
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [todayAttendance]);

  const openAttendanceModal = (mode) => {
    setModalMode(mode);
    setCapturedSelfie(null);
    setSubmitError('');
    setSubmitSuccess('');
  };

  const closeAttendanceModal = () => {
    setModalMode(null);
    setCapturedSelfie(null);
    setSubmitError('');
    setSubmitSuccess('');
  };

  // Determine which attendance mode applies for the active modal action
  const currentActionAttendanceMode =
    modalMode === 'check-out' && todayAttendance?.attendance_mode
      ? todayAttendance.attendance_mode
      : selectedMode;

  const handleSubmitAttendance = async () => {
    const activeMode = currentActionAttendanceMode;

    // Mode-specific validation before submission
    if (activeMode === 'OFFICE') {
      if (!locationData || locationData.latitude === null || locationData.longitude === null) {
        setSubmitError('Physical GPS lock is required for Office attendance. Please wait for coordinates or allow location permission.');
        return;
      }

      if (!locationData.isWithinGeofence) {
        setSubmitError(
          `Office Geofence restriction: You are ${Math.round(locationData.distance)}m away from office. Check-in is only permitted within ${officeSettings?.allowed_radius_meters || 100}m.`
        );
        return;
      }
    } else if (activeMode === 'WFH') {
      if (modalMode === 'check-in' && !isWfhApprovedToday) {
        setSubmitError(
          'Work From Home attendance is only allowed on approved dates. You do not have an approved WFH request for today. Please apply for WFH approval or choose Office / Camp mode.'
        );
        return;
      }
    } else if (activeMode === 'CAMP') {
      // CAMP ATTENDANCE:
      // Independent, no admin approval required, no geofence.
      // GPS coordinates recorded when permission granted.
      // Handled cleanly without blocking if permission denied.
    }

    if (!capturedSelfie) {
      setSubmitError('A live camera verification selfie is required.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        latitude: locationData?.latitude ?? null,
        longitude: locationData?.longitude ?? null,
        selfieImage: capturedSelfie,
        attendanceMode: activeMode
      };

      if (modalMode === 'check-in') {
        const res = await apiCheckIn(payload);
        setSubmitSuccess(res.message);
      } else {
        const res = await apiCheckOut(payload);
        setSubmitSuccess(res.message);
      }

      await loadData();
      await loadMyHistory();
      setTimeout(() => {
        closeAttendanceModal();
      }, 1500);
    } catch (err) {
      setSubmitError(err.message || 'Attendance submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate || !leaveReason.trim()) {
      setLeaveMsg({ type: 'error', text: 'Please complete all required fields.' });
      return;
    }

    setLeaveSubmitting(true);
    setLeaveMsg({ type: '', text: '' });

    try {
      const res = await apiApplyLeave({
        leaveType,
        startDate,
        endDate,
        reason: leaveReason
      });

      setLeaveMsg({ type: 'success', text: res.message || 'Leave request submitted!' });
      setStartDate('');
      setEndDate('');
      setLeaveReason('');
      const leavesRes = await apiGetMyLeaves();
      if (leavesRes.success) setLeaves(leavesRes.leaves);
    } catch (err) {
      setLeaveMsg({ type: 'error', text: err.message || 'Failed to submit leave.' });
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleApplyWFH = async (e) => {
    e.preventDefault();
    const start = (wfhStartDate || '').trim();
    const end = (wfhEndDate || start).trim();

    if (!start || !wfhReason.trim()) {
      setWfhMsg({ type: 'error', text: 'Please select a WFH date and describe your reason for remote work.' });
      return;
    }

    if (start > end) {
      setWfhMsg({ type: 'error', text: 'End Date cannot be earlier than Start Date.' });
      return;
    }

    // Frontend overlap / duplicate check
    const hasOverlap = (wfhList || []).some((w) => {
      if (w.status === 'Rejected') return false;
      const exStart = (w.start_date || '').split('T')[0];
      const exEnd = (w.end_date || '').split('T')[0] || exStart;
      return exStart <= end && exEnd >= start;
    });

    if (hasOverlap) {
      setWfhMsg({
        type: 'error',
        text: 'You already have an active (Pending or Approved) WFH request covering this date period.'
      });
      return;
    }

    setWfhSubmitting(true);
    setWfhMsg({ type: '', text: '' });

    try {
      const res = await apiApplyWFH({
        startDate: start,
        endDate: end,
        reason: wfhReason.trim()
      });

      setWfhMsg({
        type: 'success',
        text: res.message || 'Work From Home request submitted successfully for Admin approval!'
      });
      setWfhStartDate('');
      setWfhEndDate('');
      setWfhReason('');

      // Refresh all employee data
      await loadAllData();
      const wfhRes = await apiGetMyWFH();
      if (wfhRes && wfhRes.success) setWfhList(wfhRes.requests || []);
    } catch (err) {
      setWfhMsg({ type: 'error', text: err.message || 'Failed to submit WFH request.' });
    } finally {
      setWfhSubmitting(false);
    }
  };

  const parseISTDate = (dateVal) => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
    if (typeof dateVal === 'number') return new Date(dateVal);
    if (typeof dateVal !== 'string') return null;
    const trimmed = dateVal.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T00:00:00+05:30`);
      return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(trimmed)) {
      const normalized = trimmed.replace(' ', 'T');
      const d = new Date(`${normalized}+05:30`);
      return isNaN(d.getTime()) ? null : d;
    }
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  };

  const formatTime = (dateStr) => {
    const d = parseISTDate(dateStr);
    if (!d) return '--:--';
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const istWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date());
  const isTodaySunday = istWeekday === 'Sun';
  const isTodaySaturday = istWeekday === 'Sat';

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Employee Header Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-8 bg-gradient-to-r from-blue-950/60 via-slate-900/90 to-slate-950 border border-blue-500/20 backdrop-blur-xl shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl sm:text-2xl font-black shadow-xl shadow-blue-600/30 flex-shrink-0 select-none">
              <span className="text-white text-white-forced employee-avatar-text leading-none font-black" style={{ color: '#ffffff' }}>
                {user.displayName ? user.displayName[0].toUpperCase() : 'E'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">
                  Welcome, {user.displayName}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 text-[10px] sm:text-xs font-semibold border border-blue-500/30 flex-shrink-0">
                  {user.employeeId || 'SW-Staff'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 sm:mt-1 truncate">
                {user.designation || 'Staff Member'} • {user.department || 'SheWings Foundation'}
              </p>
            </div>
          </div>

          {/* Office Geofence Quick Badge */}
          <div className="bg-slate-900/80 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-800 text-left sm:text-right w-full sm:w-auto">
            <div className="text-[11px] sm:text-xs text-slate-400">Assigned Office</div>
            <div className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 justify-start sm:justify-end">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              {officeSettings?.office_name || 'Noida HQ'}
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
              {isTodaySunday ? (
                <span className="text-emerald-400 font-semibold">Sunday: Weekly Off</span>
              ) : isTodaySaturday ? (
                <span className="text-blue-300">Sat Shift: 9:30 AM – 6:00 PM (8.5h)</span>
              ) : (
                <span className="text-slate-300">Mon–Fri Shift: 9:30 AM – 6:30 PM (9.0h)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 1. THREE ATTENDANCE MODES CARDS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Attendance Modes</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Select your working mode before checking in. Camp attendance works independently without geofence or Admin approval.
            </p>
          </div>
          {todayAttendance?.check_in_time && (
            <div className="flex items-center gap-1.5 self-start sm:self-auto px-2.5 sm:px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] sm:text-xs font-mono">
              <span className="text-slate-400">Active Shift:</span>
              <span className={`font-bold ${
                todayAttendance.attendance_mode === 'CAMP'
                  ? 'text-amber-400'
                  : todayAttendance.attendance_mode === 'WFH'
                  ? 'text-purple-400'
                  : 'text-blue-400'
              }`}>
                {todayAttendance.attendance_mode || 'OFFICE'}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {/* Card 1: Office Attendance */}
          <button
            type="button"
            id="mode-card-office"
            disabled={Boolean(todayAttendance?.check_in_time)}
            onClick={() => setSelectedMode('OFFICE')}
            className={`p-4 sm:p-5 rounded-2xl border text-left transition relative flex flex-col justify-between ${
              selectedMode === 'OFFICE'
                ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-500/10 ring-2 ring-blue-500/30'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            } ${todayAttendance?.check_in_time ? 'cursor-default opacity-85' : 'cursor-pointer active:scale-[0.99]'}`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 sm:p-2.5 rounded-xl border ${
                  selectedMode === 'OFFICE' ? 'bg-blue-600/20 text-blue-400 border-blue-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  100m Geofence
                </span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1">Office Attendance</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Standard reporting at office headquarters. Physical GPS geofence validation within 100 meters and live selfie required.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-mono">Mon-Fri: 9:30 AM</span>
              {selectedMode === 'OFFICE' && (
                <span className="flex items-center gap-1 text-blue-400 font-semibold">
                  <Check className="w-3.5 h-3.5" /> Selected
                </span>
              )}
            </div>
          </button>

          {/* Card 2: Work From Home */}
          <button
            type="button"
            id="mode-card-wfh"
            disabled={Boolean(todayAttendance?.check_in_time)}
            onClick={() => setSelectedMode('WFH')}
            className={`p-4 sm:p-5 rounded-2xl border text-left transition relative flex flex-col justify-between ${
              selectedMode === 'WFH'
                ? 'bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-500/10 ring-2 ring-purple-500/30'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            } ${todayAttendance?.check_in_time ? 'cursor-default opacity-85' : 'cursor-pointer active:scale-[0.99]'}`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 sm:p-2.5 rounded-xl border ${
                  selectedMode === 'WFH' ? 'bg-purple-600/20 text-purple-400 border-purple-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  <Home className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className={`px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                  isWfhApprovedToday
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}>
                  {isWfhApprovedToday ? 'Approved Today' : 'Approval Required'}
                </span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1">Work From Home</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Remote attendance for pre-approved dates. Office geofence bypassed. Live selfie required for verification.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">
                {isWfhApprovedToday ? 'Ready to Check In' : 'Requires Approved WFH'}
              </span>
              {selectedMode === 'WFH' && (
                <span className="flex items-center gap-1 text-purple-400 font-semibold">
                  <Check className="w-3.5 h-3.5" /> Selected
                </span>
              )}
            </div>
          </button>

          {/* Card 3: Camp Attendance */}
          <button
            type="button"
            id="mode-card-camp"
            disabled={Boolean(todayAttendance?.check_in_time)}
            onClick={() => setSelectedMode('CAMP')}
            className={`p-4 sm:p-5 rounded-2xl border text-left transition relative flex flex-col justify-between ${
              selectedMode === 'CAMP'
                ? 'bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/10 ring-2 ring-amber-500/30'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            } ${todayAttendance?.check_in_time ? 'cursor-default opacity-85' : 'cursor-pointer active:scale-[0.99]'}`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 sm:p-2.5 rounded-xl border ${
                  selectedMode === 'CAMP' ? 'bg-amber-600/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  <Tent className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  Direct Field Access
                </span>
              </div>
              <h3 className="font-bold text-white text-sm mb-1">Camp Attendance</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Health & awareness camps at varied locations. No preconfigured geofence, Admin approval, or assignment required.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">GPS + Live Selfie</span>
              {selectedMode === 'CAMP' && (
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <Check className="w-3.5 h-3.5" /> Selected
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Main Attendance Action Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Check-In / Check-Out Widget */}
        <div className="lg:col-span-2 rounded-2xl sm:rounded-3xl p-4 sm:p-8 bg-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border flex-shrink-0 ${
                  (todayAttendance?.attendance_mode || selectedMode) === 'CAMP'
                    ? 'bg-amber-600/10 text-amber-400 border-amber-500/20'
                    : (todayAttendance?.attendance_mode || selectedMode) === 'WFH'
                    ? 'bg-purple-600/10 text-purple-400 border-purple-500/20'
                    : 'bg-blue-600/10 text-blue-400 border-blue-500/20'
                }`}>
                  {(todayAttendance?.attendance_mode || selectedMode) === 'CAMP' ? (
                    <Tent className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (todayAttendance?.attendance_mode || selectedMode) === 'WFH' ? (
                    <Home className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">Daily Attendance Terminal</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 ${
                      (todayAttendance?.attendance_mode || selectedMode) === 'CAMP'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : (todayAttendance?.attendance_mode || selectedMode) === 'WFH'
                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                    }`}>
                      {todayAttendance?.attendance_mode ? `${todayAttendance.attendance_mode} MODE` : `${selectedMode} MODE SELECTED`}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                    {(todayAttendance?.attendance_mode || selectedMode) === 'CAMP'
                      ? 'Camp Duty: Direct check-in without geofence or Admin approval'
                      : (todayAttendance?.attendance_mode || selectedMode) === 'WFH'
                      ? 'Remote Duty: Requires approved WFH request for today'
                      : 'Office Duty: Verified physical presence within 100m geofence'}
                  </p>
                </div>
              </div>

              {/* Status pill */}
              <div className="self-start sm:self-auto flex-shrink-0">
                {!todayAttendance ? (
                  <span className="px-2.5 sm:px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700">
                    Not Checked In
                  </span>
                ) : todayAttendance.check_out_time ? (
                  <span className="px-2.5 sm:px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Shift Completed
                  </span>
                ) : (
                  <span className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                    todayAttendance.status === 'Late'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Currently On Duty ({todayAttendance.status})
                  </span>
                )}
              </div>
            </div>

            {/* Shift Tracker Display */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 my-4 sm:my-6">
              {/* Check-In Status */}
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 mb-1">Check-In Time</div>
                <div className="text-base sm:text-lg font-bold text-white font-mono">
                  {todayAttendance?.check_in_time ? formatTime(todayAttendance.check_in_time) : '--:--'}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <SelfieThumbnail
                    src={todayAttendance?.check_in_selfie}
                    alt="Check-in selfie"
                    className="w-8 h-8 sm:w-9 sm:h-9"
                  />
                  <span className="text-[11px] text-slate-400">
                    {todayAttendance?.check_in_selfie
                      ? 'Selfie Verified'
                      : todayAttendance?.check_in_time
                      ? 'No Selfie on Record'
                      : 'Pending Check-In'}
                  </span>
                </div>
              </div>

              {/* Live Working Timer */}
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-950/20 border border-blue-500/20">
                <div className="text-xs text-blue-300 mb-1">
                  {todayAttendance?.check_out_time ? 'Total Worked Time' : 'Active Shift Duration'}
                </div>
                <div className="text-lg sm:text-xl font-black text-blue-300 font-mono">
                  {todayAttendance?.check_out_time
                    ? `${Math.floor(todayAttendance.total_working_minutes / 60)}h ${todayAttendance.total_working_minutes % 60}m`
                    : shiftElapsed || '--:--:--'}
                </div>
              </div>

              {/* Check-Out Status */}
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 mb-1">Check-Out Time</div>
                <div className="text-base sm:text-lg font-bold text-white font-mono">
                  {todayAttendance?.check_out_time ? formatTime(todayAttendance.check_out_time) : '--:--'}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <SelfieThumbnail
                    src={todayAttendance?.check_out_selfie}
                    alt="Check-out selfie"
                    className="w-8 h-8 sm:w-9 sm:h-9"
                  />
                  <span className="text-[11px] text-slate-400">
                    {todayAttendance?.check_out_selfie
                      ? 'Selfie Verified'
                      : todayAttendance?.check_out_time
                      ? 'No Selfie on Record'
                      : todayAttendance?.check_in_time
                      ? 'Awaiting Check-Out'
                      : 'Not Started'}
                  </span>
                </div>
              </div>
            </div>

            {isTodaySunday && (
              <div className="p-3.5 rounded-xl sm:rounded-2xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-200 text-xs flex items-center gap-2.5">
                <span className="font-bold bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] sm:text-[11px] text-emerald-300">
                  Weekly Off
                </span>
                <span className="text-[11px] sm:text-xs">Sunday is an official weekly off at SheWings Foundation. Employees are never marked absent today.</span>
              </div>
            )}
          </div>

          {/* Action Button Section: Clearly visible Check In and Check Out buttons */}
          <div className="pt-4 border-t border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="text-xs text-slate-400 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></span>
                <span className="font-semibold text-slate-200 text-xs">
                  {currentActionAttendanceMode === 'CAMP' && campSettings?.customTimingsEnabled
                    ? `Camp Shift Reporting: ${campSettings.workStartTime || '9:30 AM'} (Grace: ${campSettings.gracePeriodMinutes || 15}m)`
                    : 'Official Office Reporting: 9:30 AM (Asia/Kolkata)'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 pl-4">
                15m Grace: &le; 09:45:00 AM is <span className="text-emerald-400 font-semibold">ON TIME</span> &bull; 09:45:01 AM+ is <span className="text-amber-400 font-semibold">LATE</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
              {/* Check In Button */}
              <button
                type="button"
                id="btn-check-in"
                onClick={() => openAttendanceModal('check-in')}
                disabled={Boolean(todayAttendance?.check_in_time)}
                className={`w-full sm:w-auto px-5 py-3 min-h-[46px] rounded-xl sm:rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                  !todayAttendance?.check_in_time
                    ? currentActionAttendanceMode === 'CAMP'
                      ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-xl shadow-amber-600/30 active:scale-98 ring-2 ring-amber-400/40 cursor-pointer'
                      : currentActionAttendanceMode === 'WFH'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-xl shadow-purple-600/30 active:scale-98 ring-2 ring-purple-400/40 cursor-pointer'
                      : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-xl shadow-blue-600/30 active:scale-98 ring-2 ring-blue-400/40 cursor-pointer'
                    : 'bg-slate-800/80 border border-slate-700/60 text-slate-400 cursor-not-allowed'
                }`}
                title={
                  todayAttendance?.check_in_time
                    ? `Checked in at ${formatTime(todayAttendance.check_in_time)}`
                    : `Click to open camera & check in for ${currentActionAttendanceMode} mode`
                }
              >
                <Camera className="w-4 h-4 flex-shrink-0" />
                {todayAttendance?.check_in_time ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs sm:text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Checked In ({formatTime(todayAttendance.check_in_time)})
                  </span>
                ) : (
                  <span>Check In ({currentActionAttendanceMode})</span>
                )}
              </button>

              {/* Check Out Button */}
              <button
                type="button"
                id="btn-check-out"
                onClick={() => openAttendanceModal('check-out')}
                disabled={!todayAttendance?.check_in_time || Boolean(todayAttendance?.check_out_time)}
                className={`w-full sm:w-auto px-5 py-3 min-h-[46px] rounded-xl sm:rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                  todayAttendance?.check_in_time && !todayAttendance?.check_out_time
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-xl shadow-indigo-600/30 active:scale-98 ring-2 ring-indigo-400/40 cursor-pointer'
                    : todayAttendance?.check_out_time
                    ? 'bg-slate-800/80 border border-slate-700/60 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-800/40 border border-slate-800/80 text-slate-500 cursor-not-allowed'
                }`}
                title={
                  todayAttendance?.check_out_time
                    ? `Checked out at ${formatTime(todayAttendance.check_out_time)}`
                    : !todayAttendance?.check_in_time
                    ? 'Check in first to enable Check Out'
                    : 'Click to open camera & check out with selfie and GPS'
                }
              >
                <Camera className="w-4 h-4 text-indigo-300 flex-shrink-0" />
                {todayAttendance?.check_out_time ? (
                  <span className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs sm:text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Checked Out ({formatTime(todayAttendance.check_out_time)})
                  </span>
                ) : (
                  <span>Check Out</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Employee Performance Metrics */}
        <div className="rounded-2xl sm:rounded-3xl p-4 sm:p-6 bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            Monthly Attendance Stats
          </h3>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="text-[11px] sm:text-xs text-slate-400">Total Logged</div>
              <div className="text-lg sm:text-xl font-black text-white mt-1">
                {stats?.totalDays || 0} <span className="text-[10px] sm:text-xs font-normal text-slate-400">days</span>
              </div>
            </div>

            <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-950/20 border border-emerald-500/20">
              <div className="text-[11px] sm:text-xs text-emerald-400">On-Time (Present)</div>
              <div className="text-lg sm:text-xl font-black text-emerald-300 mt-1">
                {stats?.presentDays || 0} <span className="text-[10px] sm:text-xs font-normal text-slate-400">days</span>
              </div>
            </div>

            <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-amber-950/20 border border-amber-500/20">
              <div className="text-[11px] sm:text-xs text-amber-400">Camp Days</div>
              <div className="text-lg sm:text-xl font-black text-amber-300 mt-1">
                {stats?.campDays || 0} <span className="text-[10px] sm:text-xs font-normal text-slate-400">camps</span>
              </div>
            </div>

            <div className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-purple-950/20 border border-purple-500/20">
              <div className="text-[11px] sm:text-xs text-purple-400">WFH Days</div>
              <div className="text-lg sm:text-xl font-black text-purple-300 mt-1">
                {stats?.wfhDays || 0} <span className="text-[10px] sm:text-xs font-normal text-slate-400">days</span>
              </div>
            </div>
          </div>

          <div className="mt-3.5 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Total Hours Worked:</span>
            <span className="font-bold text-blue-300 px-2 py-0.5 rounded-full bg-blue-500/20 font-mono">
              {stats?.totalHoursWorked || '0.0'} hrs
            </span>
          </div>
        </div>
      </div>

      {/* Tabs: Attendance History vs WFH Requests vs Leaves */}
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-1.5 sm:gap-3 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
          <button
            type="button"
            id="tab-history"
            onClick={() => setActiveTab('attendance')}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center gap-1.5 ${
              activeTab === 'attendance'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>My Attendance</span>
          </button>
          <button
            type="button"
            id="tab-wfh"
            onClick={() => setActiveTab('wfh')}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center gap-1.5 ${
              activeTab === 'wfh'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            Work From Home (WFH)
            {wfhList.some((w) => w.status === 'Pending') && (
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            )}
          </button>
          <button
            type="button"
            id="tab-leaves"
            onClick={() => setActiveTab('leaves')}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[38px] flex items-center justify-center gap-1.5 ${
              activeTab === 'leaves'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Apply & View Leaves
          </button>
        </div>

        {activeTab === 'attendance' ? (
          /* My Attendance Section: Full history, Monthly/Custom Filters & PDF/Excel Download */
          <div className="space-y-4">
            {/* WFH Status & Application Banner under My Attendance */}
            {wfhList && wfhList.length > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/90 border border-purple-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30 flex-shrink-0">
                    <Home className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-sm">Work From Home (WFH) Status</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        wfhList[0].status === 'Approved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : wfhList[0].status === 'Rejected'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                      }`}>
                        {wfhList[0].status === 'Pending' ? 'Pending Admin Review' : wfhList[0].status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300">
                      <span>Requested for: </span>
                      <strong className="text-white font-mono">
                        {wfhList[0].start_date ? (
                          wfhList[0].start_date.split('T')[0] === (wfhList[0].end_date ? wfhList[0].end_date.split('T')[0] : '')
                            ? wfhList[0].start_date.split('T')[0]
                            : `${wfhList[0].start_date.split('T')[0]} to ${wfhList[0].end_date.split('T')[0]}`
                        ) : ''}
                      </strong>
                      <span className="text-slate-500 mx-1.5">•</span>
                      <span className="italic text-slate-400">"{wfhList[0].reason}"</span>
                    </div>
                    {wfhList[0].review_notes && (
                      <div className="text-[11px] text-purple-300">
                        Admin Note: "{wfhList[0].review_notes}"
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('wfh')}
                  className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/40 text-xs font-semibold transition w-fit whitespace-nowrap self-start md:self-auto flex items-center gap-1.5"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>View All WFH Requests ({wfhList.length}) →</span>
                </button>
              </div>
            )}

            <div className="rounded-2xl sm:rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
              {/* Header with Title and Download Buttons */}
              <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    <span>My Attendance</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View your daily attendance history and download verified reports in PDF and Excel
                  </p>
                </div>

                {/* Download Actions for Employee */}
                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() => handleDownloadReport('excel')}
                    disabled={downloadExcelLoading || downloadPdfLoading}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-semibold shadow-sm transition min-h-[38px] disabled:opacity-50"
                    title="Download your attendance history in Excel format"
                  >
                    {downloadExcelLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadReport('pdf')}
                    disabled={downloadExcelLoading || downloadPdfLoading}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white text-xs font-semibold shadow-md shadow-blue-600/30 transition min-h-[38px] disabled:opacity-50"
                    title="Download your attendance history in official PDF format"
                  >
                    {downloadPdfLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>

              {/* Date Filters Bar */}
              <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                    Date Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('this_month')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border min-h-[34px] ${
                      historyFilter === 'this_month'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-600/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('previous_month')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border min-h-[34px] ${
                      historyFilter === 'previous_month'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-600/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Previous Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('custom')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border min-h-[34px] ${
                      historyFilter === 'custom'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-600/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>

                {/* Custom Date Pickers */}
                {historyFilter === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">From:</span>
                      <input
                        type="date"
                        value={customHistoryStart}
                        onChange={(e) => setCustomHistoryStart(e.target.value)}
                        className="py-1.5 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">To:</span>
                      <input
                        type="date"
                        value={customHistoryEnd}
                        onChange={(e) => setCustomHistoryEnd(e.target.value)}
                        className="py-1.5 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => loadMyHistory('custom', customHistoryStart, customHistoryEnd)}
                      disabled={historyLoading}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>

              {downloadError && (
                <div className="m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{downloadError}</span>
                </div>
              )}

              {/* KPI Performance Summary for Filtered Range */}
              {historySummary && (
                <div className="p-4 bg-slate-950/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Days</div>
                    <div className="text-base font-bold text-white mt-0.5">{historySummary.totalDays}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-center">
                    <div className="text-[10px] text-emerald-400 uppercase font-semibold">Present</div>
                    <div className="text-base font-bold text-emerald-300 mt-0.5">{historySummary.presentDays}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/20 text-center">
                    <div className="text-[10px] text-amber-400 uppercase font-semibold">Late</div>
                    <div className="text-base font-bold text-amber-300 mt-0.5">{historySummary.lateDays}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/20 text-center">
                    <div className="text-[10px] text-rose-400 uppercase font-semibold">Absent</div>
                    <div className="text-base font-bold text-rose-300 mt-0.5">{historySummary.absentDays}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/20 text-center">
                    <div className="text-[10px] text-purple-400 uppercase font-semibold">WFH</div>
                    <div className="text-base font-bold text-purple-300 mt-0.5">{historySummary.wfhDays}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/20 text-center">
                    <div className="text-[10px] text-amber-400 uppercase font-semibold">Camp</div>
                    <div className="text-base font-bold text-amber-300 mt-0.5">{historySummary.campDays}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/20 text-center col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-blue-400 uppercase font-semibold">Hours Worked</div>
                    <div className="text-base font-bold text-blue-300 mt-0.5 font-mono">{historySummary.totalHoursWorked}h</div>
                  </div>
                </div>
              )}

              {/* Mobile Scroll Indicator Banner */}
              <div className="sm:hidden px-3.5 py-1.5 bg-blue-500/10 border-b border-blue-500/20 text-blue-300 text-[10px] flex items-center gap-1.5 font-medium">
                <span>← Swipe table horizontally for full details →</span>
              </div>

              {/* Daily Records Table */}
              {historyLoading ? (
                <div className="p-12 text-center text-slate-400 text-xs sm:text-sm flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                  <span>Loading attendance history...</span>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs sm:text-sm">
                  No attendance records found for the selected period.
                </div>
              ) : (
                <>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="My Attendance Daily History"
                    className="table-responsive-container max-w-full"
                  >
                    <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[780px]">
                      <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800 sticky top-0 z-10">
                        <tr>
                          <th className="py-3.5 px-4">Date</th>
                          <th className="py-3.5 px-4">Day</th>
                          <th className="py-3.5 px-4">Attendance Type</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4">Selfie / Photo</th>
                          <th className="py-3.5 px-4">Check-In</th>
                          <th className="py-3.5 px-4">Check-Out</th>
                          <th className="py-3.5 px-4">Working Hours</th>
                          <th className="py-3.5 px-4">Notes / Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {(showAllHistory ? historyRecords : historyRecords.slice(0, 3)).map((record, idx) => {
                          const mode = (record.attendance_mode || '--').toUpperCase();
                          return (
                            <tr key={`${record.date}-${idx}`} className="hover:bg-slate-800/30 transition">
                              <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                                {record.date}
                              </td>
                              <td className="py-3 px-4 text-slate-400 whitespace-nowrap text-xs">
                                {record.day}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {mode === 'CAMP' ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                                    <Tent className="w-3 h-3" /> Camp
                                  </span>
                                ) : mode === 'WFH' ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1">
                                    <Home className="w-3 h-3" /> WFH
                                  </span>
                                ) : mode === 'OFFICE' ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
                                    <Building2 className="w-3 h-3" /> Office
                                  </span>
                                ) : (
                                  <span className="text-slate-600 font-mono text-xs">--</span>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                                    record.status === 'Present'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : record.status === 'Late'
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                      : record.status === 'Absent'
                                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                      : record.status === 'On Leave'
                                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                      : record.status === 'Weekly Off'
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                                  }`}
                                >
                                  {record.status === 'Present' ? 'Present (On-Time)' : record.status}
                                </span>
                              </td>
                              {/* Selfie / Photo */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                {record.check_in_selfie || record.check_out_selfie ? (
                                  <div className="flex items-center gap-1.5">
                                    {record.check_in_selfie ? (
                                      <SelfieThumbnail
                                        src={record.check_in_selfie}
                                        alt={`Check-in selfie on ${record.date}`}
                                        className="w-8 h-8 rounded-xl cursor-pointer"
                                        onClick={() =>
                                          setSelectedSelfie({
                                            url: record.check_in_selfie.startsWith('http')
                                              ? record.check_in_selfie
                                              : `${BACKEND_URL}${record.check_in_selfie}`,
                                            label: `Check-In Selfie (${record.date})`,
                                            subLabel: `${record.day} • Mode: ${record.attendance_mode || 'OFFICE'}`,
                                            mode: record.attendance_mode || 'OFFICE',
                                            status: record.status,
                                            time: record.check_in_raw,
                                            distance: record.check_in_distance_m
                                          })
                                        }
                                      />
                                    ) : null}
                                    {record.check_out_selfie ? (
                                      <SelfieThumbnail
                                        src={record.check_out_selfie}
                                        alt={`Check-out selfie on ${record.date}`}
                                        className="w-8 h-8 rounded-xl cursor-pointer"
                                        onClick={() =>
                                          setSelectedSelfie({
                                            url: record.check_out_selfie.startsWith('http')
                                              ? record.check_out_selfie
                                              : `${BACKEND_URL}${record.check_out_selfie}`,
                                            label: `Check-Out Selfie (${record.date})`,
                                            subLabel: `${record.day} • Mode: ${record.attendance_mode || 'OFFICE'}`,
                                            mode: record.attendance_mode || 'OFFICE',
                                            status: record.status,
                                            time: record.check_out_raw,
                                            distance: null
                                          })
                                        }
                                      />
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 text-xs italic">No Photo</span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                                {record.check_in_display}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                                {record.check_out_display}
                              </td>
                              <td className="py-3 px-4 text-slate-200 whitespace-nowrap font-mono font-semibold">
                                {record.formatted_duration}
                              </td>
                              <td className="py-3 px-4 text-slate-400 text-xs max-w-xs truncate" title={record.notes}>
                                {record.notes || '--'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom Action Bar: View All Attendance */}
                  {historyRecords.length > 3 && (
                    <div className="p-3.5 bg-slate-950/60 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <span className="text-slate-400 text-[11px]">
                        {showAllHistory
                          ? `Displaying all ${historyRecords.length} records for ${historyFilter === 'this_month' ? 'This Month' : historyFilter === 'previous_month' ? 'Previous Month' : 'Selected Period'}`
                          : `Displaying latest 3 days. Total ${historyRecords.length} days recorded for this period.`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAllHistory(!showAllHistory)}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/25 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      >
                        {showAllHistory ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            <span>Show Recent (3 Days)</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            <span>View All Attendance ({historyRecords.length} Days)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : activeTab === 'wfh' ? (
          /* Work From Home (WFH) Management */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Apply WFH Form */}
            <div className="rounded-3xl p-6 bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Home className="w-4 h-4 text-purple-400" />
                Apply for Work From Home
              </h3>

              {wfhMsg.text && (
                <div
                  className={`p-3 rounded-xl mb-4 text-xs font-medium border ${
                    wfhMsg.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {wfhMsg.text}
                </div>
              )}

              <form onSubmit={handleApplyWFH} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Start Date</label>
                  <input
                    type="date"
                    required
                    value={wfhStartDate}
                    onChange={(e) => {
                      setWfhStartDate(e.target.value);
                      if (!wfhEndDate || wfhEndDate < e.target.value) {
                        setWfhEndDate(e.target.value);
                      }
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">End Date (or same for 1 day)</label>
                  <input
                    type="date"
                    required
                    value={wfhEndDate}
                    min={wfhStartDate || undefined}
                    onChange={(e) => setWfhEndDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Reason for Remote Work</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe remote work arrangement, deliverable, or circumstances..."
                    value={wfhReason}
                    onChange={(e) => setWfhReason(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={wfhSubmitting}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 min-h-[40px]"
                >
                  {wfhSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting WFH Request...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit WFH Request</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* WFH Applications History */}
            <div className="lg:col-span-2 rounded-3xl p-6 bg-slate-900/90 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-purple-400" />
                  My Work From Home Requests
                </h3>
                {isWfhApprovedToday && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Today Approved
                  </span>
                )}
              </div>

              {wfhList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                  <Home className="w-8 h-8 text-purple-400/40 mx-auto mb-2" />
                  <div className="font-semibold text-slate-300">You have not submitted any WFH requests yet</div>
                  <div className="text-slate-500">Apply using the form on the left to request remote work approval.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {wfhList.map((w) => {
                    const startStr = w.start_date ? w.start_date.split('T')[0] : '';
                    const endStr = w.end_date ? w.end_date.split('T')[0] : '';
                    const isSingleDay = !endStr || startStr === endStr;
                    return (
                      <div
                        key={w.id}
                        className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white text-sm">
                              {isSingleDay ? `WFH Date: ${startStr}` : `Remote Period: ${startStr} to ${endStr}`}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                w.status === 'Approved'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : w.status === 'Rejected'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                              }`}
                            >
                              {w.status === 'Pending' ? 'Pending Review' : w.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 italic">"{w.reason}"</div>
                          {w.review_notes && (
                            <div className="text-[11px] text-purple-300">
                              Admin Note: {w.review_notes}
                            </div>
                          )}
                          {w.reviewed_at && (
                            <div className="text-[10px] text-slate-500">
                              Reviewed on {parseISTDate(w.reviewed_at)?.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 sm:text-right flex-shrink-0">
                          Applied: {parseISTDate(w.created_at)?.toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          }) || (w.created_at ? new Date(w.created_at).toLocaleDateString() : '--')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Leaves Management */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Apply Leave Form */}
            <div className="rounded-3xl p-6 bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-400" />
                Apply for Leave
              </h3>

              {leaveMsg.text && (
                <div
                  className={`p-3 rounded-xl mb-4 text-xs font-medium border ${
                    leaveMsg.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {leaveMsg.text}
                </div>
              )}

              <form onSubmit={handleApplyLeave} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Leave Type</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Casual">Casual Leave</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="Earned">Earned Leave</option>
                    <option value="Unpaid">Unpaid Leave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Reason for Leave</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Provide detailed reason for the leave request..."
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={leaveSubmitting}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
                >
                  {leaveSubmitting ? 'Submitting Request...' : 'Submit Leave Application'}
                </button>
              </form>
            </div>

            {/* Leave Applications History */}
            <div className="lg:col-span-2 rounded-3xl p-6 bg-slate-900/90 border border-slate-800 shadow-xl">
              <h3 className="text-base font-bold text-white mb-4">My Leave History</h3>
              {leaves.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  You have not submitted any leave requests yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {leaves.map((l) => (
                    <div
                      key={l.id}
                      className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {l.leave_type} Leave
                          </span>
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
                        <div className="text-xs text-slate-400 mt-1">
                          Period: {l.start_date} to {l.end_date}
                        </div>
                        <div className="text-xs text-slate-300 mt-1 italic">"{l.reason}"</div>
                        {l.review_notes && (
                          <div className="text-[11px] text-blue-300 mt-1">
                            Reviewer Note: {l.review_notes}
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 sm:text-right">
                        Applied on {new Date(l.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Attendance Modal: GPS + Live Selfie Verification */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto no-scrollbar">
          <div className="relative w-full max-w-lg my-auto rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-3.5 sm:p-5 max-h-[92vh] overflow-y-auto no-scrollbar">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-2.5 sm:pb-3 border-b border-slate-800 gap-2">
              <div className="flex items-start sm:items-center gap-2 sm:gap-2.5 min-w-0">
                <div className={`p-1.5 sm:p-2 rounded-xl border flex-shrink-0 ${
                  currentActionAttendanceMode === 'CAMP'
                    ? 'bg-amber-600/20 text-amber-400 border-amber-500/30'
                    : currentActionAttendanceMode === 'WFH'
                    ? 'bg-purple-600/20 text-purple-400 border-purple-500/30'
                    : 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                }`}>
                  {currentActionAttendanceMode === 'CAMP' ? (
                    <Tent className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : currentActionAttendanceMode === 'WFH' ? (
                    <Home className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white capitalize flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span>
                      {modalMode === 'check-in' ? 'Check-In' : 'Check-Out'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${
                      currentActionAttendanceMode === 'CAMP'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : currentActionAttendanceMode === 'WFH'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {currentActionAttendanceMode} MODE
                    </span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                    {currentActionAttendanceMode === 'CAMP'
                      ? 'Camp Duty: Direct check-in at field location (no geofence required)'
                      : currentActionAttendanceMode === 'WFH'
                      ? 'Work From Home: Remote attendance on approved date'
                      : 'Office Duty: Verified physical presence within 100m geofence'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeAttendanceModal}
                className="p-1 sm:p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer flex-shrink-0"
                aria-label="Close modal"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Error or Success alerts */}
            {submitError && (
              <div className="mt-2.5 sm:mt-3 p-2.5 sm:p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{submitError}</span>
              </div>
            )}
            {submitSuccess && (
              <div className="mt-2.5 sm:mt-3 p-2.5 sm:p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                <span>{submitSuccess}</span>
              </div>
            )}

            {/* WFH Not Approved Warning */}
            {currentActionAttendanceMode === 'WFH' && modalMode === 'check-in' && !isWfhApprovedToday && (
              <div className="mt-2.5 sm:mt-3 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>No Approved WFH Request for Today</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Work From Home check-in is restricted to dates pre-approved by Admin. To check in today, please select <span className="font-bold underline cursor-pointer" onClick={() => setSelectedMode('OFFICE')}>Office</span> or <span className="font-bold underline cursor-pointer" onClick={() => setSelectedMode('CAMP')}>Camp Attendance</span>, or submit a request in the WFH tab.
                </p>
              </div>
            )}

            <div className="mt-2.5 sm:mt-3.5 space-y-2.5 sm:space-y-3">
              {/* Step 1: Location & GPS Status */}
              <div>
                <label className="block text-[11px] sm:text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Step 1: Location & GPS Coordinates
                </label>
                <GeoLocationStatus
                  officeSettings={officeSettings}
                  attendanceMode={currentActionAttendanceMode}
                  onLocationUpdate={(loc) => setLocationData(loc)}
                />
              </div>

              {/* Step 2: Camera Selfie Capture */}
              <div>
                <label className="block text-[11px] sm:text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Step 2: Live Facial Selfie
                </label>
                <CameraCapture
                  capturedImage={capturedSelfie}
                  onCapture={(dataUrl) => setCapturedSelfie(dataUrl)}
                  onRetake={() => setCapturedSelfie(null)}
                  onCancel={closeAttendanceModal}
                />
              </div>

              {/* Confirm and Submit button */}
              <div className="pt-2.5 sm:pt-3 border-t border-slate-800">
                <button
                  type="button"
                  id="btn-confirm-attendance"
                  onClick={handleSubmitAttendance}
                  disabled={
                    submitting ||
                    !capturedSelfie ||
                    (currentActionAttendanceMode === 'OFFICE' && !locationData?.isWithinGeofence) ||
                    (currentActionAttendanceMode === 'WFH' && modalMode === 'check-in' && !isWfhApprovedToday)
                  }
                  className={`w-full py-2.5 sm:py-3 min-h-[42px] sm:min-h-[44px] rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm shadow-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer ${
                    currentActionAttendanceMode === 'CAMP'
                      ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:opacity-95 text-white shadow-amber-600/30'
                      : currentActionAttendanceMode === 'WFH'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:opacity-95 text-white shadow-purple-600/30'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white shadow-blue-600/30'
                  }`}
                >
                  {submitting ? (
                    'Recording Attendance in Database...'
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="truncate">Confirm & Submit {currentActionAttendanceMode} {modalMode === 'check-in' ? 'Check-In' : 'Check-Out'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Larger Selfie Preview */}
      {selectedSelfie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-md w-full rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <h4 className="text-sm font-bold text-white truncate pr-2">{selectedSelfie.label}</h4>
                {selectedSelfie.subLabel && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedSelfie.subLabel}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedSelfie(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex-shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black aspect-[4/3] flex items-center justify-center relative">
              <img
                src={selectedSelfie.url}
                alt={selectedSelfie.label}
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-selfie.svg';
                }}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Attendance Mode:</span>
                <span className="font-semibold text-white">{selectedSelfie.mode || 'OFFICE'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Attendance Status:</span>
                <span className={`font-semibold ${selectedSelfie.status === 'Present' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {selectedSelfie.status || 'Present'}
                </span>
              </div>
              {selectedSelfie.time && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Recorded Time:</span>
                  <span className="font-mono text-slate-200">
                    {parseISTDate(selectedSelfie.time)?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || selectedSelfie.time}
                  </span>
                </div>
              )}
              {selectedSelfie.distance !== null && selectedSelfie.distance !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Distance from Office:</span>
                  <span className="text-emerald-400 font-medium">{Math.round(selectedSelfie.distance)}m (Verified)</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSelfie(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

