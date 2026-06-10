import React, { useState } from 'react';
import { KeyRound, Loader2, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/Button';

const ResetUserPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ email: string; password?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Informe o email');
      return;
    }
    if (newPassword && newPassword.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { email: email.trim(), new_password: newPassword || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const payload = data as { email: string; temporary_password?: string };
      setResult({ email: payload.email, password: payload.temporary_password || newPassword });
      toast.success('Senha redefinida com sucesso');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = async () => {
    if (!result?.password) return;
    await navigator.clipboard.writeText(result.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="max-w-2xl">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <KeyRound className="w-8 h-8 text-primary" /> Redefinir Senha
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Redefina a senha de qualquer usuário (super admin ou comum). O usuário será forçado a
            trocar a senha no próximo login.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="text-xs text-slate-400">Email do usuário *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">
              Nova senha <span className="text-slate-600">(opcional — em branco gera uma)</span>
            </label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono"
            />
          </div>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Redefinir senha
          </Button>
        </form>

        {result && (
          <div className="mt-6 bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-5">
            <div className="text-sm text-emerald-300 font-semibold mb-2">
              Senha atualizada para {result.email}
            </div>
            {result.password && (
              <>
                <div className="text-xs text-slate-400 mb-1">Senha temporária:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-emerald-300">
                    {result.password}
                  </code>
                  <Button variant="outline" onClick={copyPassword} className="gap-1">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
                <div className="text-xs text-amber-400 mt-3">
                  Compartilhe com segurança. O usuário deverá trocar a senha no primeiro login.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetUserPassword;