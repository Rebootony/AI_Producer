import React from 'react';
import { ChatSidebar } from './components/ChatSidebar';
import { Workspace } from './components/Workspace';
import { Dashboard } from './components/Dashboard';
import { Team } from './components/Team';
import { Login } from './components/Login';
import { GlobalSidebar } from './components/GlobalSidebar';
import { Bell, Settings } from 'lucide-react';
import { useStore } from './store/useStore';

function App() {
  const { view, currentProjectId, projects, currentUser } = useStore();
  const currentProject = projects.find(p => p.id === currentProjectId);

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden font-sans">
      {/* Global Navbar */}
      <header className="h-14 bg-zinc-900 text-white flex items-center px-4 shrink-0 z-10 border-b border-zinc-800">
        <div className="w-20 shrink-0"></div> {/* Spacer for sidebar */}
        <div className="flex items-center space-x-2">
          <span className="font-bold tracking-wide">AI PRODUCER</span>
        </div>
        
        <div className="ml-10 flex items-center space-x-2">
          <div className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'dashboard' ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-zinc-400'}`}>
            大盘总览
          </div>
          {view === 'project' && currentProject && (
            <>
              <span className="text-zinc-600">/</span>
              <div className="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-md text-sm font-medium">
                {currentProject.name}
              </div>
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
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        <GlobalSidebar />
        {view === 'project' && <ChatSidebar />}
        {view === 'dashboard' ? <Dashboard /> : <Workspace />}
      </main>
    </div>
  );
}

export default App;
