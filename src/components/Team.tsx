import React, { useEffect, useState } from 'react';
import { UserPlus, Search, Loader2, X, Check, Edit2, Users, Settings, Trash2, Copy, Phone } from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';
import { TeamMember, type Team as TeamType, type TeamFunction } from '../types';
import { supabase } from '@/integrations/supabase/client';
import TeamConfigModal from './TeamConfigModal';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useCompanyContext } from '@/hooks/useCompanyContext';

const Team: React.FC = () => {
  const { isAdmin } = useCompanySettings();
  const { isSuperAdmin, companyId: myCompanyId } = useCompanyContext();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<TeamType[]>([]);
  const [functions, setFunctions] = useState<TeamFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [allCompanies, setAllCompanies] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'agent',
    team_id: '',
    function_id: '',
    weight: 1,
    whatsapp_number: '',
    status: 'active',
    company_id: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    role: 'agent',
    status: 'active' as 'active' | 'invited' | 'disabled',
    team_id: '',
    function_id: '',
    weight: 1,
    whatsapp_number: '',
    google_calendar_email: ''
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    loadAllData();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [membersData, teamsData, functionsData] = await Promise.all([
        api.fetchTeam(),
        api.fetchTeams(),
        api.fetchTeamFunctions()
      ]);
      setMembers(membersData);
      setTeams(teamsData);
      setFunctions(functionsData);
    } catch (error) {
      console.error("Erro ao carregar dados da equipe", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from('companies').select('id, name').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setAllCompanies(data);
    });
  }, [isSuperAdmin]);

  const setupRealtime = () => {
    const channel = supabase
      .channel('team-members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => {
        loadAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Apenas administradores podem criar usuários');
      return;
    }
    
    setIsCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const targetCompanyId = isSuperAdmin
        ? (formData.company_id || myCompanyId)
        : myCompanyId;

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          name: formData.name,
          email: formData.email,
          role: isSuperAdmin ? formData.role : 'agent',
          team_id: formData.team_id || undefined,
          function_id: formData.function_id || undefined,
          weight: formData.weight,
          whatsapp_number: formData.whatsapp_number || undefined,
          status: formData.status,
          company_id: targetCompanyId || undefined,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setCredentials({ email: formData.email, password: data.temporary_password });
      setShowModal(false);
      setShowCredentialsModal(true);
      setFormData({ name: '', email: '', role: 'agent', team_id: '', function_id: '', weight: 1, whatsapp_number: '', status: 'active', company_id: '' });
      toast.success('Usuário criado com sucesso!');
      await loadAllData();
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      toast.error(error.message || 'Erro ao criar usuário');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!credentials) return;
    const text = `Email: ${credentials.email}\nSenha temporária: ${credentials.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credenciais copiadas!');
  };

  const handleUpdateMember = async (id: string, field: string, value: any) => {
    try {
      await api.updateTeamMember(id, { [field]: value });
      toast.success('Membro atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar membro:', error);
      toast.error('Erro ao atualizar membro');
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir ${name}?`)) return;
    try {
      await api.deleteTeamMember(id);
      toast.success('Membro removido com sucesso');
      await loadAllData();
    } catch (error) {
      console.error('Erro ao remover membro:', error);
      toast.error('Erro ao remover membro');
    }
  };

  const handleEditClick = (member: TeamMember) => {
    setEditingMember(member);
    setEditFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.status,
      team_id: member.team_id || '',
      function_id: member.function_id || '',
      weight: member.weight || 1,
      whatsapp_number: member.whatsapp_number || '',
      google_calendar_email: (member as any).google_calendar_email || ''
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    try {
      await api.updateTeamMember(editingMember.id, {
        name: editFormData.name,
        email: editFormData.email,
        role: editFormData.role as 'admin' | 'manager' | 'agent',
        status: editFormData.status,
        team_id: editFormData.team_id || null,
        function_id: editFormData.function_id || null,
        weight: editFormData.weight,
        whatsapp_number: editFormData.whatsapp_number || null,
        google_calendar_email: editFormData.google_calendar_email || null
      } as any);
      toast.success('Membro atualizado com sucesso!');
      setShowEditModal(false);
      setEditingMember(null);
      await loadAllData();
    } catch (error) {
      console.error('Erro ao editar membro:', error);
      toast.error('Erro ao editar membro');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'active':
            return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-slate-700 text-white shadow-sm">Ativo</span>;
        case 'invited':
            return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-amber-900/50 text-amber-500 shadow-sm">Pendente</span>;
        default:
            return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950 border border-slate-800 text-slate-500 shadow-sm">Inativo</span>;
    }
  };

  const filteredMembers = members.filter(m => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const teamName = teams.find(t => t.id === m.team_id)?.name || '';
    const funcName = functions.find(f => f.id === m.function_id)?.name || '';
    return (
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      teamName.toLowerCase().includes(term) ||
      funcName.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: members.length,
    admins: members.filter(m => m.role === 'admin').length,
    members: members.filter(m => m.role !== 'admin').length,
    teams: teams.length
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50 relative custom-scrollbar">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Equipe</h2>
          <p className="text-sm text-slate-400 mt-1">Gerencie usuários e times da organização</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              <Button onClick={() => setShowConfigModal(true)} variant="outline" className="border-slate-700">
                <Settings className="w-4 h-4 mr-2" />
                Configurar
              </Button>
              <Button onClick={() => setShowModal(true)} className="shadow-lg shadow-cyan-500/20 bg-slate-100 text-slate-900 hover:bg-white hover:text-black">
                <UserPlus className="w-4 h-4 mr-2" />
                Criar Usuário
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Total de Usuários</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.total}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Admins</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.admins}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Membros</div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.members}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="text-sm font-medium text-slate-400 mb-2">Times Ativos</div>
            <div className="text-3xl font-bold text-white">{stats.teams}</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input 
            type="text" 
            placeholder="Buscar por nome, email, time ou função..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-96 pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-slate-700 outline-none placeholder:text-slate-600 transition-all"
        />
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800">
            <h3 className="text-lg font-bold text-white">Usuários da Equipe</h3>
            <p className="text-sm text-slate-500 mt-1">Gerencie roles e times dos usuários</p>
        </div>

        {loading ? (
             <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-3" />
                <span className="text-sm text-slate-400">Carregando dados...</span>
           </div>
        ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12">
                <Users className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-slate-400 mb-4">Nenhum membro cadastrado ainda.</p>
                {isAdmin && (
                  <Button onClick={() => setShowModal(true)} className="bg-slate-100 text-slate-900 hover:bg-white">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Criar Primeiro Usuário
                  </Button>
                )}
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800/50">
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Usuário</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">WhatsApp</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Função</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Peso</th>
                            <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider text-center">Status</th>
                            {isAdmin && <th className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider text-center">Ações</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                        {filteredMembers.map((member) => (
                            <tr key={member.id} className="hover:bg-slate-800/20 transition-colors group">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-700 uppercase">
                                            {member.name.substring(0, 2)}
                                        </div>
                                        <span className="text-sm font-medium text-slate-200">{member.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-slate-400">{member.email}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-slate-400">{member.whatsapp_number || '-'}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {isAdmin ? (
                                      <select
                                          value={member.role}
                                          onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                                          className="w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
                                      >
                                          <option value="agent">Atendente</option>
                                          <option value="manager">Gerente</option>
                                          <option value="admin">Admin</option>
                                      </select>
                                    ) : (
                                      <span className="text-sm text-slate-300">
                                        {member.role === 'agent' ? 'Atendente' : member.role === 'manager' ? 'Gerente' : 'Admin'}
                                      </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {isAdmin ? (
                                      <select
                                          value={member.team_id || ''}
                                          onChange={(e) => handleUpdateMember(member.id, 'team_id', e.target.value || null)}
                                          className="w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
                                      >
                                          <option value="">Sem time</option>
                                          {teams.map(team => (
                                              <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                      </select>
                                    ) : (
                                      <span className="text-sm text-slate-300">
                                        {teams.find(t => t.id === member.team_id)?.name || 'Sem time'}
                                      </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {isAdmin ? (
                                      <select
                                          value={member.function_id || ''}
                                          onChange={(e) => handleUpdateMember(member.id, 'function_id', e.target.value || null)}
                                          className="w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 cursor-pointer hover:border-slate-600 transition-colors"
                                      >
                                          <option value="">Sem função</option>
                                          {functions.map(func => (
                                              <option key={func.id} value={func.id}>{func.name}</option>
                                          ))}
                                      </select>
                                    ) : (
                                      <span className="text-sm text-slate-300">
                                        {functions.find(f => f.id === member.function_id)?.name || 'Sem função'}
                                      </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {isAdmin ? (
                                      <input
                                          type="number"
                                          min="1"
                                          max="10"
                                          value={member.weight || 1}
                                          onChange={(e) => handleUpdateMember(member.id, 'weight', parseInt(e.target.value))}
                                          className="w-16 px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-300 text-center"
                                      />
                                    ) : (
                                      <span className="text-sm text-slate-300">{member.weight || 1}</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {getStatusBadge(member.status)}
                                </td>
                                {isAdmin && (
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <div className="flex items-center justify-center gap-1">
                                          <button 
                                              onClick={() => handleEditClick(member)}
                                              className="p-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
                                              title="Editar membro"
                                          >
                                              <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button 
                                              onClick={() => handleDeleteMember(member.id, member.name)}
                                              className="p-2 rounded-lg text-slate-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
                                              title="Excluir membro"
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Criar Novo Usuário</h3>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Nome Completo</label>
                        <input 
                            required
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                            placeholder="Ex: João da Silva"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Email</label>
                        <input 
                            required
                            type="email" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                            placeholder="colaborador@empresa.com"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">WhatsApp do Atendente</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                          <input 
                              type="text" 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-10 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                              placeholder="5511999999999"
                              value={formData.whatsapp_number}
                              onChange={(e) => setFormData({...formData, whatsapp_number: e.target.value.replace(/\D/g, '')})}
                          />
                        </div>
                        <p className="text-xs text-slate-500">Formato: DDI + DDD + número (ex: 5511999999999)</p>
                    </div>
                    {isSuperAdmin && allCompanies.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Empresa <span className="text-red-400">*</span></label>
                        <select
                          required
                          value={formData.company_id}
                          onChange={(e) => setFormData({...formData, company_id: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                          <option value="">Selecione a empresa</option>
                          {allCompanies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Nível de Acesso</label>
                        {isSuperAdmin ? (
                          <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <div
                                    key={role}
                                    onClick={() => setFormData({...formData, role})}
                                    className={`cursor-pointer rounded-lg border p-2 text-center transition-all ${
                                        formData.role === role
                                        ? 'bg-slate-800 border-slate-500 text-white'
                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="text-xs font-bold uppercase mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {formData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-400">
                            Atendente (member) — administradores só podem criar membros
                          </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Time (opcional)</label>
                        <select
                            value={formData.team_id}
                            onChange={(e) => setFormData({...formData, team_id: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Função (opcional)</label>
                        <select
                            value={formData.function_id}
                            onChange={(e) => setFormData({...formData, function_id: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Peso (para distribuição)</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={formData.weight}
                            onChange={(e) => setFormData({...formData, weight: parseInt(e.target.value)})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="ghost" onClick={() => setShowModal(false)} className="flex-1 border border-slate-700 hover:bg-slate-800">Cancelar</Button>
                        <Button type="submit" className="flex-1 bg-white text-black hover:bg-slate-200" disabled={isCreatingUser}>
                          {isCreatingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Criar Usuário
                        </Button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-800">
                    <h3 className="text-lg font-bold text-white">Credenciais do Novo Usuário</h3>
                    <p className="text-sm text-amber-400 mt-2">⚠️ Copie as credenciais agora. A senha não será exibida novamente.</p>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                        <div>
                            <span className="text-xs text-slate-500">Email</span>
                            <p className="text-sm text-white font-mono">{credentials.email}</p>
                        </div>
                        <div>
                            <span className="text-xs text-slate-500">Senha Temporária</span>
                            <p className="text-sm text-white font-mono">{credentials.password}</p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-400">
                      O usuário deverá trocar a senha no primeiro login.
                    </p>

                    <div className="flex gap-3">
                        <Button onClick={handleCopyCredentials} className="flex-1 bg-white text-black hover:bg-slate-200">
                            <Copy className="w-4 h-4 mr-2" />
                            Copiar Credenciais
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowCredentialsModal(false); setCredentials(null); }} className="border border-slate-700 hover:bg-slate-800">
                            Fechar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Config Modal */}
      <TeamConfigModal 
        isOpen={showConfigModal} 
        onClose={() => setShowConfigModal(false)} 
        onUpdate={loadAllData}
      />

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Editar Membro</h3>
                    <button onClick={() => { setShowEditModal(false); setEditingMember(null); }} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Nome Completo</label>
                        <input 
                            required
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Email</label>
                        <input 
                            required
                            type="email" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                            value={editFormData.email}
                            onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">WhatsApp</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                          <input 
                              type="text" 
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-10 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all"
                              placeholder="5511999999999"
                              value={editFormData.whatsapp_number}
                              onChange={(e) => setEditFormData({...editFormData, whatsapp_number: e.target.value.replace(/\D/g, '')})}
                          />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Nível de Acesso</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['agent', 'manager', 'admin'].map((role) => (
                                <div 
                                    key={role}
                                    onClick={() => setEditFormData({...editFormData, role})}
                                    className={`cursor-pointer rounded-lg border p-2 text-center transition-all ${
                                        editFormData.role === role 
                                        ? 'bg-slate-800 border-slate-500 text-white' 
                                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="text-xs font-bold uppercase mb-1">{role === 'agent' ? 'Atendente' : role === 'manager' ? 'Gerente' : 'Admin'}</div>
                                    {editFormData.role === role && <div className="flex justify-center"><Check className="w-3 h-3" /></div>}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Status</label>
                        <select
                            value={editFormData.status}
                            onChange={(e) => setEditFormData({...editFormData, status: e.target.value as 'active' | 'invited' | 'disabled'})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="active">Ativo</option>
                            <option value="invited">Pendente</option>
                            <option value="disabled">Inativo</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Time</label>
                        <select
                            value={editFormData.team_id}
                            onChange={(e) => setEditFormData({...editFormData, team_id: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="">Sem time</option>
                            {teams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Função</label>
                        <select
                            value={editFormData.function_id}
                            onChange={(e) => setEditFormData({...editFormData, function_id: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        >
                            <option value="">Sem função</option>
                            {functions.map(func => (
                                <option key={func.id} value={func.id}>{func.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Peso</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={editFormData.weight}
                            onChange={(e) => setEditFormData({...editFormData, weight: parseInt(e.target.value)})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Email Google Calendar</label>
                        <input
                            type="email"
                            placeholder="vendedor@empresa.com"
                            value={editFormData.google_calendar_email}
                            onChange={(e) => setEditFormData({...editFormData, google_calendar_email: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-1 focus:ring-slate-600 outline-none transition-all placeholder:text-slate-600"
                        />
                        <p className="text-xs text-slate-500">Email usado no Google Calendar para associar eventos</p>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="ghost" onClick={() => { setShowEditModal(false); setEditingMember(null); }} className="flex-1 border border-slate-700 hover:bg-slate-800">Cancelar</Button>
                        <Button type="submit" className="flex-1 bg-white text-black hover:bg-slate-200">Salvar Alterações</Button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Team;
