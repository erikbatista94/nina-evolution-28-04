import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, Loader2, KeyRound } from 'lucide-react';
import logoGG from '@/assets/logo-gg.png';

const UpdatePassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [validRecovery, setValidRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleRecovery = async () => {
      // Supabase processes the recovery token from the URL hash automatically
      // We just need to check if there's an active session after processing
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setValidRecovery(true);
      } else {
        // No session means invalid or expired recovery link
        toast.error('Link de recuperação inválido ou expirado.');
      }
      setLoading(false);
    };

    handleRecovery();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success('Senha atualizada com sucesso!');
      navigate('/auth');
    } catch (err: any) {
      console.error('Error updating password:', err);
      toast.error(err.message || 'Erro ao atualizar senha');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!validRecovery) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0" />
        <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0" />

        <div className="w-full max-w-md relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4">
            <img
              src={logoGG}
              alt="GG Logo"
              className="w-10 h-10 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Link inválido</h1>
          <p className="text-muted-foreground mt-2 mb-6">
            O link de recuperação é inválido ou expirou. Solicite um novo.
          </p>
          <Button variant="primary" onClick={() => navigate('/forgot-password')}>
            Solicitar novo link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4">
            <img
              src={logoGG}
              alt="GG Logo"
              className="w-10 h-10 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Nova senha</h1>
          <p className="text-muted-foreground mt-2">Defina sua nova senha de acesso</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground">Confirmar senha</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" />
              )}
              Salvar nova senha
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdatePassword;
