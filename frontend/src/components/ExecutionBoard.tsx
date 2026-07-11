import React, { useEffect, useState, useCallback } from 'react';
import { Users, AlertTriangle, Check, X, Download, FileCheck } from 'lucide-react';
import { displayStatus } from '../taskStatus';

interface ExecTask {
  id: number; title: string; stage: string; owner: string;
  status: string; status_cn: string; deadline: string; priority: string;
  overdue: boolean; next_step: string; ai_note: string;
  has_file: boolean; submission_filename: string; submitted_at: string; submitter: string;
}
interface ExecData {
  progress: { total: number; done: number; in_progress: number; submitted: number; pending: number; overdue: number; rate: number };
  tasks: ExecTask[];
}

const STAT_COLOR: Record<string, string> = {
  zinc: 'bg-zinc-100 text-zinc-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-600',
};
const Stat = ({ n, label, color = 'zinc' }: { n: number; label: string; color?: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md ${STAT_COLOR[color]}`}>
    <b className="mr-1">{n}</b>{label}
  </span>
);

export function ExecutionBoard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ExecData | null>(null);

  const fetchExec = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/execution?t=${Date.now()}`);
      if (r.ok) setData(await r.json());
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchExec();
    const id = setInterval(fetchExec, 5000);   // 执行端一动，Boss 端 5 秒内看到
    return () => clearInterval(id);
  }, [fetchExec]);

  const [busy, setBusy] = useState<number | null>(null);
  const approve = async (id: number) => {
    setBusy(id);
    try { await fetch(`/api/tasks/${id}/approve`, { method: 'POST' }); await fetchExec(); }
    finally { setBusy(null); }
  };
  const reject = async (id: number) => {
    const reason = window.prompt('退回该任务，请填写修改意见（必填）：', '');
    if (reason === null) return;
    if (!reason.trim()) { window.alert('退回必须填写修改意见'); return; }
    setBusy(id);
    try {
      await fetch(`/api/tasks/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: reason }) });
      await fetchExec();
    } finally { setBusy(null); }
  };

  if (!data || data.progress.total === 0) return null;
  const pg = data.progress;

  return (
    <div className="mb-8 bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-zinc-900 flex items-center">
          <Users size={18} className="mr-2 text-zinc-400" />执行动态 · 每个人在做什么
        </h3>
        <span className="text-xs text-zinc-400">诺亚实时跟踪 · 执行端提交后自动同步</span>
      </div>

      {/* 项目完成率 */}
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-zinc-600">项目完成率</span>
          <span className="font-semibold text-zinc-900">{pg.rate}%（{pg.done}/{pg.total}）</span>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${pg.rate}%` }} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          <Stat n={pg.pending} label="未开始" />
          <Stat n={pg.in_progress} label="进行中" color="blue" />
          <Stat n={pg.submitted} label="待审核" color="amber" />
          <Stat n={pg.done} label="已完成" color="green" />
          {pg.overdue > 0 && <Stat n={pg.overdue} label="已逾期" color="red" />}
        </div>
      </div>

      {/* 逐条任务：谁在做、什么状态（含逾期预警）、截止、Noah 判断、待审核可通过/退回 */}
      <div className="space-y-2">
        {data.tasks.map((t) => {
          const st = displayStatus(t.status, t.overdue);
          const reviewing = t.status === 'submitted';
          return (
            <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${t.overdue ? 'border-red-200 bg-red-50/40' : reviewing ? 'border-amber-200 bg-amber-50/30' : 'border-zinc-100 hover:bg-zinc-50'}`}>
              <div className="w-8 h-8 rounded-full bg-zinc-800 text-white text-[11px] flex items-center justify-center shrink-0">{t.owner.slice(-2)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-800 text-sm truncate">{t.title}</span>
                  {t.stage && <span className="text-[11px] text-zinc-400 shrink-0">{t.stage}</span>}
                  {t.priority === '高' && <span className="text-[10px] px-1.5 rounded bg-red-50 text-red-600 shrink-0">高优</span>}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5 truncate">
                  {t.owner} · {t.next_step}{t.ai_note ? ` · 诺亚: ${t.ai_note}` : ''}
                </div>
                {reviewing && (
                  <div className="text-xs text-amber-700 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{t.submitter || '张导'} 提交 {t.submitted_at}</span>
                    {t.has_file && <a href={`/api/tasks/${t.id}/submission`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><FileCheck size={12} />{t.submission_filename}<Download size={11} /></a>}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.style}`}>{st.label}</span>
                <div className={`text-[11px] mt-1 flex items-center justify-end ${t.overdue ? 'text-red-500 font-medium' : 'text-zinc-400'}`}>
                  {t.overdue && <AlertTriangle size={11} className="mr-1" />}
                  {t.deadline || '—'}
                </div>
              </div>
              {reviewing && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => approve(t.id)} disabled={busy === t.id} title="通过 → 已完成"
                    className="text-xs px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center disabled:opacity-60"><Check size={12} className="mr-0.5" />通过</button>
                  <button onClick={() => reject(t.id)} disabled={busy === t.id} title="退回 → 需修改"
                    className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center disabled:opacity-60"><X size={12} className="mr-0.5" />退回</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
