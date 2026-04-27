import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, Users, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../Button';

type Period = 7 | 30;

interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  weight: number | null;
  rr_counter: number;
  team_id: string | null;
  user_id: string | null;
  team_name?: string | null;
  team_active?: boolean | null;
}

interface AuditRow extends TeamMemberRow {
  eligible: boolean;
  ineligibleReason?: string;
  leadsInPeriod: number;
  pctOfPeriod: number;
  lastAssignedAt: string | null;
}

const SALES_TEAM_NAME = 'vendas';

const LeadDistributionAudit: React.FC = () => {
  const [period, setPeriod] = useState<Period>(7);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [conversationsAgg, setConversationsAgg] = useState<
    Record<string, { count: number; lastAt: string | null }>
  >({});
  const [totalConversations, setTotalConversations] = useState(0);
  const [unassignedConversations, setUnassignedConversations] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const sinceIso = new Date(
        Date.now() - period * 24 * 60 * 60 * 1000
      ).toISOString();

      const [{ data: tm }, { data: teams }, { data: convs, count }] =
        await Promise.all([
          supabase
            .from('team_members')
            .select('id, name, email, role, status, weight, rr_counter, team_id, user_id')
            .order('name', { ascending: true }),
          supabase.from('teams').select('id, name, is_active'),
          supabase
            .from('conversations')
            .select('id, assigned_user_id, created_at', { count: 'exact' })
            .gte('created_at', sinceIso),
        ]);

      const teamMap = new Map(
        (teams || []).map((t: any) => [t.id, { name: t.name, is_active: t.is_active }])
      );

      const enriched: TeamMemberRow[] = (tm || []).map((m: any) => {
        const team = m.team_id ? teamMap.get(m.team_id) : null;
        return {
          ...m,
          team_name: team?.name || null,
          team_active: team?.is_active ?? null,
        };
      });

      const agg: Record<string, { count: number; lastAt: string | null }> = {};
      let unassigned = 0;
      (convs || []).forEach((c: any) => {
        if (!c.assigned_user_id) {
          unassigned += 1;
          return;
        }
        const cur = agg[c.assigned_user_id] || { count: 0, lastAt: null };
        cur.count += 1;
        if (!cur.lastAt || c.created_at > cur.lastAt) cur.lastAt = c.created_at;
        agg[c.assigned_user_id] = cur;
      });

      setMembers(enriched);
      setConversationsAgg(agg);
      setTotalConversations(count || convs?.length || 0);
      setUnassignedConversations(unassigned);
    } catch (e) {
      console.error('[LeadDistributionAudit] load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const rows = useMemo<AuditRow[]>(() => {
    const periodAssigned = Object.values(conversationsAgg).reduce(
      (a, b) => a + b.count,
      0
    );

    return members.map((m) => {
      const stats = m.user_id ? conversationsAgg[m.user_id] : undefined;
      const leadsInPeriod = stats?.count || 0;
      const pct = periodAssigned > 0 ? (leadsInPeriod / periodAssigned) * 100 : 0;

      let eligible = true;
      let reason: string | undefined;

      if (m.status !== 'active') {
        eligible = false;
        reason = `Status "${m.status}" (precisa ser active)`;
      } else if (!m.user_id) {
        eligible = false;
        reason = 'Sem usuário vinculado (user_id ausente)';
      } else if (!m.team_id || !m.team_name) {
        eligible = false;
        reason = 'Sem time atribuído';
      } else if (m.team_name.toLowerCase() !== SALES_TEAM_NAME) {
        eligible = false;
        reason = `Time "${m.team_name}" (precisa ser Vendas)`;
      } else if (!m.team_active) {
        eligible = false;
        reason = 'Time inativo';
      } else if (!m.weight || m.weight <= 0) {
        eligible = false;
        reason = `Peso ${m.weight ?? 0} (precisa ser > 0)`;
      }

      return {
        ...m,
        eligible,
        ineligibleReason: reason,
        leadsInPeriod,
        pctOfPeriod: pct,
        lastAssignedAt: stats?.lastAt || null,
      };
    });
  }, [members, conversationsAgg]);

  const eligibleCount = rows.filter((r) => r.eligible).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Auditoria de distribuição de leads
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Critério oficial: <span className="text-slate-200">status=ativo</span>,{' '}
            <span className="text-slate-200">time=Vendas (ativo)</span>,{' '}
            <span className="text-slate-200">peso &gt; 0</span> e{' '}
            <span className="text-slate-200">user_id vinculado</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex bg-slate-900 border border-slate-800 rounded-md overflow-hidden">
            {[7, 30].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as Period)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  period === p
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={load} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard
          label={`Conversas (${period}d)`}
          value={totalConversations.toString()}
        />
        <SummaryCard
          label="Atribuídas"
          value={(totalConversations - unassignedConversations).toString()}
          tone="ok"
        />
        <SummaryCard
          label="Sem vendedor"
          value={unassignedConversations.toString()}
          tone={unassignedConversations > 0 ? 'warn' : 'neutral'}
        />
        <SummaryCard
          label="Vendedores elegíveis"
          value={`${eligibleCount} / ${members.length}`}
          tone={eligibleCount === 0 ? 'error' : 'ok'}
        />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Vendedor</th>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Peso</th>
                <th className="text-right px-4 py-3">RR contador</th>
                <th className="text-right px-4 py-3">Leads ({period}d)</th>
                <th className="text-right px-4 py-3">%</th>
                <th className="text-left px-4 py-3">Última atribuição</th>
                <th className="text-left px-4 py-3">Elegibilidade</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-500">
                    Nenhum membro encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{r.name}</div>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {r.team_name || <span className="text-slate-500">—</span>}
                      {r.team_name && !r.team_active && (
                        <span className="ml-1 text-xs text-amber-400">(inativo)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-slate-700/40 text-slate-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {r.weight ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {r.rr_counter}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-100 font-medium">
                      {r.leadsInPeriod}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {r.pctOfPeriod.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {r.lastAssignedAt
                        ? new Date(r.lastAssignedAt).toLocaleString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.eligible ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Elegível
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-rose-300"
                          title={r.ineligibleReason}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Fora da fila
                          <span className="text-slate-500 ml-1">
                            · {r.ineligibleReason}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unassignedConversations > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>{unassignedConversations}</strong> conversas no período não foram
            atribuídas a nenhum vendedor. Verifique se há vendedores elegíveis listados acima.
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'error' | 'neutral';
}> = ({ label, value, tone = 'neutral' }) => {
  const toneClass = {
    ok: 'text-emerald-300',
    warn: 'text-amber-300',
    error: 'text-rose-300',
    neutral: 'text-slate-100',
  }[tone];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
};

export default LeadDistributionAudit;
