
import { Menu, Plus, BookOpen, Brain } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
  onNewChat: () => void;
}

export default function Header({
  onMenuClick,
  onNewChat,
}: HeaderProps) {
  return (
    <header className="flex h-20 items-center justify-between border-b border-gray-200 bg-white px-6 lg:px-9">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="ml-auto flex w-full max-w-[760px] items-center justify-between pl-6">
        <button
          onClick={onNewChat}
          className="group flex h-[54px] min-w-[170px] items-center gap-3 rounded-full border border-blue-300 bg-blue-50 px-4 transition-all duration-200 hover:bg-blue-100 hover:shadow-sm"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-transform duration-200 group-hover:scale-105">
            <Plus className="h-5 w-5" />
          </div>

          <span className="text-base font-semibold text-blue-700">
            New Chat
          </span>
        </button>

        <button className="group flex h-[54px] min-w-[205px] items-center gap-3 rounded-full border border-violet-300 bg-violet-50 px-4 transition-all duration-200 hover:bg-violet-100 hover:shadow-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white transition-transform duration-200 group-hover:scale-105">
            <BookOpen className="h-5 w-5" />
          </div>

          <span className="text-base font-semibold text-violet-700">
            Knowledge Base
          </span>
        </button>

        <button className="group flex h-[54px] min-w-[185px] items-center gap-3 rounded-full border border-emerald-300 bg-emerald-50 px-4 transition-all duration-200 hover:bg-emerald-100 hover:shadow-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-transform duration-200 group-hover:scale-105">
            <Brain className="h-5 w-5" />
          </div>

          <span className="text-base font-semibold text-emerald-700">
            Train Model
          </span>
        </button>
      </div>
    </header>
  );
}