
import { Menu, BookOpen, Play, Plus, BarChart3 } from 'lucide-react';
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
    <header className="flex h-[82px] items-center justify-between border-b border-zinc-800 bg-black pl-[48px] pr-[40px]">
      {/* Left Title Area */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[#050505] text-white transition hover:bg-zinc-900 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-[18px]">
          <img src="/symboll.png" alt="Analytics Supervisor" className="w-[24px] h-[24px] mix-blend-screen" />
          <div className="flex flex-col">
            <h1 className="text-[22px] font-[800] leading-[26px] text-white whitespace-nowrap">Analytics Supervisor</h1>
            <span className="text-[15px] font-[400] leading-[20px] text-zinc-400">Orchestrator</span>
          </div>
        </div>
      </div>

      {/* Right Action Buttons Area */}
      <div className="flex items-center gap-[24px]">
        {/* Actions: Knowledge Base, Train Model, Run Analysis */}

        <button
          onClick={openDatasetSelectionModal}
          className="group flex h-[34px] items-center gap-2 rounded-full border border-[rgba(255,255,255,0.28)] bg-[#030303] px-4 transition-all duration-200 hover:bg-[#151515] hover:border-[rgba(255,255,255,0.42)]"
        >
          <BookOpen className="text-white" size={16} />
          <span className="text-[14px] font-[600] text-white whitespace-nowrap">
            Knowledge Base
          </span>
        </button>

        <button 
          className="group flex h-[34px] items-center gap-2 rounded-full border border-[rgba(255,255,255,0.28)] bg-[#030303] px-4 transition-all duration-200 hover:bg-[#151515] hover:border-[rgba(255,255,255,0.42)]"
        >
          <Plus className="text-white" size={16} />
          <span className="text-[14px] font-[600] text-white whitespace-nowrap">
            Train Model
          </span>
        </button>

        <button 
          className="group flex h-[34px] items-center gap-2 rounded-full border border-[rgba(255,255,255,0.28)] bg-[#030303] px-4 transition-all duration-200 hover:bg-[#151515] hover:border-[rgba(255,255,255,0.42)]"
        >
          <Play className="text-white" size={16} />
          <span className="text-[14px] font-[600] text-white whitespace-nowrap">
            Run Analysis
          </span>
        </button>
      </div>
    </header>
  );
}