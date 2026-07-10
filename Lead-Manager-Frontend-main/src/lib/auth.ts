// src/lib/auth.ts
export const ADMIN_TOKEN_KEY = 'adminToken';
export const TELE_TOKEN_KEY  = 'teleCallerToken';

export const getAdminToken   = () => localStorage.getItem(ADMIN_TOKEN_KEY) || null;
export const getTeleToken    = () => localStorage.getItem(TELE_TOKEN_KEY)  || null;

export const hasAdminToken   = () => !!getAdminToken();
export const hasTeleToken    = () => !!getTeleToken();

/** 1 = telecaller, 2 = admin, null = not logged in */
export const getRoleFromStorage = (): 1 | 2 | null => {
  if (hasAdminToken()) return 2;
  if (hasTeleToken())  return 1;
  return null;
};

export const setAuthTokenByRole = (role: 1 | 2, token: string) => {
  if (role === 2) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.removeItem(TELE_TOKEN_KEY);
  } else {
    localStorage.setItem(TELE_TOKEN_KEY, token);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
};

export const clearAllAuth = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(TELE_TOKEN_KEY);
};
