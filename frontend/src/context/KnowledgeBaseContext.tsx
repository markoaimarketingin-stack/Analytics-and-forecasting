import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  ReactNode,
} from 'react';
import { getAgentFiles, uploadAgentFile, deleteAgentFile } from '../services/api';
import type { File as AgentFile } from '../types';

interface KnowledgeBaseContextType {
  isKnowledgeModalOpen: boolean;
  isUploadModalOpen: boolean;
  isDatasetSelectionModalOpen: boolean;
  files: AgentFile[];
  isLoading: boolean;
  error: string | null;
  selectedFile: AgentFile | null;
  selectedDatasets: string[];
  currentAgentId: number;
  openKnowledgeModal: (agentId?: number) => void;
  closeKnowledgeModal: () => void;
  openUploadModal: (agentId?: number) => void;
  closeUploadModal: () => void;
  openDatasetSelectionModal: () => void;
  closeDatasetSelectionModal: () => void;
  uploadFile: (file: File) => Promise<void>;
  fetchFiles: (agentId?: number) => void;
  selectFile: (file: AgentFile) => void;
  deselectFile: () => void;
  deleteFile: (fileId: number) => Promise<void>;
  setSelectedDatasets: (datasets: string[]) => void;
  setCurrentAgentId: (agentId: number) => void;
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
  const [isDatasetSelectionModalOpen, setIsDatasetSelectionModalOpen] = useState(false);
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<AgentFile | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<number>(1);
  const [selectedDatasets, setSelectedDatasetsState] = useState<string[]>(() => {
    // Load from localStorage on mount
    const stored = localStorage.getItem('selectedDatasets');
    return stored ? JSON.parse(stored) : [];
  });

  const fetchFiles = useCallback(async (agentId?: number) => {
    const idToUse = agentId || currentAgentId;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAgentFiles(idToUse);
      setFiles(response.files || []);
    } catch (err) {
      setError('Failed to fetch files.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentAgentId]);

  const openKnowledgeModal = useCallback((agentId?: number) => {
    if (agentId !== undefined) {
      setCurrentAgentId(agentId);
      fetchFiles(agentId);
    } else {
      fetchFiles();
    }
    setIsKnowledgeModalOpen(true);
  }, [fetchFiles]);

  const closeKnowledgeModal = () => {
    setIsKnowledgeModalOpen(false);
    setSelectedFile(null);
  };

  const openUploadModal = (agentId?: number) => {
    if (agentId !== undefined) {
      setCurrentAgentId(agentId);
    }
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
  };

  const openDatasetSelectionModal = () => {
    setIsDatasetSelectionModalOpen(true);
  };

  const closeDatasetSelectionModal = () => {
    setIsDatasetSelectionModalOpen(false);
  };

  const setSelectedDatasets = (datasets: string[]) => {
    setSelectedDatasetsState(datasets);
    localStorage.setItem('selectedDatasets', JSON.stringify(datasets));
  };

  const uploadFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      await uploadAgentFile(file, currentAgentId);
      // After successful upload, refresh the file list
      await fetchFiles(currentAgentId);
      // Close upload modal
      closeUploadModal();
    } catch (err) {
      setError('Failed to upload file.');
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const selectFile = (file: AgentFile) => {
    setSelectedFile(file);
  };

  const deselectFile = () => {
    setSelectedFile(null);
  };

  const deleteFile = async (fileId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      await deleteAgentFile(fileId);
      // Refresh file list after deletion
      await fetchFiles();
      // Clear selection if deleted file was selected
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
      }
    } catch (err) {
      setError('Failed to delete file.');
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    isKnowledgeModalOpen,
    isUploadModalOpen,
    isDatasetSelectionModalOpen,
    files,
    isLoading,
    error,
    selectedFile,
    selectedDatasets,
    currentAgentId,
    openKnowledgeModal,
    closeKnowledgeModal,
    openUploadModal,
    closeUploadModal,
    openDatasetSelectionModal,
    closeDatasetSelectionModal,
    uploadFile,
    fetchFiles,
    selectFile,
    deselectFile,
    deleteFile,
    setSelectedDatasets,
    setCurrentAgentId,
  };

  return (
    <KnowledgeBaseContext.Provider value={value}>
      {children}
    </KnowledgeBaseContext.Provider>
  );
};
