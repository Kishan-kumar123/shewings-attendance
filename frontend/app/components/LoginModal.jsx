'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, User, Lock, Mail, ArrowRight, Eye, EyeOff,
  UserPlus, Phone, Briefcase, Building2, CheckCircle2
} from 'lucide-react';
import { apiLogin, apiRegister, apiGetDepartments } from '../lib/api';

export default function LoginModal({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [roleTab, setRoleTab] = useState('employee'); // 'employee' or 'admin'

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration form state
  const [regForm, setRegForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    departmentId: '',
    designation: 'Staff Member',
    password: '',
    confirmPassword: ''
  });
  const [departments, setDepartments] = useState([]);

  // Status indicators
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load departments list for registration dropdown
  useEffect(() => {
    let isMounted = true;
    apiGetDepartments()
      .then((res) => {
        if (isMounted && res.success && res.departments) {
          setDepartments(res.departments);
          if (res.departments.length > 0 && !regForm.departmentId) {
            setRegForm((prev) => ({ ...prev, departmentId: String(res.departments[0].id) }));
          }
        }
      })
      .catch((e) => {
        console.warn('Could not fetch departments for registration:', e.message);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTabChange = (tab) => {
    setRoleTab(tab);
    setErrorMsg('');
    setSuccessMsg('');
    setEmail('');
    setPassword('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email address and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiLogin(email.trim(), password, roleTab);
      if (res.success && onLoginSuccess) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const { firstName, lastName, email, password, confirmPassword, phone, departmentId, designation } = regForm;

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMsg('Please fill in all required fields (Name, Email, Password).');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password entry.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRegister({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? phone.trim() : '',
        departmentId: departmentId ? parseInt(departmentId, 10) : null,
        designation: designation.trim() || 'Staff Member',
        password
      });

      if (res.success) {
        setSuccessMsg('Account created successfully! Logging you in...');
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(res.user);
          }
        }, 1000);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed. Please check your inputs or try a different email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center py-3 sm:py-6 px-2 sm:px-4">
      <div className={`w-full ${mode === 'register' ? 'max-w-lg' : 'max-w-md'} mx-auto transition-all duration-300`}>
        {/* Brand Card - Dark Navy and White with Blue accents */}
        <div className="relative rounded-2xl sm:rounded-3xl p-4 sm:p-8 bg-slate-900/95 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Subtle ambient glow in dark navy/blue theme */}
          <div className="absolute -top-24 -left-24 w-52 h-52 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

          {/* Logo & Header */}
          <div className="relative text-center mb-5 sm:mb-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 ring-1 ring-white/10">
              {mode === 'register' ? (
                <UserPlus className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              ) : (
                <span className="text-white font-extrabold text-xl sm:text-2xl tracking-wider">SW</span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {mode === 'register' ? 'Create Staff Account' : 'SheWings Foundation'}
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1 font-medium">
              {mode === 'register'
                ? 'Join SheWings Foundation Office Attendance Management System'
                : 'Office Attendance & Geofenced Facial Verification'}
            </p>
          </div>

          {/* Role Selector Tabs (Only in Login Mode) */}
          {mode === 'login' && (
            <div className="relative grid grid-cols-2 p-1 rounded-xl sm:rounded-2xl bg-slate-950/90 border border-slate-800/80 mb-5 sm:mb-6">
              <button
                type="button"
                id="tab-staff-login"
                onClick={() => handleTabChange('employee')}
                className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg sm:rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-200 ${
                  roleTab === 'employee'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Staff Login</span>
              </button>
              <button
                type="button"
                id="tab-admin-portal"
                onClick={() => handleTabChange('admin')}
                className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg sm:rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-200 ${
                  roleTab === 'admin'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Admin Portal</span>
              </button>
            </div>
          )}

          {/* Alerts: Error & Success */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mode 1: Login Form */}
          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="login-email" className="block text-slate-200 font-semibold mb-1.5">
                  {roleTab === 'admin' ? 'Admin Email Address' : 'Staff Email Address'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="email"
                    id="login-email"
                    name="email"
                    autoComplete="username"
                    required
                    placeholder={roleTab === 'admin' ? 'admin@shewings.org' : 'name@shewings.org'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-slate-200 font-semibold mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password"
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="p-1.5 text-slate-500 hover:text-slate-300 absolute right-2.5 top-2 rounded-lg transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                id="btn-sign-in"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to {roleTab === 'admin' ? 'Admin Portal' : 'Attendance OS'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Toggle to Create Account */}
              <div className="mt-5 text-center">
                <p className="text-xs text-slate-400">
                  New staff member?{' '}
                  <button
                    type="button"
                    id="btn-switch-register"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="font-bold text-blue-400 hover:text-blue-300 underline underline-offset-4 transition"
                  >
                    Create Staff Account
                  </button>
                </p>
              </div>
            </form>
          ) : (
            /* Mode 2: Register Form */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              {/* First & Last Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    First Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Priya"
                      value={regForm.firstName}
                      onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    Last Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sharma"
                    value={regForm.lastName}
                    onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  Email Address (Login Username) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="priya.sharma@shewings.org"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-slate-200 font-semibold mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Department & Designation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">Department</label>
                  <select
                    value={regForm.departmentId}
                    onChange={(e) => setRegForm({ ...regForm, departmentId: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
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
                  <label className="block text-slate-200 font-semibold mb-1">Designation</label>
                  <input
                    type="text"
                    placeholder="Field Officer"
                    value={regForm.designation}
                    onChange={(e) => setRegForm({ ...regForm, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Password & Confirm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    Password (min 6) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    Confirm Password <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={regForm.confirmPassword}
                    onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Show password check */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="show-reg-pw"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                />
                <label htmlFor="show-reg-pw" className="text-slate-400 text-[11px] cursor-pointer">
                  Show passwords
                </label>
              </div>

              {/* Submit Registration */}
              <button
                type="submit"
                id="btn-submit-register"
                disabled={loading}
                className="w-full mt-3 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account & Sign In</span>
                  </>
                )}
              </button>

              {/* Toggle to Sign In */}
              <div className="mt-4 text-center">
                <p className="text-xs text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    id="btn-switch-login"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="font-bold text-blue-400 hover:text-blue-300 underline underline-offset-4 transition"
                  >
                    Sign In here
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* Secure Note & Account Guidance */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center space-y-1.5">
            <p className="text-[11px] text-slate-500">
              Enterprise MySQL authenticated session • Passwords hashed with bcrypt
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
