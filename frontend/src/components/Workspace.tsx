import React from 'react';
import { useStore } from '../store/useStore';
import { OverviewTab } from './tabs/OverviewTab';
import { TimelineTab } from './tabs/TimelineTab';
import { BudgetTab } from './tabs/BudgetTab';
import { AssetsTab } from './tabs/AssetsTab';
import { Team } from './Team';
import { LayoutDashboard, CalendarDays, PieChart, FolderOpen, Users, Trash2 } from 'lucide-react';

export function Workspace() {
  const { activeTab, setActiveTab, currentProjectId, projects, currentUser, setProjects, setView } = useStore();
  const currentProject = projects.find(p => p.id === currentProjectId);
  const isBoss = currentUser?.role === 'boss';

  const deleteProject = async () => {
    if (!currentProject) return;
    if (!window.confirm(`确定删除项目「${currentProject.name}」吗？\n报价、排期、对话都会一并删除，不可恢复。`)) return;
    try {
      await fetch(`/api/projects/${currentProject.id}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setProjects(projects.filter(p => p.id !== currentProject.id));
    setView('dashboard');
  };

  const allTabs = [
    { id: 'overview', label: '项目总览', icon: LayoutDashboard },
    { id: 'timeline', label: '执行排期', icon: CalendarDays },
    { id: 'budget', label: '预算控制', icon: PieChart, bossOnly: true },
    { id: 'assets', label: '资产管理', icon: FolderOpen },
    { id: 'team', label: '项目团队', icon: Users },
  ] as const;
  // 预算仅老板可见
  const tabs = allTabs.filter(t => isBoss || !('bossOnly' in t && t.bossOnly));
  // 员工若停留在预算页，按总览渲染（不直接改 state，避免渲染期副作用）
  const effectiveTab = (!isBoss && activeTab === 'budget') ? 'overview' : activeTab;

  if (!currentProject) return <div className="flex-1 flex items-center justify-center bg-zinc-50">请选择一个项目</div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/50">
      {/* Top Navigation / Tabs */}
      <div className="h-16 border-b border-zinc-200 bg-white flex items-center px-6">
        <div className="flex space-x-8 h-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = effectiveTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center h-full border-b-2 transition-colors px-1 ${
                  isActive 
                    ? 'border-blue-600 text-blue-600 font-medium' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Icon size={18} className="mr-2" />
                {tab.label}
              </button>
            );
          })}
        </div>
        
        <div className="ml-auto flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${currentProject.health === 'good' ? 'bg-green-500' : 'bg-orange-500'}`}></span>
            <span className="text-sm font-medium text-zinc-700">项目健康度: {currentProject.health === 'good' ? '良好' : '预警'}</span>
          </div>
          {isBoss && (
            <button onClick={deleteProject} title="删除项目"
              className="flex items-center text-sm text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
              <Trash2 size={15} className="mr-1" />删除
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {effectiveTab === 'overview' && <OverviewTab project={currentProject} />}
        {effectiveTab === 'timeline' && <TimelineTab project={currentProject} />}
        {effectiveTab === 'budget' && isBoss && <BudgetTab project={currentProject} />}
        {effectiveTab === 'assets' && <AssetsTab project={currentProject} />}
        {effectiveTab === 'team' && <Team />}
      </div>
    </div>
  );
}
