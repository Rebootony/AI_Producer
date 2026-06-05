import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../utils';
import { Send, Bot, User, Paperclip, Loader2, Plus, Trash2, List } from 'lucide-react';

export function ChatSidebar() {
  const { messages, setMessages, addMessage, currentUser, currentProjectId, updateProject, currentSessionId, setCurrentSessionId, sessions, setSessions } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const projectId = currentProjectId || 'p1';
    try {
      const roleParam = currentUser ? `&role=${currentUser.role}` : '';
      const res = await fetch(`/api/messages/${projectId}?session_id=${currentSessionId}${roleParam}&t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = data.messages.map((m: any) => ({
          id: m.id.toString(),
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp)
        }));
        if (mapped.length === 0) {
          if (useStore.getState().messages.length !== 1 || useStore.getState().messages[0].id !== 'init') {
            setMessages([{ id: 'init', role: 'ai', content: '你好，我是AI制片。你可以让我转达任务、推进排期或调整预算。', timestamp: new Date() }]);
          }
        } else {
          const currentMessages = useStore.getState().messages;
          const isSame = currentMessages.length === mapped.length && 
                         currentMessages[currentMessages.length - 1]?.id === mapped[mapped.length - 1]?.id;
          if (!isSame) {
            setMessages(mapped);
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch messages', e);
    }
  };

  // 轮询自动刷新消息
  useEffect(() => {
    if (!currentUser || !currentProjectId || !currentSessionId) return;
    
    // 初始化时获取一次
    fetchMessages();

    // 设置定时器每 3 秒刷新一次
    const intervalId = setInterval(() => {
      fetchMessages();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [currentProjectId, currentUser, currentSessionId]);

  // 当选中某个 session 时，本地乐观清除红点（后端会在 fetchMessages 时自动标记已读）
  useEffect(() => {
    if (currentSessionId && sessions.length > 0) {
       setSessions(sessions.map(s => 
          s.id === currentSessionId ? { ...s, unreadCount: 0 } : s
       ));
    }
  }, [currentSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
          project_id: currentProjectId || 'p1',
          session_id: currentSessionId
        })
      });

      if (res.ok) {
        const data = await res.json();
        addMessage({ role: 'ai', content: data.reply });
        
        // Fetch project to see if budget/stage changed
        const projectRes = await fetch(`/api/projects/${currentProjectId || 'p1'}`);
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

  const deleteCurrentSession = async () => {
    if (currentSessionId === 'default') {
      alert('主频道不可删除');
      return;
    }
    if (!confirm('确定要删除当前对话吗？')) return;
    const projectId = currentProjectId || 'p1';
    try {
      await fetch(`/api/projects/${projectId}/threads/${currentSessionId}`, { method: 'DELETE' });
      setCurrentSessionId('default');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 border-r border-zinc-200 w-[400px] shrink-0 relative">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 bg-white flex items-center justify-between relative">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-800">AI 制片</h2>
            <p className="text-xs text-green-600 flex items-center">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
              随时在线
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          {currentSessionId !== 'default' && (
            <button
              type="button"
              onClick={deleteCurrentSession}
              className="p-2 text-red-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50"
              title="删除对话"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
              msg.role === 'user' ? "bg-zinc-800 text-white" : 
              msg.role === 'employee' ? "bg-green-600 text-white" : "bg-blue-600 text-white"
            )}>
              {msg.role === 'user' ? <User size={16} /> : 
               msg.role === 'employee' ? <span className="text-xs font-bold">员工</span> : <Bot size={16} />}
            </div>
            <div className="flex flex-col">
              <div className={cn(
                "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-zinc-800 text-white rounded-tr-sm" 
                  : msg.role === 'employee'
                  ? "bg-green-50 text-green-900 border border-green-100 rounded-tl-sm"
                  : "bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm"
              )}>
                {msg.content}
              </div>
              <span className={cn(
                "text-[10px] text-zinc-400 mt-1",
                msg.role === 'user' ? "text-right" : "text-left"
              )}>
                {msg.timestamp.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex space-x-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Bot size={16} />
            </div>
            <div className="p-4 rounded-2xl bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm shadow-sm flex items-center space-x-2">
              <Loader2 size={16} className="animate-spin text-blue-600" />
              <span className="text-sm text-zinc-500">AI 正在思考...</span>
            </div>
          </div>
        )}
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
