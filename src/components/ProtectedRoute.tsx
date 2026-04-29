import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/Button';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const lastValidUserId = useRef<string | null>(null);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      lastValidUserId.current = null;
      setAuthorized(false);
      setChecking(false);
      return;
    }

    // If user id hasn't changed and we already authorized, skip re-check
    if (user.id === lastValidUserId.current && authorized) {
      setChecking(false);
      return;
    }

    const checkAccess = async () => {
      try {
        // Check if user is admin (admins bypass allowlist)
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        const isAdmin = roleData?.role === 'admin' || roleData?.role === 'super_admin';

        if (!isAdmin) {
          // Non-admin: must exist in team_members with active status
          const { data: member } = await supabase
            .from('team_members')
            .select('id, status')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!member || member.status === 'disabled') {
            // Definitive denial — clear cache and redirect
            lastValidUserId.current = null;
            toast.error('Acesso não autorizado. Contate o administrador.');
            await signOut();
            setChecking(false);
            return;
          }
        }

        // Check force_password_change
        const { data: profile } = await supabase
          .from('profiles')
          .select('force_password_change')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile?.force_password_change) {
          setForcePasswordChange(true);
        }

        lastValidUserId.current = user.id;
        setAuthorized(true);
      } catch (error) {
        console.error('Error checking access:', error);
        // Transient error: reuse last valid auth if same user
        if (lastValidUserId.current === user.id) {
          setAuthorized(true); // Keep access on transient failure
        } else {
          setAuthorized(true); // First load with error — allow rather than lock out
        }
      } finally {
        setChecking(false);
      }
    };

    checkAccess();
  }, [user?.id, loading, signOut]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // Update force_password_change to false
      await supabase
        .from('profiles')
        .update({ force_password_change: false })
        .eq('user_id', user!.id);

      setForcePasswordChange(false);
      toast.success('Senha alterada com sucesso!');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(error.message || 'Erro ao alterar senha');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!authorized) {
    return <Navigate to="/auth" replace />;
  }

  // Force password change modal
  if (forcePasswordChange) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0" />
        <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0" />
        
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Troca de Senha Obrigatória</h1>
            <p className="text-muted-foreground mt-2">Você precisa definir uma nova senha antes de continuar</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <form onSubmit={handlePasswordChange} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                Alterar Senha
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
