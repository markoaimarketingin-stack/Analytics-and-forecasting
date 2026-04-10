import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { KnowledgeBaseProvider } from './context/KnowledgeBaseContext.tsx';
import AuthGateway from './components/auth/AuthGateway.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KnowledgeBaseProvider>
      <AuthGateway />
    </KnowledgeBaseProvider>
  </React.StrictMode>
);

