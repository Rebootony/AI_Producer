import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Briefcase, TrendingUp, PieChart, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '../utils';

interface DashProject {
  id: string; name: string; client: string; industry: string; delivery_date: string;
  generated: boolean; client_price: number; cost_total: number; margin_rate: number;
  shoot_days: number; health: string;
}
interface DashData {
  projects: DashProject[]; count: number; total_client_price: number;
  total_cost: number; total_profit: number; risk_count: number;
}

const wan = (n: number) => (n / 10000).toFixed(1);

export function Dashboard() {
  const { setCurrentProject, currentUser } = useStore();
  const isBoss = currentUser?.role === 'boss';
  const [data, setData] = useState<DashData | null>(null);

  const fetchDash = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?t=${Date.now()}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchDash();
    const id = setInterval(fetchDash, 4000);
    return () => clearInterval(id);
  }, [fetchDash]);

  const projects = data?.projects || [];
  const totalPrice = data?.total_client_price || 0;
  const totalProfit = data?.total_profit || 0;
  const genCount = projects.filter(p => p.generated).length;

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-8">
      <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-900">全局项目大盘</h1>
          <p className="text-zinc-500 mt-2">项目经理诺亚为你统筹多个项目的报价、排期、进度与利润。</p>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-10">
          <Metric icon={<Briefcase size={20} />} color="blue" label="活跃项目总数"
            value={`${data?.count ?? '—'}`} tag={`${genCount} 已出报价`} />
          <Metric icon={<TrendingUp size={20} />} color="green" label="在管报价总额（实收）"
            value={isBoss ? `¥ ${wan(totalPrice)}w` : '🔒 仅老板'} />
          <Metric icon={<PieChart size={20} />} color="purple" label="预估总利润"
            value={isBoss ? `¥ ${wan(totalProfit)}w` : '🔒 仅老板'} />
          <Metric icon={<AlertTriangle size={20} />} color="orange" label="低毛利预警"
            value={isBoss ? `${data?.risk_count ?? 0}` : '🔒'} tag={isBoss && data && data.risk_count > 0 ? '需关注' : undefined} />
        </div>

        <div>
          <h2 className="text-xl font-bold text-zinc-900 mb-6">正在执行的项目</h2>
          <div className="grid grid-cols-2 gap-6">
            {projects.map((p) => {
              const costRatio = p.client_price > 0 ? (p.cost_total / p.client_price) * 100 : 0;
              return (
                <div key={p.id} onClick={() => setCurrentProject(p.id)}
                  className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">{p.name}</h3>
                      <p className="text-sm text-zinc-500 mt-1">{p.client} | {p.industry}</p>
                    </div>
                    <div className={cn("px-3 py-1 text-xs font-medium rounded-full",
                      !p.generated ? "bg-zinc-100 text-zinc-500" :
                      p.health === 'good' ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700")}>
                      {!p.generated ? '待生成' : p.health === 'good' ? '状态良好' : '低毛利'}
                    </div>
                  </div>

                  {isBoss && p.generated ? (
                    <div className="mt-6">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-500">成本占比（越低利润越高）</span>
                        <span className="font-medium text-zinc-700">{costRatio.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", costRatio > 85 ? "bg-orange-500" : "bg-blue-500")}
                          style={{ width: `${costRatio}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-6 text-sm text-zinc-400">
                      {!p.generated ? '尚未生成报价 · 点击进入' : '项目进行中 · 点击查看排期'}
                    </p>
                  )}

                  <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
                    <div className="flex space-x-5">
                      {isBoss && (
                        <>
                          <div className="text-sm">
                            <p className="text-zinc-500 text-xs mb-0.5">实收报价</p>
                            <p className="font-medium text-zinc-900">{p.generated ? `¥ ${wan(p.client_price)}w` : '—'}</p>
                          </div>
                          <div className="text-sm">
                            <p className="text-zinc-500 text-xs mb-0.5">利润率</p>
                            <p className="font-medium text-zinc-900">{p.generated ? `${Math.round(p.margin_rate * 100)}%` : '—'}</p>
                          </div>
                        </>
                      )}
                      <div className="text-sm">
                        <p className="text-zinc-500 text-xs mb-0.5">交付日</p>
                        <p className="font-medium text-zinc-900">{p.delivery_date}</p>
                      </div>
                    </div>
                    <div className="text-blue-600 bg-blue-50 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, color, label, value, tag }: { icon: React.ReactNode; color: string; label: string; value: string; tag?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600', orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colors[color]}`}>{icon}</div>
        {tag && <span className={`text-xs font-medium px-2 py-1 rounded-md ${colors[color]}`}>{tag}</span>}
      </div>
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <h3 className="text-3xl font-bold text-zinc-900 mt-1">{value}</h3>
    </div>
  );
}
