import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle, Zap, ChevronUp, ChevronDown } from 'lucide-react';

const STAGE_OPTS = ['前期', '中期', '后期', '交付'];

interface Row {
  id: number; title: string; stage: string; assignee: string;
  start_date: string; deadline: string; priority: string; status: string;
  deliverable: string; depends_on: number | null; overdue: boolean;
}

const STATUS_OPTS: [string, string][] = [
  ['pending', '待办'], ['in_progress', '进行中'], ['submitted', '待初审'],
  ['revision', '退回修改'], ['done', '已完成'], ['delayed', '已延期'],
];
const PRIORITY_OPTS = ['高', '中', '低'];

export function ScheduleEditor({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const fetchRows = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/task-schedule?t=${Date.now()}`);
      if (r.ok) setRows((await r.json()).tasks);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  // 本地即时更新 + 后端保存；日期/依赖变化会触发自动重排，保存后整体刷新
  const save = async (id: number, patch: Partial<Row>, refetch = false) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const j = await res.json();
      const shifted = j?.result?.shifted || [];
      if (shifted.length) { flash(`已自动顺延 ${shifted.length} 个下游任务`); refetch = true; }
      if (refetch) await fetchRows();
    } catch { /* ignore */ }
  };

  const addRow = async () => {
    setLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新任务', stage: '后期', priority: '中' }),
      });
      await fetchRows();
    } finally { setLoading(false); }
  };

  const delRow = async (id: number) => {
    if (!window.confirm('删除该任务？依赖它的任务会自动改挂到它的前置。')) return;
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    await fetchRows();
  };
  const move = async (id: number, direction: 'up' | 'down') => {
    await fetch(`/api/tasks/${id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }) });
    await fetchRows();
  };

  const titleById = (id: number | null) => rows.find(r => r.id === id)?.title || '无';

  return (
    <div className="animate-in fade-in duration-300">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center">
          <Zap size={16} className="mr-2" />{toast}
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500">改开始/结束日期或依赖，诺亚会自动顺延受影响的下游任务；关键字段实时保存。</p>
        <button onClick={addRow} disabled={loading}
          className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center disabled:opacity-60">
          {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Plus size={14} className="mr-1.5" />}新增任务
        </button>
      </div>

      <div className="overflow-x-auto border border-zinc-200 rounded-xl">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-zinc-50 text-zinc-500 text-xs">
            <tr>
              {['任务', '阶段', '负责人', '开始', '结束', '优先级', '状态', '前置依赖', ''].map(h => (
                <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(r => (
              <tr key={r.id} className={r.overdue ? 'bg-red-50/40' : 'hover:bg-zinc-50'}>
                <td className="px-3 py-2 min-w-[160px]">
                  <input value={r.title} onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, title: e.target.value } : x))}
                    onBlur={e => save(r.id, { title: e.target.value })}
                    className="w-full bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 rounded px-1.5 py-1 outline-none" />
                </td>
                <td className="px-3 py-2">
                  <select value={r.stage || '前期'} onChange={(e) => save(r.id, { stage: e.target.value })}
                    className="bg-transparent border border-zinc-200 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-400">
                    {[...new Set([...STAGE_OPTS, r.stage].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 min-w-[90px]">
                  <input value={r.assignee} onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, assignee: e.target.value } : x))}
                    onBlur={e => save(r.id, { assignee: e.target.value })}
                    className="w-20 bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 rounded px-1.5 py-1 outline-none" />
                </td>
                <td className="px-3 py-2">
                  <input type="date" value={r.start_date}
                    onChange={e => save(r.id, { start_date: e.target.value })}
                    className="bg-transparent border border-zinc-200 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-400" />
                </td>
                <td className="px-3 py-2">
                  <input type="date" value={r.deadline}
                    onChange={e => save(r.id, { deadline: e.target.value })}
                    className={`bg-transparent border rounded px-1.5 py-1 text-xs outline-none focus:border-blue-400 ${r.overdue ? 'border-red-300 text-red-600' : 'border-zinc-200'}`} />
                  {r.overdue && <AlertTriangle size={12} className="inline ml-1 text-red-500" />}
                </td>
                <td className="px-3 py-2">
                  <select value={r.priority} onChange={e => save(r.id, { priority: e.target.value })}
                    className="bg-transparent border border-zinc-200 rounded px-1.5 py-1 outline-none focus:border-blue-400">
                    {PRIORITY_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select value={r.status} onChange={e => save(r.id, { status: e.target.value })}
                    className="bg-transparent border border-zinc-200 rounded px-1.5 py-1 outline-none focus:border-blue-400">
                    {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select value={r.depends_on ?? ''} onChange={e => save(r.id, { depends_on: e.target.value ? Number(e.target.value) : null }, true)}
                    title={titleById(r.depends_on)}
                    className="max-w-[130px] bg-transparent border border-zinc-200 rounded px-1.5 py-1 outline-none focus:border-blue-400 truncate">
                    <option value="">无</option>
                    {rows.filter(x => x.id !== r.id).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => move(r.id, 'up')} title="上移" className="text-zinc-400 hover:text-zinc-700 p-1 rounded hover:bg-zinc-100"><ChevronUp size={14} /></button>
                    <button onClick={() => move(r.id, 'down')} title="下移" className="text-zinc-400 hover:text-zinc-700 p-1 rounded hover:bg-zinc-100"><ChevronDown size={14} /></button>
                    <button onClick={() => delRow(r.id)} title="删除" className="text-zinc-400 hover:text-red-500 p-1 rounded hover:bg-red-50"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-400">还没有排期任务，先生成报价+排期，或点「新增任务」。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
