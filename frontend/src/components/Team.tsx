import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Crown, Trash2, UserPlus, Users, Plus, X } from 'lucide-react';
import { cn } from '../utils';

interface Member { id: number; name: string; role: string; stage: string; is_pm: boolean; }
interface Group { id: number; name: string; members: string; purpose: string; }

const STAGES = ['全程', '前期', '拍摄', '后期'];
const stageColor: Record<string, string> = { 全程: 'text-zinc-600 bg-zinc-100', 前期: 'text-blue-600 bg-blue-50', 拍摄: 'text-purple-600 bg-purple-50', 后期: 'text-emerald-600 bg-emerald-50' };

export function Team() {
  const { currentProjectId } = useStore();
  const pid = currentProjectId;
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [add, setAdd] = useState({ name: '', role: '', stage: '拍摄' });
  const [grp, setGrp] = useState<{ open: boolean; name: string; purpose: string; sel: Record<string, boolean> }>({ open: false, name: '', purpose: '', sel: {} });

  const fetchTeam = useCallback(async () => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/projects/${pid}/team?t=${Date.now()}`);
      if (res.ok) { const d = await res.json(); setMembers(d.members || []); setGroups(d.groups || []); }
    } catch { /* ignore */ }
  }, [pid]);

  useEffect(() => { fetchTeam(); const id = setInterval(fetchTeam, 4000); return () => clearInterval(id); }, [fetchTeam]);

  const addMember = async () => {
    if (!add.name.trim() || !pid) return;
    await fetch(`/api/projects/${pid}/team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(add) });
    setAdd({ name: '', role: '', stage: add.stage }); fetchTeam();
  };
  const patch = async (id: number, body: any) => { await fetch(`/api/projects/${pid}/team/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); fetchTeam(); };
  const remove = async (id: number) => { await fetch(`/api/projects/${pid}/team/${id}`, { method: 'DELETE' }); fetchTeam(); };
  const createGroup = async () => {
    const sel = Object.keys(grp.sel).filter((k) => grp.sel[k]);
    if (!grp.name.trim() || sel.length === 0) return;
    await fetch(`/api/projects/${pid}/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: grp.name, members: sel.join('、'), purpose: grp.purpose }) });
    setGrp({ open: false, name: '', purpose: '', sel: {} }); fetchTeam();
  };
  const delGroup = async (id: number) => { await fetch(`/api/projects/${pid}/groups/${id}`, { method: 'DELETE' }); fetchTeam(); };

  if (!pid) return <div className="flex-1 flex items-center justify-center text-zinc-400">请选择一个项目</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-zinc-900">项目团队</h2>
        <p className="text-zinc-500 mt-1.5">按阶段配置人员，可增减、指定项目经理；项目经理可"拉群"协调跨阶段沟通。</p>
      </div>

      {/* 添加成员 */}
      <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 mb-6 flex flex-wrap items-center gap-2 text-sm">
        <UserPlus size={16} className="text-blue-600" />
        <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="姓名"
          className="w-24 px-2 py-1 border border-zinc-200 rounded-lg outline-none focus:border-blue-400" />
        <input value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} placeholder="角色（如 摄影助理）"
          className="w-40 px-2 py-1 border border-zinc-200 rounded-lg outline-none focus:border-blue-400" />
        <select value={add.stage} onChange={(e) => setAdd({ ...add, stage: e.target.value })}
          className="px-2 py-1 border border-zinc-200 rounded-lg bg-white outline-none">{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        <button onClick={addMember} className="px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">添加成员</button>
      </div>

      {/* 按阶段分组 */}
      <div className="space-y-5">
        {STAGES.map((stage) => {
          const list = members.filter((m) => m.stage === stage);
          if (list.length === 0) return null;
          return (
            <div key={stage}>
              <h3 className="text-sm font-semibold text-zinc-500 mb-2 flex items-center">
                <span className={cn('text-xs px-2 py-0.5 rounded mr-2', stageColor[stage])}>{stage}</span>{list.length} 人
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {list.map((m) => (
                  <div key={m.id} className={cn('bg-white rounded-xl border p-4 flex items-center justify-between', m.is_pm ? 'border-amber-200' : 'border-zinc-200')}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white font-medium shrink-0', m.is_pm ? 'bg-amber-500' : 'bg-zinc-400')}>{m.name.slice(0, 1)}</div>
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 flex items-center">{m.name}{m.is_pm && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded inline-flex items-center"><Crown size={11} className="mr-0.5" />项目经理</span>}</p>
                        <p className="text-xs text-zinc-500 truncate">{m.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!m.is_pm && <button onClick={() => patch(m.id, { is_pm: true })} title="设为项目经理" className="p-1.5 rounded text-zinc-300 hover:text-amber-500 hover:bg-amber-50"><Crown size={15} /></button>}
                      <button onClick={() => remove(m.id)} title="移出项目" className="p-1.5 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 拉群 */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-500 flex items-center"><Users size={15} className="mr-1.5" />协作群组（项目经理拉群）</h3>
          <button onClick={() => setGrp({ ...grp, open: !grp.open })} className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center"><Plus size={14} className="mr-1" />拉群</button>
        </div>

        {grp.open && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-3">
            <div className="flex gap-2 mb-3">
              <input value={grp.name} onChange={(e) => setGrp({ ...grp, name: e.target.value })} placeholder="群名称（如 拍摄执行组）" className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm outline-none focus:border-blue-400" />
              <input value={grp.purpose} onChange={(e) => setGrp({ ...grp, purpose: e.target.value })} placeholder="用途（如 对接导演与前期制片）" className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            </div>
            <p className="text-xs text-zinc-400 mb-2">选择成员：</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {members.map((m) => (
                <button key={m.id} onClick={() => setGrp({ ...grp, sel: { ...grp.sel, [m.name]: !grp.sel[m.name] } })}
                  className={cn('text-sm px-2.5 py-1 rounded-full border', grp.sel[m.name] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-600 border-zinc-200 hover:border-blue-300')}>
                  {m.name}<span className="opacity-60 ml-1">{m.role}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setGrp({ open: false, name: '', purpose: '', sel: {} })} className="px-3 py-1.5 text-sm text-zinc-500 rounded-lg hover:bg-zinc-100">取消</button>
              <button onClick={createGroup} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">建群</button>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <p className="text-sm text-zinc-400">还没有协作群组。项目经理可按需把跨阶段对接的人拉到一个群（如导演 + 前期制片）。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {groups.map((g) => (
              <div key={g.id} className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between">
                  <p className="font-medium text-zinc-900">{g.name}</p>
                  <button onClick={() => delGroup(g.id)} className="text-zinc-300 hover:text-red-500"><X size={15} /></button>
                </div>
                <p className="text-xs text-zinc-500 mt-1">成员：{g.members}</p>
                {g.purpose && <p className="text-xs text-zinc-400 mt-0.5">用途：{g.purpose}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
