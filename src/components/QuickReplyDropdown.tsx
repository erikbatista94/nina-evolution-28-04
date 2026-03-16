import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Zap } from 'lucide-react';

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
}

interface Props {
  query: string;
  onSelect: (content: string) => void;
  onClose: () => void;
  visible: boolean;
}

export const QuickReplyDropdown: React.FC<Props> = ({ query, onSelect, onClose, visible }) => {
  const { user } = useAuth();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Load when becoming visible
  useEffect(() => {
    if (!visible || !user) return;
    supabase
      .from('quick_replies')
      .select('*')
      .eq('user_id', user.id)
      .order('shortcut')
      .then(({ data }) => {
        setReplies((data || []) as QuickReply[]);
      });
  }, [visible, user]);

  const filtered = replies.filter(r => {
    const q = query.toLowerCase();
    return r.shortcut.toLowerCase().includes('/' + q) || r.title.toLowerCase().includes(q);
  });

  // Reset index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard events from parent textarea via event delegation
  useEffect(() => {
    if (!visible || filtered.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].content);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [visible, filtered, selectedIndex, onSelect, onClose]);

  // Scroll into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex + 1] as HTMLElement; // +1 for header
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50"
    >
      <div className="px-3 py-1.5 border-b border-slate-800 flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-amber-400" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mensagens rápidas</span>
      </div>
      {filtered.map((r, i) => (
        <button
          key={r.id}
          className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
            i === selectedIndex ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-slate-800'
          }`}
          onMouseEnter={() => setSelectedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(r.content);
          }}
        >
          <code className="text-xs font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">{r.shortcut}</code>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium block truncate">{r.title}</span>
            <span className="text-[11px] text-muted-foreground block truncate">{r.content}</span>
          </div>
        </button>
      ))}
    </div>
  );
};
