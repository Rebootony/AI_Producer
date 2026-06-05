import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Video, LayoutDashboard, Briefcase, Users, Settings, Plus, MessageSquare, PlusCircle } from 'lucide-react';
import { cn } from '../utils';

export function GlobalSidebar() {
  const { view, setView, projects, currentProjectId, setCurrentProject, sessions, setSessions, currentSessionId, setCurrentSessionId, currentUser } = useStore();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: '大盘' },
    { id: 'settings', icon: Settings, label: '设置' },
  ] as const;

  const fetchSessions = async (projectId: string) => {
    try {
      const roleParam = currentUser ? `role=${currentUser.role}&` : '';
      const res = await fetch(`/api/projects/${projectId}/threads?${roleParam}t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const threads = data.threads || [];
        
        // 如果当前是进入项目且没有选中 session，尝试默认选中 default
        // 注意：只有在项目刚加载，且 currentSessionId 为 null 时才执行
        if (useStore.getState().currentSessionId === null && threads.length > 0) {
          const defaultThread = threads.find((t: any) => t.id === 'default');
          if (defaultThread) {
            useStore.getState().setCurrentSessionId('default');
          } else {
            // 如果没有 default，选中第一个
            useStore.getState().setCurrentSessionId(threads[0].id);
          }
        }
        
        // 乐观处理：当前正在查看的 session 强制不显示红点
        const updatedThreads = threads.map((t: any) => 
           t.id === useStore.getState().currentSessionId ? { ...t, unreadCount: 0 } : t
        );
        
        const currentSessions = useStore.getState().sessions;
        const isSame = JSON.stringify(currentSessions) === JSON.stringify(updatedThreads);
        if (!isSame) {
          setSessions(updatedThreads);
        }
      }
    } catch (e) {
      console.error('Failed to fetch threads', e);
    }
  };

  useEffect(() => {
    if (!currentProjectId) return;
    
    // 当切换项目时，由于 currentSessionId 被置空，我们需要立即拉取新项目的 sessions
    // 并清空旧项目的 sessions 状态，防止在请求回来前显示旧项目的对话
    setSessions([]);
    
    fetchSessions(currentProjectId);
    
    const intervalId = setInterval(() => {
      fetchSessions(currentProjectId);
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, [currentProjectId, currentUser]);

  const createNewThread = async () => {
    if (!currentProjectId || !currentUser) return;
    try {
      const res = await fetch(`/api/projects/${currentProjectId}/threads?user_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '新对话' })
      });
      if (res.ok) {
        const data = await res.json();
        // 主动插入新 session 以触发立刻更新 UI
        const newThread = { id: data.id, name: data.name, timestamp: new Date().toISOString(), unreadCount: 0 };
        setSessions([newThread, ...sessions]);
        setCurrentSessionId(data.id);
        setView('project_chat');
      }
    } catch (e) {
      console.error('Failed to create thread', e);
    }
  };

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
            const isActive = view === item.id && !currentProjectId;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'dashboard') {
                    setCurrentProject('');
                    setView('dashboard');
                  }
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

      {/* Secondary Sidebar (Threads) */}
      {currentProjectId && (
        <div className="w-56 h-full bg-zinc-900/95 border-r border-zinc-800 flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-zinc-800">
            <h3 className="text-zinc-300 font-medium text-sm flex items-center">
              <MessageSquare size={14} className="mr-2" />
              对话记录
            </h3>
            <button onClick={createNewThread} className="text-zinc-400 hover:text-white transition-colors" title="新建对话">
              <PlusCircle size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => setCurrentSessionId(s.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors relative group flex items-center justify-between",
                  s.id === currentSessionId && view === 'project_chat'
                    ? "bg-blue-600/20 text-blue-400 font-medium" 
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                )}
              >
                <span className="truncate pr-4">{s.name || `对话 ${s.id.replace('thread_', '')}`}</span>
                {s.unreadCount && s.unreadCount > 0 ? (
                  <span className="w-2 h-2 bg-red-500 rounded-full shrink-0"></span>
                ) : null}
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="px-3 py-4 text-xs text-zinc-600 text-center">暂无对话记录</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
