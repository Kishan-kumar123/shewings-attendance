export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '')
    : 'http://localhost:5000');

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  `${BACKEND_URL}/api`;

export function getAuthToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('shewings_token');
  }
  return null;
}

export function setAuthToken(token) {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('shewings_token', token);
    } else {
      localStorage.removeItem('shewings_token');
    }
  }
}

export function getStoredUser() {
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem('shewings_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredUser(user) {
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem('shewings_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('shewings_user');
    }
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, config);
    } catch (fetchErr) {
      // If direct backend URL fetch failed in browser (e.g. localhost vs 127.0.0.1 mismatch), try fallback
      if (typeof window !== 'undefined' && (API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1'))) {
        const altHost = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
        try {
          response = await fetch(`http://${altHost}:5000/api${endpoint}`, config);
        } catch {
          try {
            // Relative path proxy fallback via Next.js rewrite
            response = await fetch(`/api${endpoint}`, config);
          } catch {
            throw fetchErr;
          }
        }
      } else {
        throw fetchErr;
      }
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      // If 401 Unauthorized or 403 Forbidden for a protected resource, clear expired credentials
      if (response.status === 401 && endpoint !== '/auth/login') {
        setAuthToken(null);
        setStoredUser(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('shewings-auth-logout'));
        }
      }

      let userFriendlyMessage = data.message;
      if (!userFriendlyMessage) {
        if (response.status === 500) {
          userFriendlyMessage = 'Unable to connect to backend server. Please ensure the backend is running on port 5000.';
        } else if (response.status === 502 || response.status === 503 || response.status === 504) {
          userFriendlyMessage = 'Backend service is temporarily unavailable. Please verify your backend server.';
        } else {
          userFriendlyMessage = `Request failed with status ${response.status}`;
        }
      }

      const error = new Error(userFriendlyMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    // Suppress console.error logging for expected 401/403 auth checks
    if (err.status !== 401 && err.status !== 403) {
      console.error(`API Error [${endpoint}]:`, err.message || err);
    }
    throw err;
  }
}

// Authentication
export async function apiLogin(email, password, role = null) {
  const payload = { email, password };
  if (role) payload.role = role;
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (res.token) {
    setAuthToken(res.token);
    setStoredUser(res.user);
  }
  return res;
}

export async function apiRegister(registrationData) {
  const res = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(registrationData)
  });
  if (res.token) {
    setAuthToken(res.token);
    setStoredUser(res.user);
  }
  return res;
}

export async function apiGetCurrentUser() {
  return request('/auth/me');
}

export async function apiChangeAdminPassword(passwordData) {
  return request('/auth/admin/change-password', {
    method: 'PUT',
    body: JSON.stringify(passwordData)
  });
}

export async function apiChangePassword(passwordData) {
  return request('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify(passwordData)
  });
}

export function apiLogout() {
  setAuthToken(null);
  setStoredUser(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('shewings-auth-logout'));
  }
}

// Office Settings (Protected)
export async function apiGetOfficeSettings() {
  return request('/office/settings');
}

export async function apiUpdateOfficeSettings(settings) {
  return request('/office/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
}

// Attendance (Protected)
export async function apiGetTodayAttendance() {
  return request('/attendance/today');
}

export async function apiCheckIn(payload) {
  return request('/attendance/check-in', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function apiCheckOut(payload) {
  return request('/attendance/check-out', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function apiGetAttendanceHistory(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/attendance/history${query ? `?${query}` : ''}`);
}

export async function apiGetAllAttendances(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/attendance/all${query ? `?${query}` : ''}`);
}

export async function apiGetAttendanceStats() {
  return request('/attendance/stats');
}

export async function apiGetMonthlyReport(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  return request(`/attendance/monthly-report${query}`);
}

export async function apiManualAttendanceAdjustment(payload) {
  return request('/attendance/manual-adjustment', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Download Helper for binary files (PDF / Excel)
async function downloadFile(endpoint, defaultFilename = 'download') {
  const token = getAuthToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers
    });
  } catch (fetchErr) {
    if (typeof window !== 'undefined' && (API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1'))) {
      const altHost = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
      response = await fetch(`http://${altHost}:5000/api${endpoint}`, {
        method: 'GET',
        headers
      });
    } else {
      throw fetchErr;
    }
  }

  if (!response.ok) {
    let errorMsg = 'Failed to download file.';
    try {
      const errJson = await response.json();
      if (errJson && errJson.message) errorMsg = errJson.message;
    } catch {
      errorMsg = `Download failed with HTTP ${response.status}`;
    }
    throw new Error(errorMsg);
  }

  let filename = defaultFilename;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blob = await response.blob();
  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 200);
  }
  return true;
}

export async function apiDownloadAdminAttendance(params = {}) {
  const cleanParams = {};
  Object.keys(params).forEach(k => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      cleanParams[k] = params[k];
    }
  });
  const query = new URLSearchParams(cleanParams).toString();
  const ext = (params.format || 'excel') === 'pdf' ? 'pdf' : 'xlsx';
  return downloadFile(`/attendance/export/admin${query ? `?${query}` : ''}`, `SheWings_Attendance_Report.${ext}`);
}

export async function apiDownloadMyAttendance(params = {}) {
  const cleanParams = {};
  Object.keys(params).forEach(k => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      cleanParams[k] = params[k];
    }
  });
  const query = new URLSearchParams(cleanParams).toString();
  const ext = (params.format || 'excel') === 'pdf' ? 'pdf' : 'xlsx';
  return downloadFile(`/attendance/export/my${query ? `?${query}` : ''}`, `SheWings_My_Attendance.${ext}`);
}

export async function apiGetMyAttendanceHistory(params = {}) {
  const cleanParams = {};
  Object.keys(params).forEach(k => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      cleanParams[k] = params[k];
    }
  });
  const query = new URLSearchParams(cleanParams).toString();
  return request(`/attendance/my-history${query ? `?${query}` : ''}`);
}

// Employees (Protected)
export async function apiGetEmployees(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/employees${query ? `?${query}` : ''}`);
}

export async function apiCreateEmployee(employeeData) {
  return request('/employees', {
    method: 'POST',
    body: JSON.stringify(employeeData)
  });
}

export async function apiUpdateEmployee(id, employeeData) {
  return request(`/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(employeeData)
  });
}

export async function apiGetEmployeeDetails(id) {
  return request(`/employees/${id}`);
}

export async function apiToggleEmployeeStatus(id, status) {
  return request(`/employees/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
}

export async function apiResetEmployeePassword(id, newPassword) {
  return request(`/employees/${id}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ newPassword })
  });
}

// Departments (Protected)
export async function apiGetDepartments() {
  return request('/departments');
}

export async function apiCreateDepartment(departmentData) {
  return request('/departments', {
    method: 'POST',
    body: JSON.stringify(departmentData)
  });
}

// Leaves (Protected)
export async function apiApplyLeave(leaveData) {
  return request('/leaves', {
    method: 'POST',
    body: JSON.stringify(leaveData)
  });
}

export async function apiGetMyLeaves() {
  return request('/leaves/my');
}

export async function apiGetAllLeaves(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/leaves/all${query ? `?${query}` : ''}`);
}

export async function apiUpdateLeaveStatus(id, status, reviewNotes) {
  return request(`/leaves/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, reviewNotes })
  });
}

// Work From Home (WFH) (Protected)
export async function apiApplyWFH(wfhData) {
  return request('/wfh', {
    method: 'POST',
    body: JSON.stringify(wfhData)
  });
}

export async function apiGetMyWFH() {
  return request('/wfh/my');
}

export async function apiGetTodayWFHStatus() {
  return request('/wfh/today-status');
}

export async function apiGetAllWFH(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/wfh/all${query ? `?${query}` : ''}`);
}

export async function apiUpdateWFHStatus(id, status, reviewNotes) {
  return request(`/wfh/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, reviewNotes })
  });
}

