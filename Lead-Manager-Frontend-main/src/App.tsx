import React from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from './redux/store';

/* PAGES */
import Login from './pages/Login';

/* Admin */
import AdminDashboard from './pages/admin/AdminDashboard';
import Telecallers from './pages/admin/Telecallers';
import Admins from './pages/admin/Admins';
import Leads from './pages/admin/Leads';
import Distribution from './pages/admin/Distribution';
import AdminReports from './pages/admin/AdminReports';
import AdminProfile from './pages/admin/AdminProfile';
import StatusOptions from './pages/admin/StatusOptions';

/* Telecaller */
import TelecallerDashboard from './pages/telecaller/TelecallerDashboard';
import Clients from './pages/telecaller/Clients';
import TelecallerReports from './pages/telecaller/TelecallerReports';
import TelecallerProfile from './pages/telecaller/TelecallerProfile';


/* Other */
import NotFound from './pages/NotFound';
import { ProtectedRoute } from './protectedRoutes/ProtectedRoute';
import TelecallerLeads from './pages/telecaller/TelecallerLeads';

const queryClient = new QueryClient();

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter>
          <Routes>

            {/* ---------- PUBLIC ---------- */}
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />

            {/* ---------- ADMIN ---------- */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole={2}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/telecallers"
              element={
                <ProtectedRoute requiredRole={2}>
                  <Telecallers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/admins"
              element={
                <ProtectedRoute requiredRole={2}>
                  <Admins />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/leads"
              element={
                <ProtectedRoute requiredRole={2}>
                  <Leads />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/distribution"
              element={
                <ProtectedRoute requiredRole={2}>
                  <Distribution />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute requiredRole={2}>
                  <AdminReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <ProtectedRoute requiredRole={2}>
                  <AdminProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/status-options"
              element={
                <ProtectedRoute requiredRole={2}>
                  <StatusOptions />
                </ProtectedRoute>
              }
            />

            {/* ---------- TELECALLER ---------- */}
            <Route
              path="/telecaller"
              element={
                <ProtectedRoute requiredRole={1}>
                  <TelecallerDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/telecaller/clients"
              element={
                <ProtectedRoute requiredRole={1}>
                  <Clients />
                </ProtectedRoute>
              }
            />

            {/* ✅ NEW TELECALLER LEADS ROUTE */}
            <Route
              path="/telecaller/leads"
              element={
                <ProtectedRoute requiredRole={1}>
                  <TelecallerLeads />
                </ProtectedRoute>
              }
            />

            <Route
              path="/telecaller/reports"
              element={
                <ProtectedRoute requiredRole={1}>
                  <TelecallerReports />
                </ProtectedRoute>
              }
            />

            <Route
              path="/telecaller/profile"
              element={
                <ProtectedRoute requiredRole={1}>
                  <TelecallerProfile />
                </ProtectedRoute>
              }
            />

            {/* ---------- 404 ---------- */}
            <Route path="*" element={<NotFound />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </Provider>
  </QueryClientProvider>
);

export default App;
