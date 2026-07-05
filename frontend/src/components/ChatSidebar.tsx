import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../utils';
import { Send, Bot, User, Paperclip, Loader2, Trash2, PanelRightClose } from 'lucide-react';

export function ChatSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const { messages, setMessages, addMessage, currentUser, currentProjectId, projects, updateProject } = useStore();
  const [input, setInput] = useState('');
  // 记录"哪个项目有正在处理的请求"——避免一个项目在思考时，切到别的项目也错误显示气泡
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentSessionId = 'default';
  const currentProject = projects.find(p => p.id === currentProjectId);

  const fetchMessages = async () => {
    try {
      // 按当前项目读取对话（不再用全局接口，避免多个项目的消息混在一起）
      const projectId = currentProjectId || 'p1';
      const roleParam = currentUser ? `&role=${encodeURIComponent(currentUser.role)}` : '';
      const res = await fetch(`/api/messages/${projectId}?session_id=${currentSessionId}${roleParam}&t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (res.ok) {
        useStore.getState().setChatProjectId(projectId);
        const data = await res.json();
        const mapped = data.messages.map((m: any) => ({
          id: m.id.toString(),
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp)
        }));
        if (mapped.length === 0) {
          if (useStore.getState().messages.length !== 1 || useStore.getState().messages[0].id !== 'init') {
            setMessages([{ id: 'init', role: 'ai', content: '我是诺亚，你的 AI 项目经理。报价、排期、盯进度、盯风险都归我——直接说需求就行。', timestamp: new Date() }]);
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
    if (!currentUser) return;
    // 仅当切换到“别的项目”时才清空（避免显示上一个项目的对话）；切看板/对话回来不清空，保留对话与思考气泡
    const belongsTo = useStore.getState().chatProjectId;
    if (belongsTo !== (currentProjectId || 'p1')) {
      setMessages([{ id: 'init', role: 'ai', content: '我是诺亚，你的 AI 项目经理。报价、排期、盯进度、盯风险都归我——直接说需求就行。', timestamp: new Date() }]);
    }
    fetchMessages();
    const intervalId = setInterval(() => { fetchMessages(); }, 3000);
    return () => clearInterval(intervalId);
  }, [currentProjectId, currentUser, currentSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentUser) return;

    const sentPid = currentProjectId || 'p1';   // 记住这条消息是发给哪个项目的
    const userText = input.trim();
    addMessage({ role: 'user', content: userText });
    setInput('');
    setPendingProjectId(sentPid);
    // 当前是否还停留在发送时的那个项目（切走了就不要把回复塞到别的项目对话里）
    const stillHere = () => (useStore.getState().currentProjectId || 'p1') === sentPid;

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
          project_id: sentPid,
          session_id: currentSessionId
        })
      });

      if (res.ok) {
        const data = await res.json();
        // 只有还在该项目时才直接追加；切走了就交给轮询在回到该项目时拉取（后端已存）
        if (stillHere()) addMessage({ role: 'ai', content: data.reply });

        // Fetch project to see if budget/stage changed
        const projectRes = await fetch(`/api/projects/${sentPid}`);
        if (projectRes.ok) {
           const pData = await projectRes.json();
           updateProject(sentPid, { budget: pData.budget, status: pData.status === 'planning' ? 'planning' : 'in_progress' });
        }
      }
    } catch (error) {
      if (stillHere()) addMessage({ role: 'ai', content: '（网络错误，无法连接后端模型服务）' });
    } finally {
      setPendingProjectId((cur) => (cur === sentPid ? null : cur));
    }
  };

  const clearChat = async () => {
    if (!window.confirm('确定清空当前项目的对话记录吗？此操作不可恢复。')) return;
    const projectId = currentProjectId || 'p1';
    try {
      await fetch(`/api/messages/${projectId}?session_id=${currentSessionId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setMessages([{ id: 'init', role: 'ai', content: '我是诺亚，你的 AI 项目经理。报价、排期、盯进度、盯风险都归我——直接说需求就行。', timestamp: new Date() }]);
  };

  // 思考气泡：仅在「当前项目」有在处理的请求，或当前项目最后一条是用户发的（还没等到回复）时显示——按项目隔离，切到别的项目不会误显示
  const pid = currentProjectId || 'p1';
  const isPending = pendingProjectId === pid;
  const lastMsg = messages[messages.length - 1];
  const showThinking = isPending || (!!lastMsg && lastMsg.role === 'user');

  return (
    <div className="flex flex-col h-full bg-zinc-50 flex-1 relative">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 bg-white flex items-center justify-between relative">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-800">
              诺亚
              {currentProject && <span className="text-zinc-400 font-normal"> · {currentProject.name}</span>}
            </h2>
            <p className="text-xs text-green-600 flex items-center">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
              AI 项目经理 · 随时在线
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            title="清空当前对话"
            className="flex items-center text-sm text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={16} className="mr-1" />清空对话
          </button>
          {onCollapse && (
            <button onClick={onCollapse} title="折叠对话"
              className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
              <PanelRightClose size={18} />
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
                "p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words",
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
        {showThinking && (
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
            disabled={!input.trim() || isPending}
            className="absolute right-2 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
