import React, { useEffect, useState, useCallback } from 'react';
import { Users, AlertTriangle } from 'lucide-react';

interface ExecTask {
  id: number; title: string; stage: string; owner: string;
  status: string; status_cn: string; deadline: string; priority: string;
  overdue: boolean; next_step: string; ai_note: string;
}
interface ExecData {
  progress: { total: number; done: number; in_progress: number; submitted: number; pending: number; overdue: number; rate: number };
  tasks: ExecTask[];
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-zinc-100 text-zinc-500',
  in_progress: 'bg-blue-50 text-blue-600',
  submitted: 'bg-amber-50 text-amber-700',
  revision: 'bg-orange-50 text-orange-700',
  done: 'bg-green-50 text-green-700',
};

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
          <Stat n={pg.pending} label="待办" />
          <Stat n={pg.in_progress} label="进行中" color="blue" />
          <Stat n={pg.submitted} label="待初审" color="amber" />
          <Stat n={pg.done} label="已完成" color="green" />
          {pg.overdue > 0 && <Stat n={pg.overdue} label="已延期" color="red" />}
        </div>
      </div>

      {/* 逐条任务：谁在做、什么状态、截止、诺亚判断 */}
      <div className="space-y-2">
        {data.tasks.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${t.overdue ? 'border-red-200 bg-red-50/40' : 'border-zinc-100 hover:bg-zinc-50'}`}>
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
            </div>
            <div className="text-right shrink-0">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[t.status] || 'bg-zinc-100 text-zinc-500'}`}>{t.status_cn}</span>
              <div className={`text-[11px] mt-1 flex items-center justify-end ${t.overdue ? 'text-red-500 font-medium' : 'text-zinc-400'}`}>
                {t.overdue && <AlertTriangle size={11} className="mr-1" />}
                {t.overdue ? '已延期 · ' : ''}{t.deadline || '—'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
