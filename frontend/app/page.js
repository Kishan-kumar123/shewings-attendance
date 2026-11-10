'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import LoginModal from './components/LoginModal';
import EmployeeDashboard from './components/EmployeeDashboard';
import AdminDashboard from './components/AdminDashboard';
import {
  getAuthToken,
  getStoredUser,
  setStoredUser,
  apiGetCurrentUser,
  apiGetOfficeSettings,
  apiLogout
} from './lib/api';

export default function Home() {
  const [user, setUser] = useState(null);
  const [officeSettings, setOfficeSettings] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Logout handler
  const handleLogout = useCallback(() => {
    apiLogout();
    setUser(null);
    setOfficeSettings(null);
  }, []);

  // Safe loader for office settings only after authentication
  const loadOfficeSettings = async () => {
    try {
      const settingsRes = await apiGetOfficeSettings();
      if (settingsRes && settingsRes.success) {
        setOfficeSettings(settingsRes.settings);
      }
    } catch (e) {
      // Non-fatal if office settings couldn't be loaded immediately
      console.warn('Office settings load notice:', e.message);
    }
  };

  // Initial authentication flow
  const initAuth = useCallback(async () => {
    try {
      const token = getAuthToken();
      const stored = getStoredUser();

      // Rule: Do NOT call protected APIs if user is not authenticated.
      // Immediately render the public login page.
      if (!token || !stored) {
        setUser(null);
        setOfficeSettings(null);
        setInitializing(false);
        return;
      }

      // If token exists, verify active session with /api/auth/me
      try {
        const res = await apiGetCurrentUser();
        if (res && res.success && res.user) {
          const verifiedUser = {
            ...stored,
            ...res.user
          };
          setUser(verifiedUser);
          setStoredUser(verifiedUser);

          // Once verified, fetch protected office settings
          await loadOfficeSettings();
        } else {
          handleLogout();
        }
      } catch (authErr) {
        // Handle 401 Unauthorized or 403 Forbidden gracefully
        if (authErr.status === 401 || authErr.status === 403) {
          handleLogout();
        } else {
          // If offline or intermittent network error, use cached profile
          setUser(stored);
        }
      }
    } finally {
      setInitializing(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    initAuth();

    // Listen for automatic logout events triggered by expired tokens (401)
    const onAuthLogout = () => {
      setUser(null);
      setOfficeSettings(null);
    };

    window.addEventListener('shewings-auth-logout', onAuthLogout);
    return () => {
      window.removeEventListener('shewings-auth-logout', onAuthLogout);
    };
  }, [initAuth]);

  // Handle successful login
  const handleLoginSuccess = async (loggedInUser) => {
    setUser(loggedInUser);
    // Fetch office settings now that the user is authenticated
    await loadOfficeSettings();
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1120]">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/25 ring-1 ring-white/10 animate-pulse">
            <span className="text-white font-extrabold text-2xl tracking-wider">SW</span>
          </div>
          <div className="text-sm font-semibold text-slate-300">
            Initializing SheWings Attendance OS...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0b1120] text-slate-100 transition-colors duration-200">
      <Navbar
        user={user}
        onLogout={handleLogout}
        officeSettings={officeSettings}
      />

      <main className={`flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 lg:px-8 py-3 sm:py-8 flex flex-col ${!user ? 'justify-center' : 'justify-start'}`}>
        {!user ? (
          <LoginModal onLoginSuccess={handleLoginSuccess} />
        ) : user.role === 'admin' ? (
          <AdminDashboard
            user={user}
            officeSettings={officeSettings}
            onOfficeSettingsUpdated={(newSettings) => setOfficeSettings(newSettings)}
          />
        ) : user.role === 'employee' ? (
          <EmployeeDashboard
            user={user}
            officeSettings={officeSettings}
          />
        ) : (
          <div className="p-6 sm:p-8 text-center text-rose-400 max-w-md mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <p className="font-semibold mb-2">Unauthorized Role</p>
            <p className="text-xs text-slate-300 mb-4">
              Your account does not have an authorized role. Please sign out and contact support.
            </p>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold min-h-[40px]"
            >
              Sign Out
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-4 sm:py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
            <span className="font-bold text-slate-300">SheWings Foundation</span>
            <span className="text-slate-600 hidden xs:inline">•</span>
            <span className="text-slate-400">Office Attendance OS</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Enterprise GPS Geofence & Facial Verification • Secure MySQL Audit Logging
          </div>
        </div>
      </footer>
    </div>
  );
}
