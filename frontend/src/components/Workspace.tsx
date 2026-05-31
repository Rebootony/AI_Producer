import React from 'react';
import { useStore } from '../store/useStore';
import { OverviewTab } from './tabs/OverviewTab';
import { TimelineTab } from './tabs/TimelineTab';
import { BudgetTab } from './tabs/BudgetTab';
import { AssetsTab } from './tabs/AssetsTab';
import { Team } from './Team';
import { LayoutDashboard, CalendarDays, PieChart, FolderOpen, Users } from 'lucide-react';

export function Workspace() {
  const { activeTab, setActiveTab, currentProjectId, projects } = useStore();
  const currentProject = projects.find(p => p.id === currentProjectId);

  const tabs = [
    { id: 'overview', label: '项目总览', icon: LayoutDashboard },
    { id: 'timeline', label: '执行排期', icon: CalendarDays },
    { id: 'budget', label: '预算控制', icon: PieChart },
    { id: 'assets', label: '资产管理', icon: FolderOpen },
    { id: 'team', label: '项目团队', icon: Users },
  ] as const;

  if (!currentProject) return <div className="flex-1 flex items-center justify-center bg-zinc-50">请选择一个项目</div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/50">
      {/* Top Navigation / Tabs */}
      <div className="h-16 border-b border-zinc-200 bg-white flex items-center px-6">
        <div className="flex space-x-8 h-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
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
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab project={currentProject} />}
        {activeTab === 'timeline' && <TimelineTab project={currentProject} />}
        {activeTab === 'budget' && <BudgetTab project={currentProject} />}
        {activeTab === 'assets' && <AssetsTab project={currentProject} />}
        {activeTab === 'team' && <Team />}
      </div>
    </div>
  );
}
