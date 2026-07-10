// src/services/authService.ts (or src/lib/auth.ts)
export const ADMIN_TOKEN_KEY = 'adminToken';
export const TELE_TOKEN_KEY  = 'teleCallerToken';

type JwtPayload = {
  id?: string;
  role?: 1 | 2 | 'admin' | 'telecaller' | number | string;
  mobile?: string;
  iat?: number;
  exp?: number;
  [k: string]: unknown;
};

/** ---- Robust token readers ---- */
function normalizeRawToken(raw: string | null): string | null {
  if (!raw) return null;
  let val: unknown = raw;

  try {
    // If JSON-stringified primitive: `"token"`
    if (raw.startsWith('"') && raw.endsWith('"')) {
      val = JSON.parse(raw);
    }
    // If stored as object: `{"token":"..."}`
    else if (raw.startsWith('{')) {
      const obj = JSON.parse(raw);
      if (typeof obj === 'string') val = obj;
      else if (obj && typeof obj === 'object' && 'token' in obj) {
        // @ts-expect-error narrow runtime
        val = obj.token;
      }
    }
  } catch {
    // ignore parse errors; keep as is
  }

  if (typeof val !== 'string') return null;

  // Strip Bearer prefix if present
  if (val.startsWith('Bearer ')) val = val.slice(7);

  return val || null;
}

function readTokenByKey(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    return normalizeRawToken(raw);
  } catch {
    return null;
  }
}

/** Prefer admin if both (shouldn't happen because we clear the other on login) */
function readAnyToken(): { token: string; key: 'adminToken' | 'teleCallerToken' } | null {
  const admin = readTokenByKey(ADMIN_TOKEN_KEY);
  if (admin) return { token: admin, key: ADMIN_TOKEN_KEY };
  const tele = readTokenByKey(TELE_TOKEN_KEY);
  if (tele) return { token: tele, key: TELE_TOKEN_KEY };
  return null;
}

/** ---- Base64 utils (JWT decoding) ---- */
function toBase64(p: string) {
  const s = p.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  return pad ? s + '='.repeat(4 - pad) : s;
}

function b64decode(str: string) {
  try {
    // Browser
    // @ts-ignore
    if (typeof atob === 'function') return atob(str);
  } catch {}
  try {
    // Node/SSR fallback
    // @ts-ignore
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('binary');
  } catch {}
  return '';
}

/** ---- JWT decode (safe) ---- */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;

    const payloadB64 = toBase64(parts[1]);
    const binary = b64decode(payloadB64);

    // Try unicode-safe decode first
    try {
      const json = decodeURIComponent(
        binary
          .split('')
          .map((c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch {
      return JSON.parse(binary);
    }
  } catch {
    return null;
  }
}

/** Normalize role to 1|2 */
function toRoleCode(role: JwtPayload['role']): 1 | 2 | null {
  if (role === 1 || String(role).toLowerCase() === 'telecaller') return 1;
  if (role === 2 || String(role).toLowerCase() === 'admin') return 2;
  return null;
}

/** Public API */

/** 1 = telecaller, 2 = admin, null = not logged in */
export function getRoleFromStorage(): 1 | 2 | null {
  const any = readAnyToken();
  if (!any) return null;
  // If both exist (edge), we prefer admin above already.
  return any.key === ADMIN_TOKEN_KEY ? 2 : 1;
}

/** Decoded JWT payload (if available). Also inject role from storage key when missing. */
export function getCurrentUser(): (JwtPayload & { role?: 1 | 2 }) | null {
  const any = readAnyToken();
  if (!any) return null;

  const payload = decodeJwt(any.token) || {};
  const decodedRole = toRoleCode(payload.role);
  const storageRole: 1 | 2 = any.key === ADMIN_TOKEN_KEY ? 2 : 1;

  return {
    ...payload,
    role: decodedRole ?? storageRole,
  };
}

export function isTokenExpired(): boolean {
  const payload = getCurrentUser();
  if (!payload || !payload.exp) return true;
  return payload.exp * 1000 <= Date.now();
}

export function getAuthHeader(): Record<string, string> {
  const any = readAnyToken();
  return any?.token ? { Authorization: `Bearer ${any.token}` } : {};
}

export function setAuthTokenByRole(role: 1 | 2, token: string) {
  try {
    if (role === 2) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.removeItem(TELE_TOKEN_KEY);
    } else {
      localStorage.setItem(TELE_TOKEN_KEY, token);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {}
}

export function clearAllAuth() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(TELE_TOKEN_KEY);
  } catch {}
}

const authService = {
  getCurrentUser,
  getRoleFromStorage,
  isTokenExpired,
  getAuthHeader,
  setAuthTokenByRole,
  clearAllAuth,
  ADMIN_TOKEN_KEY,
  TELE_TOKEN_KEY,
};

export default authService;
