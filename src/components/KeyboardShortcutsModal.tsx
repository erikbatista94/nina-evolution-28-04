import React, { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

const shortcuts = [
  { keys: ['Enter'], description: 'Enviar mensagem' },
  { keys: ['Shift', 'Enter'], description: 'Quebra de linha' },
  { keys: ['Esc'], description: 'Fechar modal/painel' },
  { keys: ['/'], description: 'Atalhos de resposta rápida' },
  { keys: ['?'], description: 'Abrir este painel de atalhos' },
];

const KeyboardShortcutsModal: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-white">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-lg">Atalhos de Teclado</h3>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-slate-300">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <span className="text-slate-600 text-xs">+</span>}
                    <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 font-mono min-w-[28px] text-center">
                      {k}
                    </kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-5 text-center">Pressione <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono">?</kbd> para abrir/fechar</p>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
