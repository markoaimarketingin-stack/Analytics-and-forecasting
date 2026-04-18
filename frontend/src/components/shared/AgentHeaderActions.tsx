import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Plus } from 'lucide-react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import KnowledgeBaseModal from '../supervisor/KnowledgeBaseModal';
import TrainModelModal from '../supervisor/TrainModelModal';

interface AgentHeaderActionsProps {
  clientId?: string;
}

export default function AgentHeaderActions({ clientId }: AgentHeaderActionsProps) {
  const { setCurrentAgentId } = useKnowledgeBase();
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(false);
  const [isTrainModelModalOpen, setIsTrainModelModalOpen] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCurrentAgentId(1);
            setIsKnowledgeBaseModalOpen(true);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-solid border-[#7c3aed] bg-white px-4 text-sm font-semibold text-violet-600 transition hover:bg-violet-50"
        >
          <BookOpen className="h-4 w-4" /> Knowledge Base
        </button>
        <button
          type="button"
          onClick={() => setIsTrainModelModalOpen(true)}
          className="inline-flex h-11 items-center gap-3 rounded-full border-2 border-black bg-white px-4 text-sm font-semibold text-black shadow-[0_5px_14px_rgba(0,0,0,0.1)] transition hover:-translate-y-[1px] hover:bg-gray-50"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white">
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </span>
          <span>Train Model</span>
        </button>
      </div>

      {isPortalReady
        ? createPortal(
            <>
              <TrainModelModal
                isOpen={isTrainModelModalOpen}
                onClose={() => setIsTrainModelModalOpen(false)}
                clientId={clientId}
              />
              <KnowledgeBaseModal
                isOpen={isKnowledgeBaseModalOpen}
                onClose={() => setIsKnowledgeBaseModalOpen(false)}
                clientId={clientId}
              />
            </>,
            document.body,
          )
        : null}
    </>
  );
}
