import React from 'react';
import { Navigate } from 'react-router-dom';
import { useCompanyContext } from '@/hooks/useCompanyContext';

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSuperAdmin, loading } = useCompanyContext();
  if (loading) return null;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export default SuperAdminRoute;
