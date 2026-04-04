import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  ReactNode,
} from 'react';
import { getAgentFiles, uploadAgentFile } from '../services/api';
import type { File as AgentFile } from '../types';

interface KnowledgeBaseContextType {
  isKnowledgeModalOpen: boolean;
  isUploadModalOpen: boolean;
  files: AgentFile[];
  isLoading: boolean;
  error: string | null;
  openKnowledgeModal: () => void;
  closeKnowledgeModal: () => void;
  openUploadModal: () => void;
  closeUploadModal: () => void;
  uploadFile: (file: File) => Promise<void>;
  fetchFiles: () => void;
}

const KnowledgeBaseContext = createContext<KnowledgeBaseContextType | undefined>(
  undefined
);

export const useKnowledgeBase = () => {
  const context = useContext(KnowledgeBaseContext);
  if (!context) {
    throw new Error(
      'useKnowledgeBase must be used within a KnowledgeBaseProvider'
    );
  }
  return context;
};

interface KnowledgeBaseProviderProps {
  children: ReactNode;
}

export const KnowledgeBaseProvider = ({
  children,
}: KnowledgeBaseProviderProps) => {
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const agentFiles = await getAgentFiles();
      setFiles(agentFiles);
    } catch (err) {
      setError('Failed to fetch files.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openKnowledgeModal = useCallback(() => {
    fetchFiles();
    setIsKnowledgeModalOpen(true);
  }, [fetchFiles]);

  const closeKnowledgeModal = () => setIsKnowledgeModalOpen(false);

  const openUploadModal = () => setIsUploadModalOpen(true);
  const closeUploadModal = () => setIsUploadModalOpen(false);

  const uploadFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      await uploadAgentFile(file);
      // After successful upload, refresh the file list
      await fetchFiles();
      // Switch to the knowledge modal to show the newly uploaded file
      closeUploadModal();
      // We don't automatically open the knowledge modal anymore, to give user control
      // openKnowledgeModal();
    } catch (err) {
      setError('Failed to upload file.');
      console.error(err);
      // Re-throw to allow the component to handle it if needed
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    isKnowledgeModalOpen,
    isUploadModalOpen,
    files,
    isLoading,
    error,
    openKnowledgeModal,
    closeKnowledgeModal,
    openUploadModal,
    closeUploadModal,
    uploadFile,
    fetchFiles,
  };

  return (
    <KnowledgeBaseContext.Provider value={value}>
      {children}
    </KnowledgeBaseContext.Provider>
  );
};
