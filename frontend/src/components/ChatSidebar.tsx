import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../utils';
import { Send, Bot, User, Paperclip } from 'lucide-react';

export function ChatSidebar() {
  const { messages, addMessage, addProject, setCurrentProject, updateProject, currentProjectId, projects, view } = useStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    addMessage({ role: 'user', content: input });
    const userText = input.trim();
    setInput('');

    setTimeout(() => {
      // Mock "Create Project" flow for Investor Demo
      if (userText.includes('新建') || userText.includes('新项目')) {
        const newProject = {
          id: 'p3',
          name: '运动装备夏季TVC',
          client: '某知名运动品牌',
          industry: '体育服饰',
          budget: 500000,
          usedBudget: 0,
          days: 45,
          deliveryDate: '6月10日',
          status: 'planning' as const,
          health: 'good' as const
        };
        addProject(newProject);
        addMessage({
          role: 'ai',
          content: '收到！我已经为您自动解析需求，并成功创建了新项目《运动装备夏季TVC》。项目预算50万，交付期6月10日。正在为您切换到该项目工作台...'
        });
        
        setTimeout(() => {
          setCurrentProject('p3');
        }, 1500);
      } 
      // Context aware logic based on active view/project
      else if (currentProjectId === 'p1' && (userText.includes('加一天') || userText.includes('增加一天'))) {
        updateProject('p1', { budget: 300000, usedBudget: 115000 + 5500 });
        addMessage({
          role: 'ai',
          content: '收到。增加一天拍摄，导演和摄影成本将增加 5500 元。我已经更新了右侧的预算看板，目前项目仍然在安全预算内。'
        });
      } 
      else {
        addMessage({
          role: 'ai',
          content: `（纯前端演示环境，未连接大模型）我已经收到您的消息：“${userText}”。后续接入大模型后，我将能真正理解您的意图并做出专业判断。`
        });
      }
    }, 1000);
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
            disabled={!input.trim()}
            className="absolute right-2 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
