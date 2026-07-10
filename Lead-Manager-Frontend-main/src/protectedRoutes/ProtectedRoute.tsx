// src/protectedRoutes/ProtectedRoute.tsx
import React, { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasAdminToken, hasTeleToken } from '@/lib/auth';

/** 1 = Telecaller, 2 = Admin */
type RoleAtom = 1 | 2 | 'admin' | 'telecaller' | 'tele';
type RoleInput = RoleAtom | RoleAtom[];

const toCode = (r: RoleAtom): 1 | 2 => (r === 2 || r === 'admin' ? 2 : 1);

export const ProtectedRoute = ({
  children,
  requiredRole,
}: PropsWithChildren<{ requiredRole: RoleInput }>) => {
  const location = useLocation();
  const allowed: (1 | 2)[] = (Array.isArray(requiredRole) ? requiredRole : [requiredRole]).map(toCode);

  const ok =
    (allowed.includes(2) && hasAdminToken()) ||
    (allowed.includes(1) && hasTeleToken());

  if (ok) return <>{children}</>;

  // already on /login? stay here (no bounce)
  if (location.pathname.startsWith('/login')) return null;

  return <Navigate to="/login" replace />;
};
