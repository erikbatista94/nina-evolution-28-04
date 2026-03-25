import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  Search, MoreVertical, Phone, Paperclip, Send, Check, CheckCheck, 
  Smile, Play, Loader2, MessageSquare, Info, X, Mail, 
  Tag, Bot, User, Pause, Brain, Plus, Users, ExternalLink, Calendar, Zap, Mic
} from 'lucide-react';
import { MessageDirection, MessageType, UIConversation, UIMessage, ConversationStatus, TagDefinition } from '../types';
import { Button } from './Button';
import { useConversations } from '../hooks/useConversations';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';
import { TagSelector } from './TagSelector';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { QuickReplyDropdown } from './QuickReplyDropdown';
import { QuickRepliesManager } from './QuickRepliesManager';
import AudioRecorder from './AudioRecorder';

const EMOJI_CATEGORIES = [
  { label: '😀 Smileys', emojis: ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','🤯','😳','🥺','😱','😨','😰','😢','😭','😤','😠','😡','🤬','🤮','🤢','🤧','😇','🥳','🥴','🥱','😈'] },
  { label: '👋 Gestos', emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👋','🤚','✋','🖐️','👊','✊','🤛','🤜','🙏','💪','🫶','❤️‍🔥'] },
  { label: '❤️ Corações', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💝','💘'] },
  { label: '🎉 Objetos', emojis: ['🎉','🎊','🎈','✨','🔥','💯','⭐','🌟','💡','📌','📎','✅','❌','⚠️','💬','👀','🚀','🏆','🎯','💰','📱','💻','📧','🗓️','⏰','🔔'] },
];

const ChatInterface: React.FC = () => {
  const { conversations, loading, sendMessage, sendFileMessage, sendAudioMessage, updateStatus, markAsRead, assignConversation, realtimeConnected, refetch } = useConversations();
  const { sdrName, companyName, isAdmin } = useCompanySettings();
  const { user } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [showProfileInfo, setShowProfileInfo] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [notesValue, setNotesValue] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'mine'>(() => {
    return (localStorage.getItem('chat-view-filter') as 'all' | 'mine') || 'all';
  });
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<{date: string; freeSlots: string[]}[] | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplyQuery, setQuickReplyQuery] = useState('');
  const [showQuickRepliesManager, setShowQuickRepliesManager] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [pendingAppointment, setPendingAppointment] = useState<any>(null);
  const [confirmingAppointment, setConfirmingAppointment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Audio player state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  
  const activeChat = conversations.find(c => c.id === selectedChatId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Format audio time helper
  const formatAudioTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load tag definitions and team members
  useEffect(() => {
    api.fetchTagDefinitions().then(setAvailableTags).catch(err => {
      console.error('Error loading tags:', err);
      toast.error('Erro ao carregar tags');
    });

    api.fetchTeam().then(setTeamMembers).catch(err => {
      console.error('Error loading team members:', err);
    });
  }, []);

  // Auto-select first conversation or from URL param
  useEffect(() => {
    // Check for conversation param in URL
    const urlParams = new URLSearchParams(window.location.search);
    const conversationParam = urlParams.get('conversation');
    
    if (conversationParam && conversations.some(c => c.id === conversationParam)) {
      setSelectedChatId(conversationParam);
      // Check for suggested message param
      const suggestedMsg = urlParams.get('suggested');
      if (suggestedMsg) {
        setInputText(decodeURIComponent(suggestedMsg));
        // Clean URL params after using
        window.history.replaceState({}, '', window.location.pathname + '?conversation=' + conversationParam);
      }
    } else if (conversations.length > 0 && !selectedChatId) {
      setSelectedChatId(conversations[0].id);
    }
  }, [conversations, selectedChatId]);

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedChatId && (activeChat?.unreadCount ?? 0) > 0) {
      markAsRead(selectedChatId);
    }
  }, [selectedChatId, activeChat?.unreadCount, markAsRead]);

  // Sync notes value with active chat
  useEffect(() => {
    if (activeChat) {
      setNotesValue(activeChat.notes || '');
    }
  }, [activeChat?.id]);

  // Load pending appointment for active conversation
  useEffect(() => {
    if (!activeChat) { setPendingAppointment(null); return; }
    const loadPending = async () => {
      const { data } = await supabase
        .from('appointments')
        .select('*, contact:contacts(id, name, phone_number, address_full)')
        .eq('contact_id', activeChat.contactId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPendingAppointment(data);
    };
    loadPending();
  }, [activeChat?.id]);

  // Handle notes save on blur
  const handleNotesBlur = async () => {
    if (!activeChat || notesValue === (activeChat.notes || '')) return;
    
    setIsSavingNotes(true);
    try {
      await api.updateContactNotes(activeChat.contactId, notesValue);
      toast.success('Notas salvas');
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Erro ao salvar notas');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeChat) {
      scrollToBottom();
    }
  }, [activeChat?.id, selectedChatId]); 

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages]);

  const handleToggleTag = async (tagKey: string) => {
    if (!activeChat) return;
    
    const currentTags = activeChat.tags || [];
    const newTags = currentTags.includes(tagKey)
      ? currentTags.filter(t => t !== tagKey)
      : [...currentTags, tagKey];
    
    try {
      await api.updateContactTags(activeChat.contactId, newTags);
      toast.success('Tag atualizada');
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error('Erro ao atualizar tag');
    }
  };

  const handleCreateTag = async (tag: { key: string; label: string; color: string; category: string }) => {
    try {
      const newTag = await api.createTagDefinition(tag);
      setAvailableTags(prev => [...prev, newTag]);
      toast.success('Tag criada com sucesso');
      
      // Adicionar a tag ao contato automaticamente
      if (activeChat) {
        await handleToggleTag(tag.key);
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Erro ao criar tag');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    const content = inputText.trim();
    setInputText('');
    
    await sendMessage(activeChat.id, content);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    console.log('[Chat] File selected:', file.name, file.type, file.size);

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 10MB');
      return;
    }

    // Determine message type
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const messageType: 'image' | 'document' = imageTypes.includes(file.type) ? 'image' : 'document';

    console.log('[Chat] Uploading file as:', messageType);
    setUploadingFile(true);

    try {
      await sendFileMessage(activeChat.id, file, messageType);
      console.log('[Chat] File message sent successfully');
      toast.success('Arquivo enviado');
    } catch (err) {
      console.error('[Chat] Error sending file:', err);
    } finally {
      setUploadingFile(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!activeChat) return;

    // Auto-assignment logic for human mode
    if (status === 'human') {
      const assignedId = activeChat.assignedUserId;
      
      if (assignedId && assignedId !== user?.id && !isAdmin) {
        const ownerName = getAssignedMemberName(assignedId) || 'outro responsável';
        toast.error(`Esta conversa já está atribuída a ${ownerName}.`);
        return;
      }

      // Auto-assign if unassigned
      if (!assignedId && user?.id) {
        await assignConversation(activeChat.id, user.id);
        toast.success('Conversa atribuída automaticamente a você.');
      }
    }

    await updateStatus(activeChat.id, status);
  };

  const handleCheckAvailability = async () => {
    setCheckingAvailability(true);
    setAvailableSlots(null);
    try {
      // Get next 3 business days
      const dates: string[] = [];
      const now = new Date();
      let d = new Date(now);
      while (dates.length < 3) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay();
        if (day !== 0 && day !== 6) {
          dates.push(d.toISOString().split('T')[0]);
        }
      }
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'check-availability', dates }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAvailableSlots(data?.availability || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao consultar disponibilidade');
    } finally {
      setCheckingAvailability(false);
    }
  };

  const myConversationsCount = conversations.filter(c => c.assignedUserId === user?.id).length;

  const handleViewFilterChange = (filter: 'all' | 'mine') => {
    setViewFilter(filter);
    localStorage.setItem('chat-view-filter', filter);
  };

  const filteredConversations = conversations.filter(chat => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!(chat.contactName.toLowerCase().includes(query) ||
            chat.contactPhone.includes(query) ||
            chat.lastMessage.toLowerCase().includes(query))) {
        return false;
      }
    }
    if (viewFilter === 'mine') {
      return chat.assignedUserId === user?.id;
    }
    if (assignedFilter !== 'all') {
      if (assignedFilter === 'unassigned') return !chat.assignedUserId;
      return chat.assignedUserId === assignedFilter;
    }
    return true;
  });

  const getAssignedMemberName = (userId: string | null) => {
    if (!userId) return null;
    const member = teamMembers.find(m => m.user_id === userId);
    return member?.name || null;
  };

  const renderStatusBadge = (status: ConversationStatus) => {
    const config = {
      nina: { label: sdrName, icon: Bot, color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
      human: { label: 'Humano', icon: User, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      paused: { label: 'Pausado', icon: Pause, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
    };
    const { label, icon: Icon, color } = config[status];
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 ${color}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const renderMessageContent = (msg: UIMessage) => {
    if (msg.type === MessageType.IMAGE) {
      return (
        <div className="mb-1 group relative">
          <a href={msg.mediaUrl || undefined} target="_blank" rel="noopener noreferrer">
            <img 
              src={msg.mediaUrl || msg.content} 
              alt="Anexo" 
              className="rounded-lg max-w-full h-auto max-h-72 object-cover border border-slate-700/50 shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://placehold.co/300x200/1e293b/cbd5e1?text=Erro+Imagem';
              }}
            />
          </a>
          {msg.content && msg.content !== '[imagem recebida]' && (
            <p className="mt-1 leading-relaxed whitespace-pre-wrap text-sm">{msg.content}</p>
          )}
        </div>
      );
    }

    if (msg.type === MessageType.VIDEO) {
      return (
        <div className="mb-1">
          {msg.mediaUrl ? (
            <video 
              src={msg.mediaUrl} 
              controls 
              className="rounded-lg max-w-full max-h-72 border border-slate-700/50 shadow-lg"
              preload="metadata"
            />
          ) : (
            <div className="flex items-center gap-2 py-2 px-3 bg-slate-700/30 rounded-lg border border-slate-700/50">
              <Play className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-400">Vídeo (mídia indisponível)</span>
            </div>
          )}
          {msg.content && msg.content !== '[vídeo recebido]' && (
            <p className="mt-1 leading-relaxed whitespace-pre-wrap text-sm">{msg.content}</p>
          )}
        </div>
      );
    }

    if (msg.type === MessageType.DOCUMENT) {
      const fileName = msg.content && msg.content !== '[documento recebido]' ? msg.content : 'Documento';
      return (
        <div className="mb-1">
          {msg.mediaUrl ? (
            <a 
              href={msg.mediaUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 py-3 px-4 bg-slate-700/30 rounded-lg border border-slate-700/50 hover:bg-slate-700/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Paperclip className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-slate-400 group-hover:text-slate-300">Clique para abrir</p>
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-2 py-2 px-3 bg-slate-700/30 rounded-lg border border-slate-700/50">
              <Paperclip className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-400">{fileName}</span>
            </div>
          )}
        </div>
      );
    }

    if (msg.type === MessageType.AUDIO) {
      const isPlaying = playingAudioId === msg.id;
      const duration = audioDurations[msg.id] || 0;
      const progress = audioProgress[msg.id] || 0;
      
      const togglePlay = () => {
        const audio = audioRefs.current[msg.id];
        if (!audio) return;
        
        if (isPlaying) {
          audio.pause();
          setPlayingAudioId(null);
        } else {
          Object.values(audioRefs.current).forEach(a => a.pause());
          audio.play();
          setPlayingAudioId(msg.id);
        }
      };

      return (
        <div className="flex items-center gap-3 min-w-[220px] py-1">
          {msg.mediaUrl && (
            <audio
              ref={el => { if (el) audioRefs.current[msg.id] = el; }}
              src={msg.mediaUrl}
              onLoadedMetadata={(e) => {
                const audio = e.currentTarget;
                setAudioDurations(prev => ({ ...prev, [msg.id]: audio.duration }));
              }}
              onTimeUpdate={(e) => {
                const audio = e.currentTarget;
                setAudioProgress(prev => ({ ...prev, [msg.id]: audio.currentTime }));
              }}
              onEnded={() => setPlayingAudioId(null)}
            />
          )}
          
          <button 
            onClick={togglePlay}
            disabled={!msg.mediaUrl}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all shadow-md ${
              msg.direction === MessageDirection.OUTGOING 
                ? 'bg-white text-cyan-600 hover:bg-cyan-50 disabled:opacity-50' 
                : 'bg-cyan-500 text-white hover:bg-cyan-400 disabled:opacity-50'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
            )}
          </button>
          
          <div className="flex-1 flex flex-col gap-1 justify-center h-9">
            <div 
              className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${
                msg.direction === MessageDirection.OUTGOING ? 'bg-white/30' : 'bg-slate-600'
              }`}
              onClick={(e) => {
                const audio = audioRefs.current[msg.id];
                if (!audio || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                audio.currentTime = percent * duration;
              }}
            >
              <div 
                className={`h-full rounded-full transition-all ${
                  msg.direction === MessageDirection.OUTGOING ? 'bg-white' : 'bg-cyan-400'
                }`}
                style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
              />
            </div>
            <span className={`text-[10px] font-medium ${
              msg.direction === MessageDirection.OUTGOING ? 'text-cyan-100' : 'text-slate-400'
            }`}>
              {formatAudioTime(progress)} / {formatAudioTime(duration)}
            </span>
          </div>
        </div>
      );
    }

    return <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

  if (loading) {
    return (
      <div className="flex h-full bg-slate-950 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-500">Sincronizando conversas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-950 rounded-tl-2xl overflow-hidden border-t border-l border-slate-800/50 shadow-2xl">
      
      {/* Left Sidebar: Chat List */}
      <div className="w-80 lg:w-96 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-md z-20 flex-shrink-0">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Chats Ativos</h2>
              <button
                onClick={() => setShowQuickRepliesManager(true)}
                title="Mensagens Rápidas"
                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={!realtimeConnected ? refetch : undefined}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                realtimeConnected
                  ? 'text-emerald-400 cursor-default'
                  : 'text-red-400 animate-pulse cursor-pointer hover:bg-red-500/10'
              }`}
              title={realtimeConnected ? 'Realtime conectado' : 'Conexão perdida — clique para reconectar'}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${
                realtimeConnected ? 'bg-emerald-400' : 'bg-red-400'
              }`} />
              {!realtimeConnected && 'Reconectando...'}
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar conversa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none text-slate-200 placeholder:text-slate-600 transition-all"
            />
          </div>
        </div>

        {/* View Filter Tabs */}
        <div className="px-4 py-2 border-b border-slate-800/50 flex flex-col gap-2">
          <div className="flex gap-1 bg-slate-950/50 rounded-lg p-0.5">
            <button
              onClick={() => handleViewFilterChange('all')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                viewFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Geral
            </button>
            <button
              onClick={() => handleViewFilterChange('mine')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                viewFilter === 'mine'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Minhas ({myConversationsCount})
            </button>
          </div>

          {/* Manager: filter by team member */}
          {isAdmin && viewFilter === 'all' && (
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="h-8 text-xs bg-slate-950/50 border-slate-800">
                <Users className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="unassigned">Não atribuídas</SelectItem>
                {teamMembers
                  .filter(m => m.status === 'active' && m.user_id)
                  .map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
              <p className="text-xs mt-1 opacity-70">
                {viewFilter === 'mine' ? 'Nenhuma conversa atribuída a você' : 'As conversas aparecerão aqui quando receberem mensagens'}
              </p>
            </div>
          ) : (
            filteredConversations.map((chat) => (
              <div 
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`flex items-center p-4 cursor-pointer transition-all duration-200 border-b border-slate-800/30 hover:bg-slate-800/50 ${
                  selectedChatId === chat.id 
                    ? 'bg-slate-800/80 border-l-2 border-l-cyan-500' 
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-slate-700 to-slate-900">
                    <img 
                      src={chat.contactAvatar} 
                      alt={chat.contactName} 
                      className="w-full h-full rounded-full object-cover border border-slate-800" 
                    />
                  </div>
                  {chat.unreadCount > 0 ? (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-cyan-500 border-2 border-slate-900 rounded-full animate-pulse"></span>
                  ) : (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-slate-600 border-2 border-slate-900 rounded-full"></span>
                  )}
                </div>
                
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`text-sm font-semibold truncate ${selectedChatId === chat.id ? 'text-white' : 'text-slate-300'}`}>
                      {chat.contactName}
                    </h3>
                    <span className="text-[10px] text-slate-500 font-medium">{chat.lastMessageTime}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {chat.messages[chat.messages.length - 1]?.type === MessageType.IMAGE ? '📷 Imagem' : 
                     chat.messages[chat.messages.length - 1]?.type === MessageType.AUDIO ? '🎵 Áudio' : 
                     chat.messages[chat.messages.length - 1]?.type === MessageType.VIDEO ? '🎬 Vídeo' : 
                     chat.messages[chat.messages.length - 1]?.type === MessageType.DOCUMENT ? '📎 Documento' : 
                     chat.lastMessage || 'Sem mensagens'}
                  </p>
                  
                  <div className="flex items-center mt-2 gap-1.5 flex-wrap">
                    {renderStatusBadge(chat.status)}
                    {!chat.assignedUserId && (
                      <span className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] rounded-md font-medium">
                        Não atribuída
                      </span>
                    )}
                    {chat.assignedUserId === user?.id && (
                      <span className="px-2 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[10px] rounded-md font-medium">
                        Minha
                      </span>
                    )}
                    {chat.assignedUserId && chat.assignedUserId !== user?.id && (
                      <span className="px-2 py-0.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-[10px] rounded-md font-medium truncate max-w-[80px]" title={getAssignedMemberName(chat.assignedUserId) || ''}>
                        {getAssignedMemberName(chat.assignedUserId) || 'Atribuída'}
                      </span>
                    )}
                    {chat.tags.slice(0, 1).map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-[10px] rounded-md font-medium">
                        {tag}
                      </span>
                    ))}
                    {chat.unreadCount > 0 && (
                      <span className="ml-auto bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-[10px] font-bold px-1.5 h-4 min-w-[1rem] flex items-center justify-center rounded-full shadow-lg shadow-cyan-500/20">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Area: Chat Window & Profile */}
      {activeChat ? (
        <div className="flex-1 flex overflow-hidden bg-[#0B0E14]">
          {/* Main Chat Content */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

            {/* Chat Header */}
            <div className="h-16 px-6 flex items-center justify-between bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-10 shrink-0">
              <div 
                className="flex items-center cursor-pointer hover:bg-slate-800/50 p-1.5 -ml-1.5 rounded-lg transition-colors pr-3"
                onClick={() => setShowProfileInfo(!showProfileInfo)}
              >
                <div className="relative">
                  <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-9 h-9 rounded-full ring-2 ring-slate-800" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
                </div>
                <div className="ml-3">
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    {activeChat.contactName}
                    {renderStatusBadge(activeChat.status)}
                  </h2>
                  <p className="text-xs text-cyan-500 font-medium">{activeChat.contactPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Status control buttons */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'nina' ? 'bg-violet-500/20 text-violet-400' : ''}`}
                  onClick={() => handleStatusChange('nina')}
                  title={`Ativar ${sdrName} (IA)`}
                >
                  <Bot className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'human' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                  onClick={() => handleStatusChange('human')}
                  title="Assumir conversa"
                >
                  <User className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'paused' ? 'bg-amber-500/20 text-amber-400' : ''}`}
                  onClick={() => handleStatusChange('paused')}
                  title="Pausar conversa"
                >
                  <Pause className="w-5 h-5" />
                </Button>
                <div className="h-6 w-px bg-slate-800 mx-1"></div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${showProfileInfo ? 'bg-slate-800 text-cyan-400' : ''}`} 
                  onClick={() => setShowProfileInfo(!showProfileInfo)} 
                  title="Ver Informações"
                >
                  <Info className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  disabled
                  title="Em breve: Mais opções"
                  className="text-slate-500 cursor-not-allowed opacity-50"
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-0">
              {activeChat.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                  <p className="text-xs mt-1 opacity-70">Envie uma mensagem para iniciar a conversa</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center my-6">
                    <span className="px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium rounded-full shadow-sm backdrop-blur-sm">Hoje</span>
                  </div>

                  {activeChat.messages.map((msg) => {
                    const isOutgoing = msg.direction === MessageDirection.OUTGOING;
                    return (
                      <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`flex flex-col max-w-[75%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
                          <div 
                            className={`px-5 py-3 rounded-2xl shadow-md relative text-sm leading-relaxed ${
                              isOutgoing 
                                ? msg.fromType === 'nina'
                                  ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-sm shadow-violet-900/20'
                                  : 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white rounded-tr-sm shadow-cyan-900/20'
                                : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50'
                            }`}
                          >
                            {renderMessageContent(msg)}
                          </div>
                          
                          <div className="flex items-center mt-1.5 gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity px-1">
                            {isOutgoing && msg.fromType === 'nina' && (
                              <Bot className="w-3 h-3 text-violet-400" />
                            )}
                            {isOutgoing && msg.fromType === 'human' && (
                              <User className="w-3 h-3 text-cyan-400" />
                            )}
                            {isOutgoing && msg.fromType === 'human' && (
                              <span className="text-[10px] text-cyan-400 font-medium">
                                {msg.senderUserId 
                                  ? (teamMembers.find(m => m.id === msg.senderUserId || (m as any).user_id === msg.senderUserId)?.name || 'Agente')
                                  : 'Agente'}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 font-medium">{msg.timestamp}</span>
                            {isOutgoing && (
                              msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-cyan-500" /> : 
                              msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-slate-500" /> :
                              <Check className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

             {/* Input Area */}
            <div className="p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-sm z-10">
              {isRecording && activeChat ? (
                <div className="max-w-4xl mx-auto">
                  <AudioRecorder
                    onSend={async (blob) => {
                      await sendAudioMessage(activeChat.id, blob);
                      setIsRecording(false);
                    }}
                    onCancel={() => setIsRecording(false)}
                  />
                </div>
              ) : (
              <form onSubmit={handleSendMessage} className="flex items-end gap-3 max-w-4xl mx-auto">
                <div className="flex items-center gap-1">
                  {/* Emoji Picker */}
                  <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        title="Emojis"
                        className="text-slate-400 rounded-full hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                      >
                        <Smile className="w-5 h-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent 
                      className="w-80 p-0 bg-slate-900 border-slate-700" 
                      side="top" 
                      align="start"
                      sideOffset={8}
                    >
                      <div className="max-h-64 overflow-y-auto p-2">
                        {EMOJI_CATEGORIES.map((cat) => (
                          <div key={cat.label} className="mb-2">
                            <p className="text-xs font-medium text-slate-500 px-1 mb-1">{cat.label}</p>
                            <div className="grid grid-cols-8 gap-0.5">
                              {cat.emojis.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    setInputText(prev => prev + emoji);
                                    setEmojiPickerOpen(false);
                                    textareaRef.current?.focus();
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-800 text-lg transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon"
                    disabled={uploadingFile}
                    title="Enviar anexo"
                    className="text-slate-400 rounded-full hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                    onClick={() => {
                      console.log('[Chat] Attach button clicked');
                      fileInputRef.current?.click();
                    }}
                  >
                    {uploadingFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/jpg,image/png,image/webp,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                  />
                </div>
                
                <div className="flex-1 relative bg-slate-950 rounded-2xl border border-slate-800 focus-within:ring-2 focus-within:ring-cyan-500/30 focus-within:border-cyan-500/50 transition-all shadow-inner">
                  <QuickReplyDropdown
                    query={quickReplyQuery}
                    visible={showQuickReplies}
                    onSelect={(content) => {
                      setInputText(content);
                      setShowQuickReplies(false);
                      setQuickReplyQuery('');
                    }}
                    onClose={() => {
                      setShowQuickReplies(false);
                      setQuickReplyQuery('');
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInputText(val);
                      const slashMatch = val.match(/(?:^|\s)\/(\S*)$/);
                      if (slashMatch) {
                        setShowQuickReplies(true);
                        setQuickReplyQuery(slashMatch[1]);
                      } else {
                        setShowQuickReplies(false);
                        setQuickReplyQuery('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (showQuickReplies) {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowQuickReplies(false);
                          return;
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!showQuickReplies) handleSendMessage();
                      }
                    }}
                    placeholder={activeChat.status === 'nina' ? `${sdrName} está respondendo automaticamente...` : 'Digite / para atalhos...'}
                    className="w-full bg-transparent border-none p-3.5 max-h-32 min-h-[48px] text-sm text-slate-200 focus:ring-0 resize-none outline-none placeholder:text-slate-600"
                    rows={1}
                  />
                </div>

                {inputText.trim() ? (
                  <Button 
                    type="submit" 
                    className="rounded-full w-12 h-12 p-0 transition-all shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95"
                  >
                    <Send className="w-5 h-5 ml-0.5" />
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRecording(true)}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95"
                    title="Gravar áudio"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </form>
              )}
            </div>
          </div>

          {/* Right Profile Sidebar (CRM View) */}
          <div 
            className={`${showProfileInfo ? 'w-80 border-l border-slate-800 opacity-100' : 'w-0 opacity-0 border-none'} transition-all duration-300 ease-in-out bg-slate-900/95 flex-shrink-0 flex flex-col overflow-hidden`}
          >
            <div className="w-80 h-full flex flex-col">
              {/* Header */}
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 flex-shrink-0">
                <span className="font-semibold text-white">Informações do Lead</span>
                <button 
                  onClick={() => setShowProfileInfo(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {/* Identity */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-500 to-teal-600 shadow-xl mb-4">
                    <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-full h-full rounded-full object-cover border-2 border-slate-900" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{activeChat.contactName}</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {activeChat.clientMemory.lead_profile.lead_stage === 'new' ? 'Novo Lead' : 
                     activeChat.clientMemory.lead_profile.lead_stage === 'qualified' ? 'Lead Qualificado' :
                     activeChat.clientMemory.lead_profile.lead_stage}
                  </p>
                </div>

                {/* Details List */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dados de Contato</h4>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Telefone</span>
                      <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
                    </div>
                  </div>

                  {activeChat.contactEmail && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Email</span>
                        <span className="text-slate-200 font-medium">{activeChat.contactEmail}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* AI Memory Section */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Memória do(a) {sdrName}
                  </h4>
                  
                  {activeChat.clientMemory.lead_profile.interests.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-xs text-slate-400">Interesses</span>
                      <p className="text-sm text-slate-200 mt-1">
                        {activeChat.clientMemory.lead_profile.interests.join(', ')}
                      </p>
                    </div>
                  )}

                  {activeChat.clientMemory.sales_intelligence.pain_points.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-xs text-slate-400">Dores Identificadas</span>
                      <p className="text-sm text-slate-200 mt-1">
                        {activeChat.clientMemory.sales_intelligence.pain_points.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-400">Próxima Ação Sugerida</span>
                    <p className="text-sm text-slate-200 mt-1">
                      {activeChat.clientMemory.sales_intelligence.next_best_action === 'qualify' ? 'Qualificar lead' :
                       activeChat.clientMemory.sales_intelligence.next_best_action === 'demo' ? 'Agendar demonstração' :
                       activeChat.clientMemory.sales_intelligence.next_best_action}
                    </p>
                  </div>

                  <div className="text-xs text-slate-500 text-center">
                    Total de conversas: {activeChat.clientMemory.interaction_summary.total_conversations}
                  </div>
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Assigned User */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Responsável
                  </h4>
                  <select
                    value={activeChat.assignedUserId || ''}
                    onChange={(e) => {
                      const userId = e.target.value || null;
                      assignConversation(activeChat.id, userId);
                      toast.success('Conversa atribuída. Deal atualizado automaticamente.');
                    }}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all"
                  >
                    <option value="">Não atribuído</option>
                    {teamMembers
                      .filter(member => member.user_id)
                      .map(member => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.name} ({member.role})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Quick Actions - Ver horários */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Agendamento
                  </h4>
                  <button
                    onClick={handleCheckAvailability}
                    disabled={checkingAvailability}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm text-blue-400 transition-all disabled:opacity-50"
                  >
                    {checkingAvailability ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Consultando...</>
                    ) : (
                      <><Calendar className="w-4 h-4" />Ver horários disponíveis</>
                    )}
                  </button>
                  
                  {availableSlots && availableSlots.length > 0 && (
                    <div className="space-y-2">
                      {availableSlots.map((day, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                          <span className="text-xs text-slate-400 font-medium">
                            {day.date.split('-').reverse().join('/')}
                          </span>
                          {day.freeSlots.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {day.freeSlots.map((slot: string) => (
                                <button
                                  key={slot}
                                  onClick={() => {
                                    const msg = `Podemos agendar a visita para ${day.date.split('-').reverse().join('/')} às ${slot}?`;
                                    setInputText(msg);
                                    setAvailableSlots(null);
                                  }}
                                  className="px-2 py-1 bg-emerald-500/10 text-emerald-300 text-xs rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                                >
                                  {slot}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 mt-1">Sem horários</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>
                {/* Tags */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    Tags
                    <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
                      <PopoverTrigger asChild>
                        <button className="text-cyan-500 hover:text-cyan-400 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0 bg-slate-900 border-slate-700" align="end">
                        <TagSelector 
                          availableTags={availableTags}
                          selectedTags={activeChat.tags || []}
                          onToggleTag={handleToggleTag}
                          onCreateTag={handleCreateTag}
                        />
                      </PopoverContent>
                    </Popover>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeChat.tags && activeChat.tags.length > 0 ? (
                      activeChat.tags.map(tagKey => {
                        const tagDef = availableTags.find(t => t.key === tagKey);
                        return (
                          <span 
                            key={tagKey}
                            style={{ 
                              backgroundColor: tagDef?.color ? `${tagDef.color}20` : 'rgba(59, 130, 246, 0.2)',
                              borderColor: tagDef?.color || '#3b82f6'
                            }}
                            className="px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 group hover:brightness-110 transition-all"
                          >
                            <span className="text-slate-200">{tagDef?.label || tagKey}</span>
                            <button
                              onClick={() => handleToggleTag(tagKey)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-slate-400 hover:text-slate-200" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 italic">Nenhuma tag adicionada</p>
                    )}
                  </div>
                </div>

                {/* Notes Area */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    Notas Internas
                    {isSavingNotes && <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />}
                  </h4>
                  <textarea 
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none resize-none transition-all"
                    rows={4}
                    placeholder="Adicione observações sobre este lead..."
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    onBlur={handleNotesBlur}
                  />
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Send Lead to WhatsApp */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Enviar Lead via WhatsApp
                  </h4>
                  
                  {(() => {
                    const myMember = teamMembers.find((m: any) => m.user_id === user?.id);
                    const myWhatsApp = myMember?.whatsapp_number;
                    const assignedMember = teamMembers.find((m: any) => m.user_id === activeChat.assignedUserId);
                    const assignedWhatsApp = assignedMember?.whatsapp_number;

                    const buildLeadMessage = () => {
                      const interests = activeChat.clientMemory?.lead_profile?.interests || [];
                      const nextAction = activeChat.clientMemory?.sales_intelligence?.next_best_action || 'qualify';
                      const lastUserMsg = [...activeChat.messages].reverse().find(m => m.fromType === 'user');
                      
                      const lines = [
                        '*Lead GG*',
                        `Nome: ${activeChat.contactName}`,
                        `Telefone: ${activeChat.contactPhone}`,
                      ];
                      if (interests.length > 0) lines.push(`Interesses: ${interests.join(', ')}`);
                      if (lastUserMsg) lines.push(`Última msg: ${lastUserMsg.content?.substring(0, 100)}`);
                      lines.push(`Próxima ação: ${nextAction === 'qualify' ? 'Qualificar lead' : nextAction === 'demo' ? 'Agendar demonstração' : nextAction}`);
                      lines.push(`Link: ${window.location.origin}/chat?conversation=${activeChat.id}`);
                      
                      return lines.join('\n');
                    };

                    const handleSendToWhatsApp = (whatsappNumber: string) => {
                      const msg = buildLeadMessage();
                      const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
                      window.open(url, '_blank');
                    };

                    return (
                      <div className="space-y-2">
                        <button
                          onClick={() => myWhatsApp && handleSendToWhatsApp(myWhatsApp)}
                          disabled={!myWhatsApp}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 text-sm font-medium hover:bg-emerald-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={!myWhatsApp ? 'Configure seu WhatsApp no perfil da equipe' : undefined}
                        >
                          <Phone className="w-4 h-4" />
                          Enviar para meu WhatsApp
                        </button>
                        
                        {activeChat.assignedUserId && activeChat.assignedUserId !== user?.id && (
                          <button
                            onClick={() => assignedWhatsApp && handleSendToWhatsApp(assignedWhatsApp)}
                            disabled={!assignedWhatsApp}
                            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-cyan-600/20 border border-cyan-600/30 text-cyan-400 text-sm font-medium hover:bg-cyan-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!assignedWhatsApp ? 'O responsável não tem WhatsApp configurado' : undefined}
                          >
                            <Users className="w-4 h-4" />
                            Enviar para WhatsApp do responsável
                            {assignedMember && <span className="text-xs opacity-70">({assignedMember.name})</span>}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0B0E14] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center p-8 text-center max-w-md">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800 relative group">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl group-hover:bg-cyan-500/30 transition-all duration-1000"></div>
              <MessageSquare className="w-10 h-10 text-cyan-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{companyName} Workspace</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              {conversations.length === 0 
                ? 'Aguardando novas conversas. Configure o webhook do WhatsApp para começar a receber mensagens.'
                : 'Selecione uma conversa ao lado para iniciar o atendimento inteligente.'}
            </p>
            <div className="mt-8 flex gap-3 text-xs text-slate-500 font-mono bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-800/50">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {sdrName} Online
              </span>
              <span className="w-px h-4 bg-slate-800"></span>
              <span>{conversations.length} conversas</span>
            </div>
          </div>
        </div>
      )}

      <QuickRepliesManager open={showQuickRepliesManager} onClose={() => setShowQuickRepliesManager(false)} />
    </div>
  );
};

export default ChatInterface;
