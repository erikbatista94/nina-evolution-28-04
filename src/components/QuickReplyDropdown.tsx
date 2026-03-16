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
  query: string; // the text after "/"
  onSelect: (content: string) => void;
  onClose: () => void;
  visible: boolean;
}

export const QuickReplyDropdown: React.FC<Props> = ({ query, onSelect, onClose, visible }) => {
  const { user } = useAuth();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [filtered, setFiltered] = useState<QuickReply[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Load once
  useEffect(() => {
    if (!user || loaded) return;
    supabase
      .from('quick_replies')
      .select('*')
      .eq('user_id', user.id)
      .order('shortcut')
      .then(({ data }) => {
        setReplies((data || []) as QuickReply[]);
        setLoaded(true);
      });
  }, [user, loaded]);

  // Refresh when becoming visible
  useEffect(() => {
    if (visible && user) {
      setLoaded(false);
    }
  }, [visible]);

  // Filter
  useEffect(() => {
    const q = query.toLowerCase();
    const f = replies.filter(r =>
      r.shortcut.toLowerCase().includes('/' + q) ||
      r.title.toLowerCase().includes(q)
    );
    setFiltered(f);
    setSelectedIndex(0);
  }, [query, replies]);

  // Keyboard navigation is handled by parent via onKeyDown

  useEffect(() => {
    // Scroll selected into view
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-4 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50"
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
            e.preventDefault(); // prevent blur
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

// Hook for parent to control keyboard nav
export function useQuickReplyNav(
  filteredCount: number,
  selectedIndex: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredCount - 1));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
      return true;
    }
    return false;
  };
  return handleKeyDown;
}
