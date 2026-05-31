import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Video, LayoutDashboard, Briefcase, Users, Settings, Plus } from 'lucide-react';
import { cn } from '../utils';

export function GlobalSidebar() {
  const { view, setView, projects, currentProjectId, setCurrentProject } = useStore();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: '大盘' },
    { id: 'settings', icon: Settings, label: '设置' },
  ] as const;

  return (
    <div className="w-20 h-full bg-zinc-900 flex flex-col items-center py-6 shrink-0 z-20 overflow-y-auto overflow-x-hidden no-scrollbar">
      <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg mb-8 shrink-0">
        <Video size={24} />
      </div>

      {/* Main Nav */}
      <div className="flex flex-col space-y-4 w-full items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => item.id === 'dashboard' ? setView('dashboard') : null}
              className="relative flex flex-col items-center justify-center group w-14 h-14"
            >
              {isActive && (
                <div className="absolute left-0 w-1 h-8 bg-blue-500 rounded-r-full -ml-3"></div>
              )}
              <div className={cn(
                "p-3 rounded-xl transition-all duration-200",
                isActive 
                  ? "bg-blue-600/20 text-blue-400" 
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}>
                <Icon size={22} />
              </div>
              <span className="text-[10px] mt-1 text-zinc-500 font-medium group-hover:text-zinc-300 transition-colors">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-10 h-px bg-zinc-800 my-6 shrink-0"></div>

      {/* Projects List */}
      <div className="flex flex-col space-y-4 w-full items-center flex-1">
        <span className="text-[10px] text-zinc-600 font-bold mb-1">活跃项目</span>
        {projects.map((project) => {
          const isActive = view === 'project' && currentProjectId === project.id;
          const initials = project.name.substring(0, 2);
          
          return (
            <button
              key={project.id}
              onClick={() => setCurrentProject(project.id)}
              className="relative flex flex-col items-center group w-14 group"
            >
              {isActive && (
                <div className="absolute left-0 w-1 h-10 bg-blue-500 rounded-r-full -ml-3 top-1"></div>
              )}
              <div 
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-200 shadow-sm",
                  isActive 
                    ? "bg-blue-600 text-white rounded-xl" 
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white hover:rounded-xl"
                )}
                title={project.name}
              >
                {initials}
              </div>
            </button>
          );
        })}
        
        <button 
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-zinc-500 bg-zinc-800/50 hover:bg-zinc-800 hover:text-zinc-300 transition-all border border-dashed border-zinc-700 hover:border-zinc-500 mt-2"
          title="新建项目 (可在对话框通过AI新建)"
          onClick={() => {
            setView('dashboard');
            // 可以触发AI说一句话
          }}
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="mt-6 shrink-0 relative group">
        <div 
          className="w-10 h-10 rounded-full border-2 border-zinc-700 overflow-hidden cursor-pointer hover:border-zinc-500 transition-colors"
          onClick={() => useStore.getState().logout()}
          title="点击退出登录"
        >
          <img src={useStore.getState().currentUser?.avatar} alt="Avatar" />
        </div>
      </div>
    </div>
  );
}
