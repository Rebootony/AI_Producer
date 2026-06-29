import React, { useState, useEffect } from 'react';
import { useStore, Project } from '../store/useStore';
import { Video, LayoutDashboard, Plus } from 'lucide-react';
import { cn } from '../utils';
import { NewProjectModal } from './NewProjectModal';

export function GlobalSidebar() {
  const { view, setView, projects, currentProjectId, setCurrentProject, setProjects, currentUser } = useStore();
  const [unreadByProject, setUnreadByProject] = useState<Record<string, number>>({});
  const [showNewProject, setShowNewProject] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`/api/projects?t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Project[] = (data.projects || []).map((p: any) => ({
        id: p.id, name: p.name, client: p.client, industry: p.industry,
        budget: p.client_price || 0, usedBudget: 0, days: 35,
        deliveryDate: p.delivery_date || '—',
        status: p.status === 'completed' ? 'completed' : p.status === 'planning' ? 'planning' : 'in_progress',
        health: 'good',
      }));
      if (mapped.length) setProjects(mapped);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (currentUser) fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: '大盘' },
  ] as const;

  const fetchUnread = async () => {
    try {
      if (!currentUser) return;
      const res = await fetch(`/api/unread_counts?role=${encodeURIComponent(currentUser.role)}&t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      const counts = data.counts || {};
      if (currentProjectId && view === 'project_chat') {
        counts[currentProjectId] = 0;
      }
      setUnreadByProject(counts);
    } catch (e) {
      console.error('Failed to fetch unread', e);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchUnread();
    const intervalId = setInterval(() => {
      fetchUnread();
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, [projects, currentUser, currentProjectId, view]);

  return (
    <div className="flex h-full shrink-0 z-20">
      {/* Primary Sidebar */}
      <div className="w-20 h-full bg-zinc-900 flex flex-col items-center py-6 overflow-y-auto overflow-x-hidden no-scrollbar border-r border-zinc-800">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg mb-8 shrink-0">
          <Video size={24} />
        </div>

        {/* Main Nav */}
        <div className="flex flex-col space-y-4 w-full items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.id === 'dashboard'
                ? view === 'dashboard'
                : (view === 'project_chat' || view === 'project_dashboard') && !!currentProjectId;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentProject('');
                  setView('dashboard');
                }}
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
          <span className="text-[10px] text-zinc-600 font-bold mb-1">项目</span>
          {projects.map((project) => {
            const isActive = currentProjectId === project.id;
            const initials = project.name.substring(0, 2);
            const unread = unreadByProject[project.id] || 0;
            
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
                {unread > 0 && !isActive && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                )}
              </button>
            );
          })}
          
          <button
            onClick={() => setShowNewProject(true)}
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-zinc-500 bg-zinc-800/50 hover:bg-zinc-800 hover:text-zinc-300 transition-all border border-dashed border-zinc-700 hover:border-zinc-500 mt-2"
            title="新建项目"
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
            <img src={currentUser?.avatar} alt="Avatar" />
          </div>
        </div>
      </div>

      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={async (id) => { await fetchProjects(); setShowNewProject(false); setCurrentProject(id); }}
      />
    </div>
  );
}
