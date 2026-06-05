import React from 'react';
import { useStore } from '../store/useStore';
import { Briefcase, TrendingUp, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '../utils';

export function Dashboard() {
  const { projects, setCurrentProject } = useStore();

  const totalBudget = projects.reduce((acc, p) => acc + p.budget, 0);
  const totalUsed = projects.reduce((acc, p) => acc + p.usedBudget, 0);
  
  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-8">
      <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-900">全局项目大盘</h1>
          <p className="text-zinc-500 mt-2">AI 制片协助您同时管理多个制片项目，保障预算与进度。</p>
        </div>

        {/* Global Metrics for Investors */}
        <div className="grid grid-cols-4 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Briefcase size={20} />
              </div>
              <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md">+2 本周</span>
            </div>
            <p className="text-sm font-medium text-zinc-500">活跃项目总数</p>
            <h3 className="text-3xl font-bold text-zinc-900 mt-1">{projects.length}</h3>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <TrendingUp size={20} />
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-500">管理总预算</p>
            <h3 className="text-3xl font-bold text-zinc-900 mt-1">¥ {(totalBudget / 10000).toFixed(1)}w</h3>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                <Clock size={20} />
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-500">AI 累计节省工时</p>
            <h3 className="text-3xl font-bold text-zinc-900 mt-1">128 h</h3>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                <AlertTriangle size={20} />
              </div>
              <span className="text-sm font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-md">1 需关注</span>
            </div>
            <p className="text-sm font-medium text-zinc-500">风险预警项</p>
            <h3 className="text-3xl font-bold text-zinc-900 mt-1">1</h3>
          </div>
        </div>

        {/* Project List */}
        <div>
          <h2 className="text-xl font-bold text-zinc-900 mb-6">正在执行的项目</h2>
          <div className="grid grid-cols-2 gap-6">
            {projects.map((project) => {
              const progress = (project.usedBudget / project.budget) * 100;
              return (
                <div 
                  key={project.id} 
                  onClick={() => setCurrentProject(project.id)}
                  className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">{project.name}</h3>
                      <p className="text-sm text-zinc-500 mt-1">{project.client} | {project.industry}</p>
                    </div>
                    <div className={cn(
                      "px-3 py-1 text-xs font-medium rounded-full",
                      project.health === 'good' ? "bg-green-50 text-green-700" :
                      project.health === 'warning' ? "bg-orange-50 text-orange-700" :
                      "bg-red-50 text-red-700"
                    )}>
                      {project.health === 'good' ? '状态良好' : '预算告急'}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-500">预算消耗进度</span>
                      <span className="font-medium text-zinc-700">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all",
                          progress > 90 ? "bg-red-500" : progress > 70 ? "bg-orange-500" : "bg-blue-500"
                        )}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
                    <div className="flex space-x-4">
                      <div className="text-sm">
                        <p className="text-zinc-500 text-xs mb-0.5">总预算</p>
                        <p className="font-medium text-zinc-900">¥ {(project.budget / 10000).toFixed(1)}w</p>
                      </div>
                      <div className="text-sm">
                        <p className="text-zinc-500 text-xs mb-0.5">交付日期</p>
                        <p className="font-medium text-zinc-900">{project.deliveryDate}</p>
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
