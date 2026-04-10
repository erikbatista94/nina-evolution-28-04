import React from 'react';

export const ChatListSkeleton: React.FC = () => (
  <div className="flex flex-col">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center p-4 border-b border-slate-800/30 animate-pulse">
        <div className="w-12 h-12 rounded-full bg-slate-800" />
        <div className="ml-3 flex-1 space-y-2">
          <div className="flex justify-between">
            <div className="h-3.5 w-28 bg-slate-800 rounded" />
            <div className="h-3 w-10 bg-slate-800 rounded" />
          </div>
          <div className="h-3 w-44 bg-slate-800/60 rounded" />
          <div className="flex gap-1.5">
            <div className="h-4 w-14 bg-slate-800/50 rounded-md" />
            <div className="h-4 w-16 bg-slate-800/50 rounded-md" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const KanbanColumnSkeleton: React.FC = () => (
  <div className="flex gap-4 min-w-max h-full">
    {Array.from({ length: 5 }).map((_, col) => (
      <div key={col} className="w-72 flex flex-col h-full rounded-xl border border-slate-800/50 bg-slate-900/30 animate-pulse">
        <div className="p-3 border-b border-slate-800/50 space-y-2">
          <div className="flex justify-between items-center">
            <div className="h-3 w-20 bg-slate-800 rounded" />
            <div className="h-4 w-6 bg-slate-800 rounded-full" />
          </div>
          <div className="h-2.5 w-24 bg-slate-800/60 rounded" />
        </div>
        <div className="p-2 space-y-2 flex-1">
          {Array.from({ length: 3 - (col % 2) }).map((_, card) => (
            <div key={card} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-10 bg-slate-800 rounded" />
                <div className="h-3 w-12 bg-slate-800 rounded" />
              </div>
              <div className="h-3.5 w-32 bg-slate-800 rounded" />
              <div className="h-2.5 w-20 bg-slate-800/50 rounded" />
              <div className="flex gap-1.5">
                <div className="h-4 w-16 bg-slate-800/40 rounded" />
                <div className="h-4 w-12 bg-slate-800/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const ContactsTableSkeleton: React.FC = () => (
  <div className="overflow-hidden">
    <div className="bg-slate-900/80 border-b border-slate-800 px-5 py-3">
      <div className="flex gap-8">
        {['w-28', 'w-16', 'w-32', 'w-16', 'w-12', 'w-14', 'w-20', 'w-8'].map((w, i) => (
          <div key={i} className={`h-3 ${w} bg-slate-800 rounded animate-pulse`} />
        ))}
      </div>
    </div>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-8 px-5 py-3.5 border-b border-slate-800/50 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-800" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 bg-slate-800 rounded" />
            <div className="h-2.5 w-20 bg-slate-800/60 rounded" />
          </div>
        </div>
        <div className="h-3 w-16 bg-slate-800/50 rounded" />
        <div className="flex gap-1">
          <div className="h-4 w-12 bg-slate-800/40 rounded" />
          <div className="h-4 w-14 bg-slate-800/40 rounded" />
        </div>
        <div className="h-3 w-14 bg-slate-800/50 rounded" />
        <div className="h-4 w-10 bg-slate-800/40 rounded" />
        <div className="h-4 w-14 bg-slate-800/40 rounded" />
        <div className="h-3 w-16 bg-slate-800/50 rounded" />
        <div className="h-6 w-6 bg-slate-800/40 rounded" />
      </div>
    ))}
  </div>
);
