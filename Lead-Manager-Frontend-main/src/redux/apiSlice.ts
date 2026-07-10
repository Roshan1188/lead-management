// src/redux/services/apiSlice.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/** Parse token from a given localStorage key.
 *  Supports string or JSON: { token } | { accessToken } | { value }
 */
function parseStoredToken(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj === 'object') {
      return obj.token || obj.accessToken || obj.value || null;
    }
    return null;
  } catch {
    return raw; // not JSON — treat as plain string
  }
}

/** Role-aware token reader:
 *  - Checks both adminToken and teleCallerToken
 *  - Chooses by current URL path: /admin → adminToken, /telecaller → teleCallerToken
 *  - Fallback order when path is ambiguous: teleCallerToken then adminToken
 */
function getToken() {
  const pathname =
    typeof window !== 'undefined' ? (window.location.pathname || '').toLowerCase() : '';

  const admin = parseStoredToken('adminToken');
  const tele  = parseStoredToken('teleCallerToken');

  if (pathname.includes('/admin')) return admin || tele || null;
  if (pathname.includes('/tele') || pathname.includes('/telecaller')) return tele || admin || null;

  // Ambiguous path: prefer telecaller, then admin
  return tele || admin || null;
}

/** Backend base URL resolution:
 *  - Vercel/Prod: set VITE_BACKEND_HOST_URL (e.g. https://your-domain.com)
 *  - Local dev: falls back to http://localhost:5000
 *  - Otherwise: Railway prod
 *
 *  NOTE: We append /api/v1 below to match your Express:
 *    app.use("/api/v1/auth", authRoutes)
 *    app.use("/api/v1/admin", adminRoutes)
 *    app.use("/api/v1/telecaller", telecallerRoutes)
 *    app.use("/api/v1/leads", leadRoutes)
 */
const BASE_HOST = (() => {
  const env = import.meta.env?.VITE_BACKEND_HOST_URL?.trim();
  if (env) return env;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:4000';
  }
  return 'https://lead-manger-backend.vercel.app';
})().replace(/\/+$/, ''); // strip trailing slash

// Final base for RTKQ calls → e.g. https://host.xyz/api/v1
const BASE_URL = `${BASE_HOST}/api/v1`;

// Wrap baseQuery to auto-handle 401/403 (optional)
const rawBaseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  // credentials: 'include', // not needed with Bearer tokens
  prepareHeaders: (headers) => {
    const token = getToken();
    if (token) {
      headers.set('authorization', `Bearer ${token}`); // standard Bearer header
    }
    headers.set('accept', 'application/json');
    return headers;
  },
});

const baseQueryWithReauth = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result?.error && (result.error.status === 401 || result.error.status === 403)) {
    try {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('teleCallerToken');
    } catch { /* noop */ }
    // Optionally: api.dispatch(authLoggedOut()) or redirect to /login
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // Tag types aligned with your Lead Management domain
  tagTypes: ['User', 'Lead', 'Leads', 'Telecaller', 'Report', 'AdminDashboard', 'TelecallerReport', 'AdminUser', 'LeadsSummary',
    'LeadList',
    'TelecallerReminders',
    'TelecallerDashboard',
    'MetaConfig',
    'MetaForms',
    'MetaSync'

  ],
  endpoints: () => ({}), // feature slices should inject their own endpoints
});

export default apiSlice;
