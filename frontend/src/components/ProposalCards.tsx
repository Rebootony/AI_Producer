import React, { useEffect, useState, useCallback } from 'react';
import { AlertOctagon, Check, X, PlusCircle, Sparkles } from 'lucide-react';

interface Proposal {
  id: number; summary: string; conclusion: string; impact: string;
  option_a: string; option_b: string; option_c: string;
  recommend: string; decision: string; status: string;
}

export function ProposalCards({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const fetchProposals = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/proposals?only_pending=true&t=${Date.now()}`);
      if (r.ok) setItems((await r.json()).proposals);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchProposals();
    const id = setInterval(fetchProposals, 5000);  // 诺亚在对话里 raise_proposal 后，这里自动出现卡片
    return () => clearInterval(id);
  }, [fetchProposals]);

  const act = async (id: number, action: string, chosen = '') => {
    setBusy(id);
    try {
      await fetch(`/api/proposals/${id}/act`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, chosen }),
      });
      await fetchProposals();
    } finally { setBusy(null); }
  };

  if (items.length === 0) return null;

  return (
    <div className="mb-8 space-y-4">
      {items.map(p => {
        const rec = (p.recommend.match(/[ABC]/) || [''])[0];
        const opts: [string, string][] = [['A', p.option_a], ['B', p.option_b], ['C', p.option_c]];
        return (
          <div key={p.id} className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-amber-50 px-5 py-3 flex items-center gap-2 border-b border-amber-100">
              <AlertOctagon size={18} className="text-amber-600" />
              <span className="font-semibold text-amber-900">诺亚 · 待你拍板的决策</span>
            </div>
            <div className="p-5">
              <h4 className="font-semibold text-zinc-900 mb-2">{p.summary}</h4>
              {p.conclusion && <p className="text-sm text-zinc-600 mb-1"><b className="text-zinc-500 font-medium">当前结论：</b>{p.conclusion}</p>}
              {p.impact && <p className="text-sm text-zinc-600 mb-3"><b className="text-zinc-500 font-medium">影响判断：</b>{p.impact}</p>}

              <div className="space-y-2 mb-3">
                {opts.filter(([, t]) => t).map(([k, t]) => (
                  <div key={k} className={`flex items-start gap-3 p-3 rounded-xl border ${k === rec ? 'border-blue-300 bg-blue-50/50' : 'border-zinc-200 bg-zinc-50'}`}>
                    <div className="flex-1 text-sm text-zinc-700">
                      <span className="font-semibold text-zinc-900 mr-1.5">方案{k}</span>
                      {k === rec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white mr-1.5">诺亚推荐</span>}
                      {t}
                    </div>
                    <button onClick={() => act(p.id, 'confirm', k)} disabled={busy === p.id}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center disabled:opacity-60">
                      <Check size={13} className="mr-1" />按此执行
                    </button>
                  </div>
                ))}
              </div>

              {p.recommend && <p className="text-sm text-blue-700 mb-1"><b className="font-medium">诺亚推荐：</b>{p.recommend}</p>}
              {p.decision && <p className="text-sm text-zinc-600 mb-3"><b className="text-zinc-500 font-medium">需要你定：</b>{p.decision}</p>}

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                <button onClick={() => act(p.id, 'reject')} disabled={busy === p.id}
                  className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center disabled:opacity-60">
                  <X size={14} className="mr-1" />驳回
                </button>
                <button onClick={() => act(p.id, 'need_more')} disabled={busy === p.id}
                  className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center disabled:opacity-60">
                  <PlusCircle size={14} className="mr-1" />要求补充方案
                </button>
                <span className="ml-auto text-xs text-zinc-400 inline-flex items-center">
                  <Sparkles size={12} className="mr-1" />确认后诺亚自动下发执行指令
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
