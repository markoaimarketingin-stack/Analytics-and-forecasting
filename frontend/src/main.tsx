import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { KnowledgeBaseProvider } from './context/KnowledgeBaseContext.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KnowledgeBaseProvider>
      <App />
    </KnowledgeBaseProvider>
  </React.StrictMode>
);

