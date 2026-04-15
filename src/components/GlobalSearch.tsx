import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, User, MessageSquare, Briefcase, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  type: 'contact' | 'conversation' | 'deal';
  id: string;
  title: string;
  subtitle: string;
  navigateTo: string;
}

const GlobalSearch: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const term = `%${q}%`;
      const [contactsRes, dealsRes, convsRes] = await Promise.all([
        supabase.from('contacts').select('id, name, phone_number, city, lead_temperature').ilike('name', term).limit(5),
        supabase.from('deals').select('id, title, company, value, contact_id').ilike('title', term).limit(5),
        supabase.from('conversations').select('id, contact_id, contacts!inner(name, phone_number)').or(`contacts.name.ilike.${term},contacts.phone_number.ilike.${term}`).limit(5),
      ]);

      const items: SearchResult[] = [];

      (contactsRes.data || []).forEach(c => {
        items.push({
          type: 'contact',
          id: c.id,
          title: c.name || c.phone_number,
          subtitle: [c.city, c.lead_temperature].filter(Boolean).join(' · ') || c.phone_number,
          navigateTo: `/contacts`,
        });
      });

      (dealsRes.data || []).forEach(d => {
        items.push({
          type: 'deal',
          id: d.id,
          title: d.title,
          subtitle: `${d.company} · R$ ${(d.value || 0).toLocaleString('pt-BR')}`,
          navigateTo: `/pipeline`,
        });
      });

      // Also search contacts by phone
      if (/\d/.test(q)) {
        const phoneRes = await supabase.from('contacts').select('id, name, phone_number, city').ilike('phone_number', term).limit(3);
        (phoneRes.data || []).forEach(c => {
          if (!items.find(i => i.id === c.id)) {
            items.push({
              type: 'contact',
              id: c.id,
              title: c.name || c.phone_number,
              subtitle: c.phone_number,
              navigateTo: `/contacts`,
            });
          }
        });
      }

      setResults(items);
      setSelectedIdx(0);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    navigate(result.navigateTo);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  };

  const iconMap = {
    contact: <User className="w-4 h-4 text-cyan-400" />,
    conversation: <MessageSquare className="w-4 h-4 text-emerald-400" />,
    deal: <Briefcase className="w-4 h-4 text-amber-400" />,
  };

  const typeLabel = {
    contact: 'Contato',
    conversation: 'Conversa',
    deal: 'Negócio',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar contatos, negócios..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          <kbd className="hidden sm:inline-flex text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {results.length === 0 && query.length >= 2 && !loading && (
            <div className="p-6 text-center text-sm text-slate-500">Nenhum resultado encontrado</div>
          )}
          {results.length === 0 && query.length < 2 && (
            <div className="p-6 text-center text-sm text-slate-500">
              Digite pelo menos 2 caracteres para buscar
            </div>
          )}
          {results.map((r, idx) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                idx === selectedIdx ? 'bg-slate-800' : 'hover:bg-slate-800/50'
              }`}
            >
              {iconMap[r.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{r.title}</p>
                <p className="text-[11px] text-slate-500 truncate">{r.subtitle}</p>
              </div>
              <span className="text-[10px] text-slate-600 border border-slate-700 rounded px-1.5 py-0.5">
                {typeLabel[r.type]}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-4 text-[10px] text-slate-600">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
