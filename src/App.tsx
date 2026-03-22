import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';
import Contacts from './components/Contacts';
import Settings from './components/Settings';
import Team from './components/Team';
import Scheduling from './components/Scheduling';
import Kanban from './components/Kanban';
import AlertsPanel from './components/AlertsPanel';
import Auth from './pages/Auth';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

import { CompanySettingsProvider } from './hooks/useCompanySettings';
import { AuthProvider } from './hooks/useAuth';
import { Toaster } from 'sonner';

const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0"></div>
      
      <Sidebar />
      
      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50 z-20"></div>
        
        <div className="flex-1 w-full h-full relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <CompanySettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pipeline" element={<Kanban />} />
              <Route path="/chat" element={<ChatInterface />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/scheduling" element={<Scheduling />} />
              <Route path="/team" element={<Team />} />
              <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
            </Route>
            
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster 
          position="top-right"
          richColors
          theme="dark"
        />
      </CompanySettingsProvider>
    </AuthProvider>
  );
};

export default App;
