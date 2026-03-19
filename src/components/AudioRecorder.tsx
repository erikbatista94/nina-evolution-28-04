import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';

interface AudioRecorderProps {
  onSend: (blob: Blob) => void;
  onCancel: () => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start(250);

        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      } catch {
        toast.error('Não foi possível acessar o microfone');
        onCancel();
      }
    };

    start();
    return () => { cancelled = true; stopStream(); };
  }, [onCancel, stopStream]);

  const handleCancel = () => {
    mediaRecorderRef.current?.stop();
    stopStream();
    onCancel();
  };

  const handleSend = async () => {
    if (sending) return;
    setSending(true);

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') { setSending(false); return; }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const finalMime = recorder.mimeType || 'audio/webm';
        resolve(new Blob(chunksRef.current, { type: finalMime }));
      };
      recorder.stop();
    });

    stopStream();

    try {
      onSend(blob);
    } catch (err: any) {
      console.error('Error sending audio:', err);
      toast.error(err.message || 'Erro ao enviar áudio');
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={handleCancel}
        className="w-10 h-10 flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div className="flex-1 flex items-center gap-3 bg-slate-950 rounded-2xl border border-destructive/30 px-4 py-3">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
        </span>

        <div className="flex items-center gap-0.5 h-6">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full bg-destructive/70"
              style={{
                height: `${Math.random() * 80 + 20}%`,
                animation: `waveform ${0.5 + Math.random() * 0.5}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.05}s`,
              }}
            />
          ))}
        </div>

        <span className="text-sm font-mono text-slate-300 ml-auto">{formatTime(seconds)}</span>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || seconds < 1}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Send className="w-5 h-5 ml-0.5" />
        )}
      </button>

      <style>{`
        @keyframes waveform {
          0% { height: 20%; }
          100% { height: 100%; }
        }
      `}</style>
    </div>
  );
};

export default AudioRecorder;
