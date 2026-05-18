
import { Menu, BookOpen, Play, Plus } from 'lucide-react';
import { useKnowledgeBase } from '../context/KnowledgeBaseContext';

interface HeaderProps {
  onMenuClick: () => void;
  onNewChat: () => void;
}

export default function Header({
  onMenuClick,
  onNewChat,
}: HeaderProps) {
  const { openDatasetSelectionModal } = useKnowledgeBase();
  return (
    <header className="flex h-[88px] items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-black px-[36px] gap-[32px] overflow-hidden">
      {/* Left Title Area */}
      <div className="flex items-center gap-[16px] shrink-0 w-auto max-w-[360px]">
        <button
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[#050505] text-white transition hover:bg-zinc-900 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <img src="/symboll.png" alt="Analytics Supervisor" className="w-[22px] h-[22px] shrink-0 mix-blend-screen" />
        <div className="flex flex-col">
          <h1 className="text-[22px] font-[800] leading-[26px] text-white whitespace-nowrap">Analytics Supervisor</h1>
          <span className="text-[15px] font-[400] leading-[20px] text-zinc-400">Orchestrator</span>
        </div>
      </div>

      {/* Right Action Buttons Area */}
      <div className="ml-auto flex shrink-0 items-center justify-end gap-[20px]">
        {/* Actions: Knowledge Base, Train Model, Run Analysis */}
        <button
          onClick={openDatasetSelectionModal}
          className="group flex h-[36px] items-center gap-[8px] rounded-full border border-[rgba(255,255,255,0.18)] bg-[#050505] px-[16px] transition-all duration-200 hover:bg-[#151515] hover:border-[rgba(255,255,255,0.28)]"
        >
          <BookOpen className="text-white shrink-0" size={16} />
          <span className="text-[14px] font-[700] text-white whitespace-nowrap">
            Knowledge Base
          </span>
        </button>

        <button 
          className="group flex h-[36px] items-center gap-[8px] rounded-full border border-[rgba(255,255,255,0.18)] bg-[#050505] px-[16px] transition-all duration-200 hover:bg-[#151515] hover:border-[rgba(255,255,255,0.28)]"
        >
          <Plus className="text-white shrink-0" size={16} />
          <span className="text-[14px] font-[700] text-white whitespace-nowrap">
            Train Model
          </span>
        </button>

        <button 
          className="group flex h-[36px] items-center gap-[8px] rounded-full border border-[rgba(255,255,255,0.18)] bg-[#050505] px-[16px] transition-all duration-200 hover:bg-[#151515] hover:border-[rgba(255,255,255,0.28)]"
        >
          <Play className="text-white shrink-0" size={16} />
          <span className="text-[14px] font-[700] text-white whitespace-nowrap">
            Run Analysis
          </span>
        </button>
      </div>
    </header>
  );
}