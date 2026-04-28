import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Save, MessageSquare, Mic, Eye, EyeOff, Copy, Check, Loader2, Send, ChevronDown, Volume2, Download, Upload, FileAudio, HelpCircle, Zap, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/hooks/useAuth';

interface NinaSettings {
  id?: string;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  evolution_instance: string | null;
  evolution_connection_status: string | null;
  elevenlabs_api_key: string | null;
  elevenlabs_voice_id: string;
  elevenlabs_model: string | null;
  elevenlabs_stability: number;
  elevenlabs_similarity_boost: number;
  elevenlabs_style: number;
  elevenlabs_speed: number | null;
  elevenlabs_speaker_boost: boolean;
  audio_response_enabled: boolean;
  google_client_id: string | null;
  google_client_secret: string | null;
  google_refresh_token: string | null;
  google_calendar_id: string | null;
  default_visit_duration: number;
  available_time_slots: string[];
}

const VOICE_OPTIONS = [
  { id: '33B4UnXyTNbgLmdEDh5P', name: 'Keren - Young Brazilian Female', desc: 'Feminina, brasileira (Padrão)' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', desc: 'Feminina, natural' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', desc: 'Masculina, confiante' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Feminina, suave' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', desc: 'Feminina, expressiva' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Masculina, casual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Masculina, britânica' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Masculina, transatlântica' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', desc: 'Não-binária, americana' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Masculina, articulada' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Feminina, sueca' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Feminina, britânica' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Feminina, calorosa' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Masculina, amigável' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Feminina, expressiva' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Masculina, amigável' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', desc: 'Masculina, casual' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Masculina, profunda' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Masculina, britânica' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Feminina, britânica' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Masculina, americana' },
];

const MODEL_OPTIONS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Recomendado)' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
];

export interface ApiSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const ApiSettings = forwardRef<ApiSettingsRef>((props, ref) => {
  const { companyName } = useCompanySettings();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showGoogleRefresh, setShowGoogleRefresh] = useState(false);
  const [testingGcal, setTestingGcal] = useState(false);
  const [testingEvolution, setTestingEvolution] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState<{ ok: boolean; state?: string; message: string } | null>(null);
  const [advancedVoiceOpen, setAdvancedVoiceOpen] = useState(false);
  const [testSectionOpen, setTestSectionOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [audioTestOpen, setAudioTestOpen] = useState(false);
  const [audioTestText, setAudioTestText] = useState('Olá! Esta é uma mensagem de teste para verificar a qualidade da voz.');
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioStats, setAudioStats] = useState<{ duration_ms: number; size_kb: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioSimulateOpen, setAudioSimulateOpen] = useState(false);
  const [audioSimulatePhone, setAudioSimulatePhone] = useState('');
  const [audioSimulateName, setAudioSimulateName] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSimulating, setAudioSimulating] = useState(false);
  const [audioSimulateResult, setAudioSimulateResult] = useState<{
    transcription: string; contact_id: string; conversation_id: string; message_id: string; queued_for_nina: boolean;
  } | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<NinaSettings>({
    evolution_api_url: null, evolution_api_key: null, evolution_instance: null,
    evolution_connection_status: null, elevenlabs_api_key: null,
    elevenlabs_voice_id: '33B4UnXyTNbgLmdEDh5P', elevenlabs_model: 'eleven_turbo_v2_5',
    elevenlabs_stability: 0.75, elevenlabs_similarity_boost: 0.80, elevenlabs_style: 0.30,
    elevenlabs_speed: 1.0, elevenlabs_speaker_boost: true, audio_response_enabled: false,
    google_client_id: null, google_client_secret: null, google_refresh_token: null,
    google_calendar_id: null, default_visit_duration: 90,
    available_time_slots: ['08:00', '09:30', '11:00', '13:00', '14:30', '16:00'],
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  useEffect(() => { setTestMessage(`Olá! Esta é uma mensagem de teste do sistema ${companyName}. 🚀`); }, [companyName]);
  useEffect(() => { loadSettings(); }, []);

  useImperativeHandle(ref, () => ({ save: handleSave, cancel: loadSettings, isSaving: saving }));

  const loadSettings = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('nina_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { setLoading(false); return; }
      setSettings({
        id: data.id,
        evolution_api_url: (data as any).evolution_api_url ?? null,
        evolution_api_key: (data as any).evolution_api_key ?? null,
        evolution_instance: (data as any).evolution_instance ?? null,
        evolution_connection_status: (data as any).evolution_connection_status ?? null,
        elevenlabs_api_key: data.elevenlabs_api_key,
        elevenlabs_voice_id: data.elevenlabs_voice_id,
        elevenlabs_model: data.elevenlabs_model,
        elevenlabs_stability: data.elevenlabs_stability,
        elevenlabs_similarity_boost: data.elevenlabs_similarity_boost,
        elevenlabs_style: data.elevenlabs_style,
        elevenlabs_speed: data.elevenlabs_speed,
        elevenlabs_speaker_boost: data.elevenlabs_speaker_boost,
        audio_response_enabled: data.audio_response_enabled || false,
        google_client_id: (data as any).google_client_id || null,
        google_client_secret: (data as any).google_client_secret || null,
        google_refresh_token: (data as any).google_refresh_token || null,
        google_calendar_id: (data as any).google_calendar_id || null,
        default_visit_duration: (data as any).default_visit_duration || 90,
        available_time_slots: (data as any).available_time_slots || ['08:00', '09:30', '11:00', '13:00', '14:30', '16:00'],
      });
    } catch (error) {
      console.error('[ApiSettings] Error loading settings:', error);
      toast.error('Erro ao carregar configurações');
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.evolution_api_url && !/^https?:\/\//.test(settings.evolution_api_url)) {
        toast.error('URL da Evolution API deve começar com http:// ou https://'); return;
      }
      const { error } = await supabase.from('nina_settings').update({
        evolution_api_url: settings.evolution_api_url,
        evolution_api_key: settings.evolution_api_key,
        evolution_instance: settings.evolution_instance,
        elevenlabs_api_key: settings.elevenlabs_api_key,
        elevenlabs_voice_id: settings.elevenlabs_voice_id,
        elevenlabs_model: settings.elevenlabs_model,
        elevenlabs_stability: settings.elevenlabs_stability,
        elevenlabs_similarity_boost: settings.elevenlabs_similarity_boost,
        elevenlabs_style: settings.elevenlabs_style,
        elevenlabs_speed: settings.elevenlabs_speed,
        elevenlabs_speaker_boost: settings.elevenlabs_speaker_boost,
        audio_response_enabled: settings.audio_response_enabled,
        google_client_id: settings.google_client_id,
        google_client_secret: settings.google_client_secret,
        google_refresh_token: settings.google_refresh_token,
        google_calendar_id: settings.google_calendar_id,
        default_visit_duration: settings.default_visit_duration,
        available_time_slots: settings.available_time_slots,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id!);
      if (error) throw error;
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally { setSaving(false); }
  };

  const handleTestEvolution = async () => {
    if (!settings.evolution_api_url || !settings.evolution_api_key) {
      toast.error('Preencha a URL e a API Key antes de testar'); return;
    }
    setTestingEvolution(true); setEvolutionStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-test', {
        body: { url: settings.evolution_api_url, apiKey: settings.evolution_api_key, instance: settings.evolution_instance },
      });
      if (error) throw error;
      if (data?.ok) {
        const state = data.instanceState || 'open';
        setEvolutionStatus({ ok: true, state, message: `Conectado! Estado da instância: ${state}` });
        toast.success(`Evolution API conectada! Estado: ${state}`);
      } else {
        setEvolutionStatus({ ok: false, message: data?.error || 'Falha na conexão' });
        toast.error(data?.error || 'Falha ao conectar na Evolution API');
      }
    } catch (err: any) {
      const msg = err.message || 'Erro ao testar conexão';
      setEvolutionStatus({ ok: false, message: msg }); toast.error(msg);
    } finally { setTestingEvolution(false); }
  };

  const handleConfigureWebhook = async () => {
    if (!settings.evolution_api_url || !settings.evolution_api_key || !settings.evolution_instance) {
      toast.error('Preencha e salve as credenciais da Evolution API primeiro'); return;
    }
    setConfiguringWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-configure-webhook', { body: { webhookUrl } });
      if (error) throw error;
      if (data?.ok) { toast.success('Webhook configurado com sucesso na Evolution API!'); }
      else { toast.error(data?.error || 'Erro ao configurar webhook'); }
    } catch (err: any) { toast.error(err.message || 'Erro ao configurar webhook'); }
    finally { setConfiguringWebhook(false); }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true); toast.success('URL do webhook copiada!');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleElevenLabsKeyBlur = async () => {
    if (!settings.id || !settings.elevenlabs_api_key) return;
    try {
      const { error } = await supabase.from('nina_settings')
        .update({ elevenlabs_api_key: settings.elevenlabs_api_key, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
      if (error) throw error;
      toast.success('API Key da ElevenLabs salva automaticamente');
    } catch (error) { console.error('Error auto-saving ElevenLabs key:', error); }
  };

  const handleGenerateAudio = async () => {
    if (!settings.elevenlabs_api_key) { toast.error('Configure sua API Key da ElevenLabs primeiro'); return; }
    if (!audioTestText.trim()) { toast.error('Insira um texto para converter em áudio'); return; }
    setAudioGenerating(true); setAudioUrl(null); setAudioStats(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-elevenlabs-tts', {
        body: { text: audioTestText, apiKey: settings.elevenlabs_api_key, voiceId: settings.elevenlabs_voice_id, model: settings.elevenlabs_model, stability: settings.elevenlabs_stability, similarityBoost: settings.elevenlabs_similarity_boost, speed: settings.elevenlabs_speed },
      });
      if (error) throw error;
      if (data?.success && data?.audioBase64) {
        const audioBlob = new Blob([Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0))], { type: 'audio/mpeg' });
        setAudioUrl(URL.createObjectURL(audioBlob));
        setAudioStats({ duration_ms: data.duration_ms, size_kb: data.size_kb });
        toast.success(`Áudio gerado em ${(data.duration_ms / 1000).toFixed(1)}s`);
      } else { throw new Error(data?.error || 'Erro ao gerar áudio'); }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erro ao gerar áudio'); }
    finally { setAudioGenerating(false); }
  };

  const handleTestMessage = async () => {
    if (!settings.evolution_api_key || !settings.evolution_instance) { toast.error('⚠️ Preencha e SALVE as credenciais da Evolution API primeiro!'); return; }
    if (!testPhone.trim()) { toast.error('Insira um número de telefone'); return; }
    if (!testMessage.trim()) { toast.error('Insira uma mensagem'); return; }
    if (!testPhone.startsWith('+')) { toast.error('O número deve estar no formato internacional (ex: +5511999999999)'); return; }
    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-whatsapp-message', { body: { phone_number: testPhone, message: testMessage } });
      if (error) throw error;
      if (data?.success) { toast.success('Mensagem enviada com sucesso! ✅', { description: `ID: ${data.message_id}` }); }
      else { throw new Error(data?.error || 'Erro desconhecido'); }
    } catch (error) { toast.error('Falha ao enviar mensagem', { description: error instanceof Error ? error.message : 'Erro' }); }
    finally { setTestSending(false); }
  };

  const handleSimulateAudioWebhook = async () => {
    if (!audioSimulatePhone.trim()) { toast.error('Insira um número de telefone'); return; }
    if (!audioFile) { toast.error('Selecione um arquivo de áudio'); return; }
    const cleanPhone = audioSimulatePhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) { toast.error('Número de telefone inválido'); return; }
    setAudioSimulating(true); setAudioSimulateResult(null);
    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64 = btoa(new Uint8Array(arrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ''));
      const { data, error } = await supabase.functions.invoke('simulate-audio-webhook', {
        body: { phone: cleanPhone, name: audioSimulateName.trim() || undefined, audio_base64: base64, audio_mime_type: audioFile.type || 'audio/ogg' },
      });
      if (error) throw error;
      if (data?.success) {
        setAudioSimulateResult({ transcription: data.transcription, contact_id: data.contact_id, conversation_id: data.conversation_id, message_id: data.message_id, queued_for_nina: data.queued_for_nina });
        toast.success('Áudio simulado com sucesso!');
      } else { throw new Error(data?.error || 'Erro ao simular áudio'); }
    } catch (error) { toast.error('Falha na simulação', { description: error instanceof Error ? error.message : 'Erro' }); }
    finally { setAudioSimulating(false); }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!['audio/ogg','audio/mpeg','audio/mp3','audio/wav','audio/m4a','audio/webm','audio/mp4'].includes(file.type) && !file.name.match(/\.(ogg|mp3|wav|m4a|webm|mp4)$/i)) { toast.error('Formato de áudio não suportado'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 10MB)'); return; }
    setAudioFile(file); setAudioSimulateResult(null);
  };

  const evolutionConfigured = !!(settings.evolution_api_url && settings.evolution_api_key && settings.evolution_instance);
  const elevenlabsConfigured = !!settings.elevenlabs_api_key;
  const gcalConfigured = !!(settings.google_client_id && settings.google_client_secret && settings.google_refresh_token && settings.google_calendar_id);
  const [gcalStatus, setGcalStatus] = useState<{ status: 'idle'|'connected'|'error'|'not_configured'; message: string }>({ status: 'idle', message: '' });

  const handleTestGoogleCalendar = async () => {
    if (!gcalConfigured) { setGcalStatus({ status: 'not_configured', message: 'Preencha todos os campos.' }); return; }
    setTestingGcal(true); setGcalStatus({ status: 'idle', message: 'Testando...' });
    try {
      await supabase.from('nina_settings').update({ google_client_id: settings.google_client_id, google_client_secret: settings.google_client_secret, google_refresh_token: settings.google_refresh_token, google_calendar_id: settings.google_calendar_id, updated_at: new Date().toISOString() }).eq('id', settings.id!);
      const { data, error } = await supabase.functions.invoke('google-calendar', { body: { action: 'test-connection' } });
      if (error) throw error;
      if (data?.error) {
        const msgs: Record<string, string> = { credentials: 'Credenciais não encontradas.', refresh_token: 'Refresh Token inválido.', calendar_access: 'Sem acesso à agenda.' };
        const msg = msgs[data.step] || data.error;
        setGcalStatus({ status: 'error', message: msg }); toast.error(msg); return;
      }
      setGcalStatus({ status: 'connected', message: `Conectado! Agenda: ${data.calendarName} (${data.timeZone})` });
      toast.success(`Conectado! Agenda: ${data.calendarName}`);
    } catch (err: any) {
      const msg = err.message || 'Erro desconhecido';
      setGcalStatus({ status: 'error', message: msg }); toast.error(msg);
    } finally { setTestingGcal(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;
  }

  const inputClass = "h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2";
  const statusBadge = (configured: boolean, overrideOk?: boolean) => (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${(overrideOk ?? configured) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
      <span className={`h-2 w-2 rounded-full ${(overrideOk ?? configured) ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
      {(overrideOk ?? configured) ? 'Configurado' : 'Aguardando'}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── EVOLUTION API ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">Evolution API</h3>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${evolutionStatus?.ok ? 'bg-emerald-500/10 text-emerald-400' : evolutionConfigured ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            <span className={`h-2 w-2 rounded-full ${evolutionStatus?.ok || evolutionConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {evolutionStatus?.ok ? 'Conectado' : evolutionConfigured ? 'Configurado' : 'Aguardando'}
          </div>
        </div>

        {evolutionStatus && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${evolutionStatus.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {evolutionStatus.ok ? '✅' : '❌'} {evolutionStatus.message}
          </div>
        )}

        <details className="mb-4">
          <summary className="text-xs text-cyan-400 cursor-pointer hover:text-cyan-300 flex items-center gap-2 py-2">
            <HelpCircle className="w-4 h-4" /> Como obter as credenciais da Evolution API?
          </summary>
          <div className="mt-2 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
              <li>Acesse o painel da sua instância Evolution API (self-hosted ou cloud)</li>
              <li>Copie a <strong className="text-white">URL base</strong> (ex: <code className="text-cyan-400">https://evo.seudominio.com</code>)</li>
              <li>Em Configurações, copie a <strong className="text-white">Global API Key</strong></li>
              <li>Copie o <strong className="text-white">nome da instância</strong> WhatsApp criada</li>
              <li>Salve e clique em <strong className="text-white">Testar Conexão</strong></li>
              <li>Clique em <strong className="text-white">Configurar Webhook</strong> para apontar automaticamente</li>
            </ol>
            <p className="text-slate-500 pt-2 border-t border-slate-700">
              📚 <a href="https://doc.evolution-api.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Documentação oficial da Evolution API</a>
            </p>
          </div>
        </details>

        <div className="space-y-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Base URL <span className="text-red-400">*</span></label>
            <input type="url" value={settings.evolution_api_url || ''} onChange={(e) => setSettings({ ...settings, evolution_api_url: e.target.value })}
              placeholder="https://sua-evolution-api.com" className={`${inputClass} focus:ring-cyan-500/50`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">API Key <span className="text-red-400">*</span></label>
              <div className="relative">
                <input type={showEvolutionKey ? 'text' : 'password'} value={settings.evolution_api_key || ''} onChange={(e) => setSettings({ ...settings, evolution_api_key: e.target.value })}
                  placeholder="sua-api-key-aqui" className={`${inputClass} pr-10 focus:ring-cyan-500/50`} />
                <button type="button" onClick={() => setShowEvolutionKey(!showEvolutionKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showEvolutionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Instance Name <span className="text-red-400">*</span></label>
              <input type="text" value={settings.evolution_instance || ''} onChange={(e) => setSettings({ ...settings, evolution_instance: e.target.value })}
                placeholder="nome-da-instancia" className={`${inputClass} focus:ring-cyan-500/50`} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <Button onClick={handleTestEvolution} disabled={testingEvolution || !settings.evolution_api_url || !settings.evolution_api_key} variant="ghost" className="text-cyan-400 hover:text-cyan-300 border border-cyan-500/30">
            {testingEvolution ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando...</> : <><Wifi className="w-4 h-4 mr-2" />Testar Conexão</>}
          </Button>
          <Button onClick={handleConfigureWebhook} disabled={configuringWebhook || !evolutionConfigured} variant="ghost" className="text-emerald-400 hover:text-emerald-300 border border-emerald-500/30">
            {configuringWebhook ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Configurando...</> : <><RefreshCw className="w-4 h-4 mr-2" />Configurar Webhook</>}
          </Button>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
          <p className="text-xs text-slate-500 mb-2">URL do Webhook:</p>
          <div className="flex gap-2">
            <input type="text" value={webhookUrl} readOnly className="h-8 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-400 font-mono" />
            <Button variant="ghost" size="sm" onClick={copyWebhookUrl} className="px-3 h-8">
              {copiedWebhook ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* ── ELEVENLABS ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mic className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-white">ElevenLabs (Text-to-Speech)</h3>
          </div>
          {statusBadge(elevenlabsConfigured)}
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">API Key</label>
            <div className="relative">
              <input type={showElevenLabsKey ? 'text' : 'password'} value={settings.elevenlabs_api_key || ''} onChange={(e) => setSettings({ ...settings, elevenlabs_api_key: e.target.value })} onBlur={handleElevenLabsKeyBlur}
                placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxx" className={`${inputClass} pr-10 focus:ring-violet-500/50`} />
              <button type="button" onClick={() => setShowElevenLabsKey(!showElevenLabsKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showElevenLabsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Voz</label>
              <select value={settings.elevenlabs_voice_id} onChange={(e) => setSettings({ ...settings, elevenlabs_voice_id: e.target.value })} className={`${inputClass} focus:ring-violet-500/50`}>
                {VOICE_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.name} - {v.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Modelo</label>
              <select value={settings.elevenlabs_model || 'eleven_turbo_v2_5'} onChange={(e) => setSettings({ ...settings, elevenlabs_model: e.target.value })} className={`${inputClass} focus:ring-violet-500/50`}>
                {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1"><Volume2 className="w-4 h-4 text-violet-400" /><span className="text-sm font-medium text-white">Respostas em Áudio</span></div>
                <p className="text-xs text-slate-400">Quando ativado, o agente responderá com áudios em vez de texto</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.audio_response_enabled} onChange={(e) => setSettings({ ...settings, audio_response_enabled: e.target.checked })} disabled={!elevenlabsConfigured} className="sr-only peer" />
                <div className={`w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500 ${!elevenlabsConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              </label>
            </div>
            {!elevenlabsConfigured && <p className="text-xs text-amber-400 mt-2">⚠️ Configure a API Key da ElevenLabs para habilitar respostas em áudio</p>}
          </div>
          <Collapsible.Root open={advancedVoiceOpen} onOpenChange={setAdvancedVoiceOpen}>
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${advancedVoiceOpen ? 'rotate-180' : ''}`} />Configurações Avançadas de Voz
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[{l:'Stability',k:'elevenlabs_stability' as const,min:0,max:1,s:0.05},{l:'Similarity',k:'elevenlabs_similarity_boost' as const,min:0,max:1,s:0.05},{l:'Style',k:'elevenlabs_style' as const,min:0,max:1,s:0.05},{l:'Speed',k:'elevenlabs_speed' as const,min:0.5,max:2,s:0.1}].map(({l,k,min,max,s}) => (
                  <div key={k}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs text-slate-400">{l}</label>
                      <span className="text-xs font-mono text-slate-300">{(settings[k] as number)?.toFixed(k==='elevenlabs_speed'?1:2)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={s} value={(settings[k] as number)||min} onChange={(e)=>setSettings({...settings,[k]:parseFloat(e.target.value)})} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"/>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.elevenlabs_speaker_boost} onChange={(e)=>setSettings({...settings,elevenlabs_speaker_boost:e.target.checked})} className="sr-only peer"/>
                  <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-500"></div>
                </label>
                <span className="text-sm text-slate-300">Speaker Boost</span>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={audioTestOpen} onOpenChange={setAudioTestOpen}>
            <Collapsible.Trigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${audioTestOpen?'rotate-180':''}`}/><Volume2 className="w-4 h-4"/>Testar Áudio
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Texto para converter em áudio</label>
                <textarea value={audioTestText} onChange={(e)=>setAudioTestText(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"/>
                <p className="text-xs text-slate-500 mt-1">{audioTestText.length}/1000</p>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleGenerateAudio} disabled={audioGenerating||!settings.elevenlabs_api_key} className="bg-violet-600 hover:bg-violet-700">
                  {audioGenerating?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Gerando...</>:<><Volume2 className="w-4 h-4 mr-2"/>Gerar e Ouvir</>}
                </Button>
                {audioUrl&&<Button onClick={()=>{const a=document.createElement('a');a.href=audioUrl;a.download='test.mp3';a.click();}} variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200"><Download className="w-4 h-4 mr-1"/>Baixar</Button>}
              </div>
              {audioUrl&&<div className="space-y-2"><audio ref={audioRef} src={audioUrl} controls className="w-full h-10" autoPlay/>{audioStats&&<p className="text-xs text-slate-500">✅ {(audioStats.duration_ms/1000).toFixed(1)}s • {audioStats.size_kb}KB</p>}</div>}
            </Collapsible.Content>
          </Collapsible.Root>
        </div>
      </div>

      {/* ── GOOGLE CALENDAR ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
            <h3 className="font-semibold text-white">Google Calendar</h3>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${gcalStatus.status==='connected'?'bg-emerald-500/10 text-emerald-400':gcalStatus.status==='error'?'bg-red-500/10 text-red-400':gcalConfigured?'bg-emerald-500/10 text-emerald-400':'bg-amber-500/10 text-amber-400'}`}>
            <span className={`h-2 w-2 rounded-full ${gcalStatus.status==='connected'?'bg-emerald-500':gcalStatus.status==='error'?'bg-red-500':gcalConfigured?'bg-emerald-500':'bg-amber-500'}`}></span>
            {gcalStatus.status==='connected'?'Conectado':gcalStatus.status==='error'?'Erro':gcalConfigured?'Configurado':'Aguardando'}
          </div>
        </div>
        {gcalStatus.status==='error'&&gcalStatus.message&&<div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300"><strong>Erro:</strong> {gcalStatus.message}</div>}
        {gcalStatus.status==='connected'&&gcalStatus.message&&<div className="mb-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">✅ {gcalStatus.message}</div>}
        <details className="mb-4">
          <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 flex items-center gap-2 py-2">
            <HelpCircle className="w-4 h-4"/>Como obter as credenciais do Google Calendar?
          </summary>
          <div className="mt-2 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
              <li>Acesse o <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a></li>
              <li>Crie um projeto e ative a <strong className="text-white">Google Calendar API</strong></li>
              <li>Configure uma tela de consentimento OAuth e crie credenciais OAuth 2.0</li>
              <li>Use o <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OAuth Playground</a> para gerar o Refresh Token</li>
              <li>Copie o Calendar ID da agenda (Configurações → Integrar agenda)</li>
            </ol>
          </div>
        </details>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {[{l:'Client ID',k:'google_client_id' as const,p:'xxxxx.apps.googleusercontent.com',t:'text',show:false,setShow:()=>{}},{l:'Client Secret',k:'google_client_secret' as const,p:'GOCSPX-...',t:'password',show:showGoogleSecret,setShow:setShowGoogleSecret},{l:'Refresh Token',k:'google_refresh_token' as const,p:'1//0xxxxxxx...',t:'password',show:showGoogleRefresh,setShow:setShowGoogleRefresh},{l:'Calendar ID',k:'google_calendar_id' as const,p:'empresa@group.calendar.google.com',t:'text',show:false,setShow:()=>{}}].map(({l,k,p,t,show,setShow})=>(
            <div key={k}>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">{l}</label>
              <div className="relative">
                <input type={t==='password'?(show?'text':'password'):t} value={(settings[k] as string)||''} onChange={(e)=>setSettings({...settings,[k]:e.target.value})} placeholder={p} className={`${inputClass} ${t==='password'?'pr-10':''} focus:ring-blue-500/50`}/>
                {t==='password'&&<button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">{show?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Duração Padrão da Visita</label>
            <select value={settings.default_visit_duration} onChange={(e)=>setSettings({...settings,default_visit_duration:parseInt(e.target.value)})} className={`${inputClass} focus:ring-blue-500/50`}>
              <option value={60}>60 minutos</option><option value={90}>90 minutos (Padrão)</option><option value={120}>120 minutos</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Horários Disponíveis</label>
            <div className="flex flex-wrap gap-1.5">{settings.available_time_slots.map((s,i)=><span key={i} className="px-2 py-1 bg-blue-500/10 text-blue-300 text-xs rounded-md border border-blue-500/20">{s}</span>)}</div>
          </div>
        </div>
        {gcalConfigured&&<Button onClick={handleTestGoogleCalendar} disabled={testingGcal} variant="ghost" className="text-blue-400 hover:text-blue-300 border border-blue-500/30">
          {testingGcal?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Testando...</>:<><Check className="w-4 h-4 mr-2"/>Testar Conexão</>}
        </Button>}
      </div>

      {/* ── TESTE DE ENVIO ── */}
      <Collapsible.Root open={testSectionOpen} onOpenChange={setTestSectionOpen}>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full">
            <Send className="w-4 h-4"/><span>Teste de Envio</span>
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${testSectionOpen?'rotate-180':''}`}/>
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Telefone</label>
                <input type="tel" value={testPhone} onChange={(e)=>setTestPhone(e.target.value)} placeholder="+5511999999999" className={`${inputClass} focus:ring-cyan-500/50`}/>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Mensagem</label>
                <input type="text" value={testMessage} onChange={(e)=>setTestMessage(e.target.value)} placeholder="Mensagem de teste..." className={`${inputClass} focus:ring-cyan-500/50`}/>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleTestMessage} disabled={testSending} className="shadow-lg shadow-cyan-500/20">
                {testSending?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Enviando...</>:<><Send className="w-4 h-4 mr-2"/>Enviar Teste</>}
              </Button>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* ── FERRAMENTAS AVANÇADAS ── */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-400 flex items-center gap-2 py-2">
          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180"/>Ferramentas Avançadas de Teste
        </summary>
        <div className="mt-2">
          <Collapsible.Root open={audioSimulateOpen} onOpenChange={setAudioSimulateOpen}>
            <div className="rounded-xl border border-amber-500/20 bg-slate-900/50 p-6">
              <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full">
                <FileAudio className="w-4 h-4 text-amber-400"/><span>Simular Recebimento de Áudio</span>
                <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${audioSimulateOpen?'rotate-180':''}`}/>
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-4 space-y-4">
                <p className="text-xs text-slate-400">Simula o recebimento de um áudio pelo WhatsApp. O áudio será transcrito e processado pela IA.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Telefone do Contato *</label>
                    <input type="tel" value={audioSimulatePhone} onChange={(e)=>setAudioSimulatePhone(e.target.value)} placeholder="5511999999999" className={`${inputClass} focus:ring-amber-500/50`}/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome do Contato (opcional)</label>
                    <input type="text" value={audioSimulateName} onChange={(e)=>setAudioSimulateName(e.target.value)} placeholder="João da Silva" className={`${inputClass} focus:ring-amber-500/50`}/>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Arquivo de Áudio *</label>
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${audioFile?'border-amber-500/50 bg-amber-500/5':'border-slate-700 hover:border-slate-600 bg-slate-950/50'}`} onClick={()=>audioFileInputRef.current?.click()}>
                    <input ref={audioFileInputRef} type="file" accept=".ogg,.mp3,.wav,.m4a,.webm,audio/*" onChange={handleAudioFileChange} className="hidden"/>
                    {audioFile?(
                      <div className="flex items-center justify-center gap-2">
                        <FileAudio className="w-5 h-5 text-amber-400"/>
                        <div className="text-left"><p className="text-sm text-slate-200">{audioFile.name}</p><p className="text-xs text-slate-500">{(audioFile.size/1024).toFixed(1)} KB</p></div>
                        <button type="button" onClick={(e)=>{e.stopPropagation();setAudioFile(null);setAudioSimulateResult(null);}} className="ml-2 text-slate-500 hover:text-slate-300">✕</button>
                      </div>
                    ):(
                      <div><Upload className="w-8 h-8 mx-auto text-slate-500 mb-2"/><p className="text-sm text-slate-400">Clique ou arraste um arquivo de áudio</p><p className="text-xs text-slate-600 mt-1">.ogg, .mp3, .wav, .m4a, .webm (máx 10MB)</p></div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSimulateAudioWebhook} disabled={audioSimulating||!audioFile||!audioSimulatePhone.trim()} className="bg-amber-600 hover:bg-amber-700">
                    {audioSimulating?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Processando...</>:<><FileAudio className="w-4 h-4 mr-2"/>Simular Áudio Recebido</>}
                  </Button>
                </div>
                {audioSimulateResult&&(
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400"><Check className="w-4 h-4"/><span className="text-sm font-medium">Áudio processado com sucesso!</span></div>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-slate-400">Transcrição:</span><p className="text-slate-200 mt-1 p-2 bg-slate-950/50 rounded border border-slate-800">"{audioSimulateResult.transcription}"</p></div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-500">Contact ID:</span><p className="text-slate-300 font-mono">{audioSimulateResult.contact_id.slice(0,8)}...</p></div>
                        <div><span className="text-slate-500">Conversation:</span><p className="text-slate-300 font-mono">{audioSimulateResult.conversation_id.slice(0,8)}...</p></div>
                        <div><span className="text-slate-500">Message ID:</span><p className="text-slate-300 font-mono">{audioSimulateResult.message_id.slice(0,8)}...</p></div>
                        <div><span className="text-slate-500">Nina:</span><p className={audioSimulateResult.queued_for_nina?'text-emerald-400':'text-amber-400'}>{audioSimulateResult.queued_for_nina?'✅ Processando':'⏸️ Não enfileirado'}</p></div>
                      </div>
                    </div>
                  </div>
                )}
              </Collapsible.Content>
            </div>
          </Collapsible.Root>
        </div>
      </details>
    </div>
  );
});

ApiSettings.displayName = 'ApiSettings';
export default ApiSettings;
