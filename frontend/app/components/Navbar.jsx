'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, LogOut, Clock, Building2, MapPin, Sun, Moon } from 'lucide-react';
import { apiLogout } from '../lib/api';
import { useTheme } from '../lib/ThemeContext';

export default function Navbar({ user, onLogout, officeSettings }) {
  const { theme, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b1120]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/10 flex-shrink-0">
            <span className="text-white font-extrabold text-sm sm:text-lg tracking-wider">SW</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-white text-sm sm:text-lg tracking-tight truncate">
                SheWings<span className="hidden xs:inline"> Foundation</span>
              </span>
              <span className="hidden sm:inline-flex text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20 flex-shrink-0">
                Attendance OS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden md:block truncate">
              {officeSettings?.office_name || 'National Headquarters'} • Geofence & Facial Verification
            </p>
          </div>
        </div>

        {/* Live Clock, Theme Toggle & User Controls */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
          {/* Live digital clock */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 text-xs">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-mono font-medium text-slate-200">{currentTime}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{currentDate}</span>
          </div>

          {/* Theme Toggle Button (Sun & Moon) */}
          <button
            type="button"
            id="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-1.5 sm:p-2 rounded-xl border border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white transition-all duration-200 flex items-center justify-center cursor-pointer shadow-sm active:scale-95 group focus:outline-none focus:ring-2 focus:ring-blue-500/40 flex-shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
            ) : (
              <Moon className="w-4 h-4 text-blue-600 group-hover:-rotate-12 transition-transform duration-300" />
            )}
          </button>

          {/* User profile pill */}
          {user && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  user.role === 'admin'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {user.role === 'admin' ? (
                    <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  ) : (
                    <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                  )}
                </div>
                <div className="text-left hidden sm:block max-w-[130px] md:max-w-[200px]">
                  <div className="text-xs font-semibold text-white leading-tight truncate">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight uppercase font-medium tracking-wide truncate">
                    {user.role === 'admin' ? 'Administrator' : (user.designation || 'Staff')}
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={() => {
                  apiLogout();
                  if (onLogout) onLogout();
                }}
                title="Sign Out"
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 sm:border-transparent hover:border-rose-500/20 transition-colors flex-shrink-0"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
