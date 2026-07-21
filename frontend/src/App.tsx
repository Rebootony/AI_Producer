import React, { useState } from 'react';
import { ChatSidebar } from './components/ChatSidebar';
import { Workspace } from './components/Workspace';
import { Dashboard } from './components/Dashboard';
import { Team } from './components/Team';
import { Login } from './components/Login';
import { GlobalSidebar } from './components/GlobalSidebar';
import { EmployeeWorkbench } from './components/EmployeeWorkbench';
import { Bell, Settings, ClipboardList, MessageSquare } from 'lucide-react';
import { useStore } from './store/useStore';

function App() {
  const { view, currentProjectId, projects, currentUser } = useStore();
  const currentProject = projects.find(p => p.id === currentProjectId);
  const inProject = view !== 'dashboard' && !!currentProject;
  const [chatOpen, setChatOpen] = useState(true);

  if (!currentUser) {
    return <Login />;
  }

  // 执行端：左边个人任务工作台 + 右边对话（可折叠），看不到大盘/预算/利润
  if (currentUser.role === 'employee') {
    return (
      <div className="flex flex-col h-screen w-full bg-white overflow-hidden font-sans">
        <header className="h-14 bg-zinc-900 text-white flex items-center px-6 shrink-0 z-10 border-b border-zinc-800">
          <span className="font-bold tracking-wide">Noah</span>
          <span className="ml-2 text-xs text-zinc-500">执行端</span>
          <span className="ml-6 text-sm text-zinc-300 inline-flex items-center"><ClipboardList size={15} className="mr-1.5 text-blue-400" />我的任务台</span>
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`ml-4 px-3 py-1 rounded-md text-sm inline-flex items-center transition-colors ${chatOpen ? 'bg-blue-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
            title={chatOpen ? '折叠右侧对话' : '展开右侧对话'}
          >
            <MessageSquare size={14} className="mr-1.5" />对话
          </button>
          <div className="ml-auto flex items-center gap-3 pr-1">
            <IdentityBadge />
          </div>
        </header>
        <main className="flex-1 flex overflow-hidden">
          <EmployeeWorkbench />
          {chatOpen ? (
            <div className="w-[400px] shrink-0 flex flex-col border-l border-zinc-200 bg-zinc-50">
              <ChatSidebar onCollapse={() => setChatOpen(false)} />
            </div>
          ) : (
            <button onClick={() => setChatOpen(true)} title="展开对话"
              className="shrink-0 w-10 border-l border-zinc-200 bg-white hover:bg-zinc-50 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-blue-600 transition-colors">
              <MessageSquare size={18} />
              <span className="text-xs tracking-widest" style={{ writingMode: 'vertical-rl' }}>对话</span>
            </button>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden font-sans">
      {/* Global Navbar */}
      <header className="h-14 bg-zinc-900 text-white flex items-center px-4 shrink-0 z-10 border-b border-zinc-800">
        <div className="w-20 shrink-0"></div> {/* Spacer for sidebar */}
        <div className="flex items-center space-x-2">
          <span className="font-bold tracking-wide">Noah</span>
        </div>
        
        <div className="ml-10 flex items-center space-x-2">
          <div className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'dashboard' ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-zinc-400'}`}>
            大盘总览
          </div>
          {inProject && (
            <>
              <span className="text-zinc-600">/</span>
              <div className="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-md text-sm font-medium">
                {currentProject!.name}
              </div>
              {/* 对话面板 折叠/展开（看板始终在左，对话在右） */}
              <button
                onClick={() => setChatOpen((o) => !o)}
                className={`ml-3 px-3 py-1 rounded-md text-sm inline-flex items-center transition-colors ${chatOpen ? 'bg-blue-600 text-white font-medium' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                title={chatOpen ? '折叠右侧对话' : '展开右侧对话'}
              >
                <MessageSquare size={14} className="mr-1.5" />对话
              </button>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center space-x-4 pr-4">
          <button className="text-zinc-400 hover:text-white transition-colors">
            <Bell size={18} />
          </button>
          <button className="text-zinc-400 hover:text-white transition-colors">
            <Settings size={18} />
          </button>
          <IdentityBadge />
        </div>
      </header>

      {/* Main Layout：看板在左、对话在右（可折叠） */}
      <main className="flex-1 flex overflow-hidden">
        <GlobalSidebar />
        {!inProject ? (
          <Dashboard />
        ) : (
          <>
            <Workspace />
            {chatOpen ? (
              <div className="w-[400px] shrink-0 flex flex-col border-l border-zinc-200 bg-zinc-50">
                <ChatSidebar onCollapse={() => setChatOpen(false)} />
              </div>
            ) : (
              <button
                onClick={() => setChatOpen(true)}
                title="展开对话"
                className="shrink-0 w-10 border-l border-zinc-200 bg-white hover:bg-zinc-50 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-blue-600 transition-colors"
              >
                <MessageSquare size={18} />
                <span className="text-xs tracking-widest" style={{ writingMode: 'vertical-rl' }}>对话</span>
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// 用户名｜身份 展示 + 多身份切换（§10 / §11）
function IdentityBadge() {
  const { currentUser, switchIdentity, logout } = useStore();
  if (!currentUser) return null;
  const multi = (currentUser.identities?.length || 0) > 1;
  return (
    <div className="flex items-center gap-2">
      {multi && currentUser.identities ? (
        <select
          value={currentUser.title}
          onChange={(e) => switchIdentity(e.target.value)}
          title="切换身份视角"
          className="text-sm rounded-lg px-2 py-1 outline-none bg-zinc-800 text-zinc-100 border border-zinc-700 hover:border-zinc-500 cursor-pointer"
        >
          {currentUser.identities.map((i) => (
            <option key={i.title} value={i.title}>{currentUser.name}｜{i.title}</option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-zinc-200">{currentUser.name}｜{currentUser.title}</span>
      )}
      <img src={currentUser.avatar} alt="" onClick={() => logout()} title="点击退出登录"
        className="w-8 h-8 rounded-full cursor-pointer border-2 border-zinc-700 hover:border-zinc-500" />
    </div>
  );
}

export default App;
