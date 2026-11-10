'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (angle) => (angle * Math.PI) / 180;
  const φ1 = toRad(Number(lat1));
  const φ2 = toRad(Number(lat2));
  const Δφ = toRad(Number(lat2) - Number(lat1));
  const Δλ = toRad(Number(lon2) - Number(lon1));
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export default function GeoLocationStatus({ officeSettings, onLocationUpdate, attendanceMode = 'OFFICE' }) {
  const [coords, setCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const mode = String(attendanceMode || 'OFFICE').toUpperCase();
  const officeLat = Number(officeSettings?.latitude || 28.53530548);
  const officeLng = Number(officeSettings?.longitude || 77.34580053);
  const allowedRadius = Number(officeSettings?.allowed_radius_meters || 100);

  const fetchLocation = () => {
    setLoading(true);
    setErrorMsg('');

    if (!navigator.geolocation) {
      const msg = 'Geolocation hardware or API is not supported by your browser.';
      setErrorMsg(msg);
      setLoading(false);
      if (onLocationUpdate) {
        onLocationUpdate({
          latitude: null,
          longitude: null,
          distance: null,
          isWithinGeofence: mode !== 'OFFICE',
          permissionDenied: true
        });
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const loc = { latitude, longitude, accuracy };
        setCoords(loc);

        const d = calculateDistanceMeters(latitude, longitude, officeLat, officeLng);
        setDistance(d);
        setLoading(false);

        if (onLocationUpdate) {
          onLocationUpdate({
            latitude,
            longitude,
            distance: d,
            isWithinGeofence: mode === 'OFFICE' ? d <= allowedRadius : true,
            permissionDenied: false,
            accuracy
          });
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        const denied = err.code === 1;
        const errorText = denied
          ? 'Location permission was denied. Please allow device GPS permissions in your browser.'
          : 'Unable to retrieve physical GPS coordinates. Please check your network or device location service.';
        setErrorMsg(errorText);
        setLoading(false);

        if (onLocationUpdate) {
          onLocationUpdate({
            latitude: null,
            longitude: null,
            distance: null,
            // For CAMP and WFH, permission error does not block attendance, but coordinates are null and NOT verified
            isWithinGeofence: mode !== 'OFFICE',
            permissionDenied: true
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      }
    );
  };

  useEffect(() => {
    fetchLocation();
  }, [officeSettings, mode]);

  const isWithinGeofence = distance !== null && distance <= allowedRadius;

  return (
    <div className="w-full rounded-xl sm:rounded-2xl p-2.5 sm:p-3 bg-slate-900/90 border border-slate-800 shadow-md">
      <div className="flex items-start sm:items-center justify-between gap-2 mb-2 sm:mb-2.5">
        <div className="flex items-start sm:items-center gap-2 sm:gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded-lg sm:rounded-xl border flex-shrink-0 ${
              mode === 'CAMP'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : mode === 'WFH'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold text-white leading-tight">
              {mode === 'CAMP'
                ? 'Camp Location GPS Coordinates'
                : mode === 'WFH'
                ? 'Work From Home GPS Coordinates'
                : 'Physical GPS Geofence Verification'}
            </h4>
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 leading-snug">
              {mode === 'CAMP'
                ? 'Field Camp Duty (No office geofence required)'
                : mode === 'WFH'
                ? 'Remote Attendance (Approved WFH Schedule)'
                : `Office Perimeter: ${officeSettings?.office_name || 'SheWings Foundation'} (${allowedRadius}m radius)`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchLocation}
          disabled={loading}
          title="Refresh GPS Coordinates"
          className="p-1 sm:p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition flex-shrink-0 cursor-pointer"
          aria-label="Refresh GPS Location"
        >
          <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1.5 text-xs text-slate-400">
          <Navigation className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          <span className="text-[11px]">
            {mode === 'CAMP'
              ? 'Acquiring satellite GPS coordinates for camp location...'
              : 'Acquiring high-accuracy satellite GPS coordinates...'}
          </span>
        </div>
      ) : errorMsg ? (
        <div className="space-y-1.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <div className="flex-1">
              <span className="font-medium text-[11px] leading-tight block">{errorMsg}</span>
              {mode === 'CAMP' && (
                <p className="mt-1 text-[10px] text-amber-300/80">
                  Note: GPS is not mandatory for Camp attendance. Your check-in will be saved with server timestamp and live selfie, with GPS marked as unrecorded.
                </p>
              )}
            </div>
          </div>
          {mode !== 'OFFICE' && (
            <div className="text-[10px] sm:text-[11px] text-slate-400 px-1 font-mono">
              GPS Status: <span className="text-amber-400">Unrecorded (Permission Denied / Unavailable)</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Mode-specific status badge */}
          {mode === 'CAMP' ? (
            <div className="p-2 sm:p-2.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    Camp GPS Location Captured
                  </div>
                  <div className="text-[10px] sm:text-[11px] opacity-80">
                    Field location coordinates recorded (Accuracy: ±{Math.round(coords?.accuracy || 0)}m)
                  </div>
                </div>
              </div>
            </div>
          ) : mode === 'WFH' ? (
            <div className="p-2 sm:p-2.5 rounded-xl border bg-purple-500/10 border-purple-500/30 text-purple-300 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    Remote Location Captured
                  </div>
                  <div className="text-[10px] sm:text-[11px] opacity-80">
                    Work From Home location recorded
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* OFFICE mode geofence indicator */
            <div
              className={`p-2 sm:p-2.5 rounded-xl border flex items-center justify-between ${
                isWithinGeofence
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-2.5">
                {isWithinGeofence ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 flex-shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    {isWithinGeofence ? 'Inside Office Geofence' : 'Outside Office Geofence'}
                  </div>
                  <div className="text-[10px] sm:text-[11px] opacity-80">
                    {distance !== null ? `${Math.round(distance)} meters away from office` : 'Distance unknown'}
                    {' '}(Authorized Boundary: ≤ {allowedRadius}m)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Coordinates readout */}
          {coords && (
            <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-[11px] text-slate-400 bg-slate-950/60 py-1.5 px-2.5 rounded-lg sm:rounded-xl border border-slate-800 font-mono">
              <div className="truncate">
                <span className="text-slate-500">Lat: </span>
                {Number(coords.latitude).toFixed(6)}
              </div>
              <div className="truncate">
                <span className="text-slate-500">Lng: </span>
                {Number(coords.longitude).toFixed(6)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
