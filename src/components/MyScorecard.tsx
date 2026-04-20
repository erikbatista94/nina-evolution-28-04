import React, { useEffect, useState } from 'react';
import { Loader2, Trophy, MessageSquare, Calendar, Target, Zap, Medal, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCompanySettings } from '@/hooks/useCompanySettings';

interface ScorecardData {
  leadsToday: number;
  activeConvs: number;
  appointmentsThisWeek: number;
  dealsWonMonth: number;
  slaResponseRate: number; // 0-100
  ranking?: { position: number; total: number } | null;
}

interface RankingEntry {
  user_id: string;
  name: string;
  deals_won: number;
  is_me: boolean;
}

interface MyScorecardProps {
  /**
   * If provided (admin), shows scorecard for this user. Otherwise uses logged user.
   * If 'all' or undefined for admin, shows team-wide ranking only.
   */
  targetUserId?: string;
  showRanking?: boolean;
}

const MyScorecard: React.FC<MyScorecardProps> = ({ targetUserId, showRanking = true }) => {
  const { user } = useAuth();
  const { isAdmin } = useCompanySettings();
  const [data, setData] = useState<ScorecardData | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = targetUserId || user?.id;

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 7);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayStr = startOfDay.toISOString().split('T')[0];
        const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        const [leadsRes, convsRes, apptsRes, dealsRes, slaRes] = await Promise.all([
          // Leads atribuídos hoje
          supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_user_id', userId)
            .gte('created_at', startOfDay.toISOString()),
          // Conversas ativas
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_user_id', userId)
            .eq('is_active', true),
          // Agendamentos próximos 7 dias
          supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('date', todayStr)
            .lte('date', weekEndStr),
          // Deals ganhos no mês (won_at preenchido)
          supabase
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('won_at', startOfMonth.toISOString()),
          // SLA: proporção de alertas resolvidos vs total nos últimos 7 dias
          supabase
            .from('sla_alerts')
            .select('id, resolved')
            .eq('assigned_user_id', userId)
            .gte('created_at', startOfWeek.toISOString()),
        ]);

        const slaList = (slaRes.data as any[]) || [];
        const slaTotal = slaList.length;
        const slaResolved = slaList.filter(a => a.resolved).length;
        const slaRate = slaTotal === 0 ? 100 : Math.round((slaResolved / slaTotal) * 100);

        setData({
          leadsToday: leadsRes.count || 0,
          activeConvs: convsRes.count || 0,
          appointmentsThisWeek: apptsRes.count || 0,
          dealsWonMonth: dealsRes.count || 0,
          slaResponseRate: slaRate,
        });

        // Ranking de deals ganhos no mês (apenas se showRanking)
        if (showRanking) {
          const { data: monthDeals } = await supabase
            .from('deals')
            .select('user_id')
            .gte('won_at', startOfMonth.toISOString())
            .not('user_id', 'is', null);

          const counts = new Map<string, number>();
          (monthDeals || []).forEach((d: any) => {
            counts.set(d.user_id, (counts.get(d.user_id) || 0) + 1);
          });

          const userIds = Array.from(counts.keys());
          if (userIds.length > 0) {
            const { data: members } = await supabase
              .from('team_members')
              .select('user_id, name')
              .in('user_id', userIds);

            const nameMap = new Map((members || []).map((m: any) => [m.user_id, m.name]));
            const list: RankingEntry[] = userIds
              .map(uid => ({
                user_id: uid,
                name: nameMap.get(uid) || 'Desconhecido',
                deals_won: counts.get(uid) || 0,
                is_me: uid === userId,
              }))
              .sort((a, b) => b.deals_won - a.deals_won);

            setRanking(list);
          } else {
            setRanking([]);
          }
        }
      } catch (e) {
        console.error('[MyScorecard] error', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId, showRanking]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-lg flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const myPosition = ranking.findIndex(r => r.is_me);
  const myRank = myPosition >= 0 ? myPosition + 1 : null;

  const stats = [
    {
      label: 'Leads novos hoje',
      value: data.leadsToday,
      icon: <Zap className="h-5 w-5" />,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10 border-violet-500/20',
    },
    {
      label: 'Conversas ativas',
      value: data.activeConvs,
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'text-primary',
      bg: 'bg-primary/10 border-primary/20',
    },
    {
      label: 'Agendamentos (7d)',
      value: data.appointmentsThisWeek,
      icon: <Calendar className="h-5 w-5" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Deals ganhos no mês',
      value: data.dealsWonMonth,
      icon: <Trophy className="h-5 w-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-lg">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Meu Placar</h3>
        </div>
        {myRank && ranking.length > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
            {myRank === 1 ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <Medal className="h-3.5 w-3.5 text-amber-400" />}
            <span className="text-xs font-bold text-amber-400">
              #{myRank} de {ranking.length}
            </span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {stats.map((s, i) => (
          <div key={i} className={`rounded-xl border p-4 ${s.bg}`}>
            <div className={`mb-2 ${s.color}`}>{s.icon}</div>
            <div className="text-2xl font-bold tracking-tight">{s.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* SLA bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Taxa de resposta SLA (7d)</span>
          <span className={`text-xs font-bold ${data.slaResponseRate >= 80 ? 'text-emerald-400' : data.slaResponseRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {data.slaResponseRate}%
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              data.slaResponseRate >= 80
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : data.slaResponseRate >= 50
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-red-500 to-red-400'
            }`}
            style={{ width: `${data.slaResponseRate}%` }}
          />
        </div>
      </div>

      {/* Ranking — visible only for admins or when there are competitors */}
      {showRanking && ranking.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ranking do mês {isAdmin ? '(equipe)' : ''}
            </span>
          </div>
          <div className="space-y-1.5">
            {ranking.slice(0, 5).map((r, i) => (
              <div
                key={r.user_id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  r.is_me
                    ? 'bg-primary/15 border border-primary/30'
                    : 'bg-secondary/40'
                }`}
              >
                <span className={`text-sm font-bold w-6 text-center ${
                  i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-muted-foreground'
                }`}>
                  {i + 1}
                </span>
                <span className={`text-sm flex-1 truncate ${r.is_me ? 'font-semibold' : ''}`}>
                  {r.name} {r.is_me && <span className="text-[10px] text-primary ml-1">(você)</span>}
                </span>
                <span className="text-sm font-bold text-amber-400">{r.deals_won}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyScorecard;
