import React, { useEffect, useState, useMemo } from 'react';
import { Search, UserPlus, MessageSquare, Loader2, Phone, Users, Thermometer, MapPin, Briefcase, Filter, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { api } from '../services/api';
import { Contact, TeamMember } from '../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useCompanySettings } from '@/hooks/useCompanySettings';

// Auto-generate tags from structured fields
function generateAutoTags(contact: Contact): { label: string; color: string }[] {
  const tags: { label: string; color: string }[] = [];
  if (contact.customerType) tags.push({ label: contact.customerType, color: 'bg-violet-500/15 text-violet-400 border-violet-500/30' });
  if (contact.interestServices?.length) {
    contact.interestServices.forEach(s => tags.push({ label: s, color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' }));
  }
  if (contact.city) tags.push({ label: contact.city, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' });
  if (contact.leadTemperature && contact.leadTemperature !== 'frio') {
    const tempColor = contact.leadTemperature === 'quente' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    tags.push({ label: `lead_${contact.leadTemperature}`, color: tempColor });
  }
  if (contact.leadStatus && contact.leadStatus !== 'novo') {
    tags.push({ label: contact.leadStatus, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' });
  }
  return tags;
}

const CUSTOMER_TYPES = ['arquiteto', 'cliente_final', 'engenheiro', 'construtora', 'empresa', 'designer'];
const LEAD_STATUSES = ['novo', 'qualificando', 'qualificado', 'agendado', 'perdido', 'ganho'];
const TEMPERATURES = ['quente', 'morno', 'frio'];
const TIMEFRAMES = ['imediato', '30d', '60d', '90d'];
const INTERACTION_RANGES = [
  { label: 'Hoje', days: 1 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90+ dias', days: 90 },
];

const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useCompanySettings();

  // Filter states
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTemp, setFilterTemp] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterInteraction, setFilterInteraction] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const [contactsData, teamData] = await Promise.all([api.fetchContacts(), api.fetchTeam()]);
        setContacts(contactsData);
        setTeamMembers(teamData.filter(m => m.user_id));
      } catch (error) {
        console.error("Erro ao carregar contatos", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Derive unique cities from data
  const uniqueCities = useMemo(() => {
    const cities = contacts.map(c => c.city).filter(Boolean) as string[];
    return [...new Set(cities)].sort();
  }, [contacts]);

  const hasActiveFilters = filterOwner !== 'all' || filterType !== 'all' || filterStatus !== 'all' || filterTemp !== 'all' || filterCity !== 'all' || filterTimeframe !== 'all' || filterProject !== 'all' || filterInteraction !== 'all';

  const clearFilters = () => {
    setFilterOwner('all'); setFilterType('all'); setFilterStatus('all'); setFilterTemp('all');
    setFilterCity('all'); setFilterTimeframe('all'); setFilterProject('all'); setFilterInteraction('all');
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || (c.name?.toLowerCase() || '').includes(term) || (c.phone || '').includes(term) || (c.email?.toLowerCase() || '').includes(term);
      if (!matchesSearch) return false;

      if (filterOwner !== 'all' && c.assignedUserId !== filterOwner) return false;
      if (filterType !== 'all' && c.customerType !== filterType) return false;
      if (filterStatus !== 'all' && c.leadStatus !== filterStatus) return false;
      if (filterTemp !== 'all' && c.leadTemperature !== filterTemp) return false;
      if (filterCity !== 'all' && c.city !== filterCity) return false;
      if (filterTimeframe !== 'all' && c.startTimeframe !== filterTimeframe) return false;
      if (filterProject !== 'all') {
        if (filterProject === 'sim' && c.hasProject !== true) return false;
        if (filterProject === 'nao' && c.hasProject !== false) return false;
      }
      if (filterInteraction !== 'all' && c.lastInteractionAt) {
        const days = parseInt(filterInteraction);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        if (new Date(c.lastInteractionAt) < cutoff) return false;
      }
      return true;
    });
  }, [contacts, searchTerm, filterOwner, filterType, filterStatus, filterTemp, filterCity, filterTimeframe, filterProject, filterInteraction]);

  const getTemperatureBadge = (temp: string | null) => {
    switch (temp) {
      case 'quente': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">🔴 Quente</span>;
      case 'morno': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">🟡 Morno</span>;
      case 'frio': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">🔵 Frio</span>;
      default: return <span className="text-xs text-slate-500">—</span>;
    }
  };

  const getStatusBadge = (status: string | null) => {
    const colors: Record<string, string> = {
      novo: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      qualificando: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      qualificado: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      agendado: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
      perdido: 'bg-red-500/15 text-red-400 border-red-500/30',
      ganho: 'bg-green-500/15 text-green-400 border-green-500/30',
    };
    if (!status) return <span className="text-xs text-slate-500">—</span>;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[status] || 'bg-slate-800 text-slate-400'}`}>{status}</span>;
  };

  const handleStartConversation = (contact: Contact) => {
    navigate(`/chat?contact=${encodeURIComponent(contact.phone)}`);
  };

  const getOwnerName = (userId: string | null) => {
    if (!userId) return null;
    const member = teamMembers.find(m => m.user_id === userId);
    return member?.name || null;
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Contatos</h2>
          <p className="text-sm text-slate-400 mt-1">CRM de leads e clientes com qualificação automática.</p>
        </div>
        <Button className="shadow-lg shadow-primary/20 opacity-50 cursor-not-allowed" disabled title="Em breve">
          <UserPlus className="w-4 h-4 mr-2" />
          Novo Contato
        </Button>
      </div>

      {/* Search + Filter Toggle */}
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 placeholder:text-slate-600 transition-all"
          />
        </div>
        <Button
          variant="outline"
          className={`w-full sm:w-auto bg-slate-950 border-slate-800 ${showFilters || hasActiveFilters ? 'text-primary border-primary/50' : 'text-slate-400'}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filtros {hasActiveFilters && `(${[filterOwner, filterType, filterStatus, filterTemp, filterCity, filterTimeframe, filterProject, filterInteraction].filter(f => f !== 'all').length})`}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          {isAdmin && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Responsável</label>
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {teamMembers.map(m => <SelectItem key={m.user_id!} value={m.user_id!}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Tipo de Cliente</label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {CUSTOMER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Temperatura</label>
            <Select value={filterTemp} onValueChange={setFilterTemp}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TEMPERATURES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Cidade</label>
            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Prazo</label>
            <Select value={filterTimeframe} onValueChange={setFilterTimeframe}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIMEFRAMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Projeto</label>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sim">Com projeto</SelectItem>
                <SelectItem value="nao">Sem projeto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Última Interação</label>
            <Select value={filterInteraction} onValueChange={setFilterInteraction}>
              <SelectTrigger className="bg-slate-950 border-slate-800 text-sm h-9"><SelectValue placeholder="Qualquer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer</SelectItem>
                {INTERACTION_RANGES.map(r => <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-80">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
            <span className="text-sm text-slate-400 animate-pulse">Carregando base de dados...</span>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-slate-400">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum contato encontrado</p>
            <p className="text-sm text-slate-500 mt-1">
              {searchTerm || hasActiveFilters ? 'Tente ajustar os filtros' : 'Os contatos aparecerão aqui'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Nome / Telefone</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Serviços / Tags</th>
                  <th className="px-5 py-3">Cidade</th>
                  <th className="px-5 py-3">Temp.</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Última Interação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredContacts.map((contact) => {
                  const autoTags = generateAutoTags(contact);
                  const ownerName = getOwnerName(contact.assignedUserId);
                  return (
                    <tr key={contact.id} className="hover:bg-slate-800/40 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-primary shadow-inner flex-shrink-0">
                            {(contact.name || contact.phone || '?').substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-200 group-hover:text-primary transition-colors truncate">{contact.name || 'Sem nome'}</div>
                            <div className="text-xs text-slate-500">{contact.phone}</div>
                            {ownerName && <div className="text-[10px] text-slate-600">👤 {ownerName}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-slate-300">{contact.customerType || '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {autoTags.slice(0, 4).map((tag, i) => (
                            <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${tag.color}`}>{tag.label}</span>
                          ))}
                          {autoTags.length > 4 && <span className="text-[10px] text-slate-500">+{autoTags.length - 4}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-slate-300">{contact.city || '—'}</span>
                        {contact.neighborhood && <div className="text-[10px] text-slate-600">{contact.neighborhood}</div>}
                      </td>
                      <td className="px-5 py-3">{getTemperatureBadge(contact.leadTemperature)}</td>
                      <td className="px-5 py-3">{getStatusBadge(contact.leadStatus)}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-slate-400">{contact.lastInteractionAt ? new Date(contact.lastInteractionAt).toLocaleDateString('pt-BR') : contact.lastContact}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="primary"
                          className="h-8 w-8 p-0 rounded-lg shadow-none opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Iniciar Conversa"
                          onClick={() => handleStartConversation(contact)}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-slate-600 text-right">{filteredContacts.length} de {contacts.length} contatos</div>
    </div>
  );
};

export default Contacts;
