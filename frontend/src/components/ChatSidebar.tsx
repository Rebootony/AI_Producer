import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../utils';
import { Send, Bot, User, Paperclip, Loader2 } from 'lucide-react';

export function ChatSidebar() {
  const { messages, setMessages, addMessage, currentUser, currentProjectId, updateProject, projects } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const projectId = currentProjectId || 'demo_project';
    try {
      const res = await fetch(`/api/messages/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.map((m: any, index: number) => ({
          id: index.toString(),
          role: m.role === 'user' || m.role === 'boss' || m.role === 'employee' ? 'user' : 'ai',
          content: m.content,
          timestamp: new Date(m.timestamp)
        })));
      }
    } catch (e) {
      console.error('Failed to fetch messages', e);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [currentProjectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentUser) return;

    const userText = input.trim();
    addMessage({ role: 'user', content: userText });
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userText,
          user_id: currentUser.id,
          role: currentUser.role,
          project_id: currentProjectId || 'demo_project'
        })
      });

      if (res.ok) {
        const data = await res.json();
        addMessage({ role: 'ai', content: data.reply });
        
        // Fetch project to see if budget/stage changed
        const projectRes = await fetch(`/api/projects/${currentProjectId || 'demo_project'}`);
        if (projectRes.ok) {
           const pData = await projectRes.json();
           updateProject(currentProjectId || 'p1', { budget: pData.budget, status: pData.status === 'planning' ? 'planning' : 'in_progress' });
        }
      }
    } catch (error) {
      addMessage({ role: 'ai', content: '（网络错误，无法连接后端模型服务）' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 border-r border-zinc-200 w-[400px] shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 bg-white flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
          <Bot size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-zinc-800">AI 制片人</h2>
          <p className="text-xs text-green-600 flex items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
            随时在线
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex space-x-3 max-w-[85%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse space-x-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              msg.role === 'user' ? "bg-zinc-800 text-white" : "bg-blue-600 text-white"
            )}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={cn(
              "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
              msg.role === 'user' 
                ? "bg-zinc-800 text-white rounded-tr-sm" 
                : "bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm"
            )}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-zinc-200">
        <form onSubmit={handleSend} className="relative flex items-center">
          <button 
            type="button" 
            className="absolute left-3 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <Paperclip size={20} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="告诉AI你需要什么..."
            className="w-full pl-10 pr-12 py-3 bg-zinc-100 border-transparent rounded-full focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
