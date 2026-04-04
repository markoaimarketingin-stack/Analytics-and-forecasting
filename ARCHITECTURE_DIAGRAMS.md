# System Architecture & Flow Diagrams

## File Upload Flow

```
User Browser                    FastAPI Backend                  File System
     |                               |                                |
     |-- Click "Upload File" ------->|                                |
     |                               |                                |
     |<------- Modal Opens -----------|                                |
     |                               |                                |
     |-- Select File / Drag & Drop -->|                                |
     |       (FormData)              |                                |
     |                               |-- Validate File ------->|       |
     |                               |<------ Valid ---------|       |
     |                               |                                |
     |                               |-- Save to Disk ------->|       |
     |                               |<------ Saved ----------|       |
     |                               |       (timestamp_filename.ext)
     |                               |                                |
     |                               |-- Create DB Record              |
     |                               |  (File model)                   |
     |                               |                                |
     |                               |-- Associate with Agent          |
     |                               |  (agent_file_association)      |
     |                               |                                |
     |<--- FileUploadResponse -------|                                |
     | (success, file, message)      |                                |
     |                               |                                |
     |-- Close Modal ------->|        |                                |
     |-- Refresh File List ->|        |                                |
     |       (GET)           |        |                                |
     |<----- File List ------<--------|                                |
     | (FilesListResponse)   |        |                                |
     |                       |        |                                |
     |-- Show in Knowledge Base       |                                |
```

## File Selection Flow

```
User Browser                    Knowledge Base Context           Backend
     |                               |                            |
     |-- Click Knowledge Base ------->|                            |
     |                               |                            |
     |<------- Modal Opens -----------|-- GET /agents/1/files ---->|
     |                               |                            |
     |                               |<------- File List ---------|
     |<------- Load Files -----------|                            |
     |     (with metadata)           |                            |
     |                               |                            |
     |-- Click a File ------->|       |                            |
     |  (selectFile)         |       |                            |
     |                       |-- Update selectedFile state       |
     |<------ Highlight -----<       |                            |
     |   (blue border)       |       |                            |
     |                       |-- Button shows "Use: filename"   |
     |                       |       |                            |
     |-- Click "Use Selected File" ->|                            |
     |  (Context has file data)      |                            |
     |<------ Modal Closes -----------|                            |
     |                               |                            |
     |-- Can now reference selected  |                            |
     |   file in chat/analysis        |                            |
```

## File Deletion Flow

```
User Browser                    Knowledge Base Context           Backend/Storage
     |                               |                            |
     |-- Click Delete Button ------->|                            |
     | (trash icon)                 |                            |
     |                               |                            |
     |<--- Confirmation Dialog ------<|                            |
     |   "Are you sure?"              |                            |
     |                               |                            |
     |-- Click Confirm ------->|      |                            |
     |                         |-- DELETE /api/files/{id} ------>|
     |                         |                                  |
     |                         |<---- Delete from Storage -------|
     |                         |      (delete file from disk)
     |                         |                                  |
     |                         |<---- Delete from DB ------------|
     |                         |      (delete File record)
     |                         |                                  |
     |<---- FileDeleteResponse <|                                  |
     | (success, message)      |                                  |
     |                         |                                  |
     |-- Refresh File List ---->|                                  |
     |<---- Updated List -------<|                                  |
     |                         |                                  |
     |-- Show removed file     |                                  |
     |   no longer in list     |                                  |
```

## Component Hierarchy

```
App
├── Header
│   └── "Knowledge Base" Button
│       └── Calls: openKnowledgeModal()
│
├── Dashboard
│   ├── "Use Existing Data" Button
│   │   └── Calls: openKnowledgeModal()
│   │
│   └── "Upload File" Button
│       └── Calls: openUploadModal()
│
├── ExistingFilesModal
│   ├── File List
│   │   └── File Items (clickable)
│   ├── Checkbox (select)
│   ├── Delete Button (trash icon)
│   ├── Loading Spinner
│   ├── Empty State
│   ├── Error Message
│   └── Action Buttons
│       ├── Cancel
│       └── Use Selected File
│
├── UploadFileModal
│   ├── Drop Zone (drag & drop)
│   ├── File Input (hidden)
│   ├── Selected File Display
│   ├── File Size
│   └── Action Buttons
│       ├── Cancel
│       └── Upload File
│
└── KnowledgeBaseProvider (Context)
    ├── State:
    │   ├── isKnowledgeModalOpen
    │   ├── isUploadModalOpen
    │   ├── files[]
    │   ├── selectedFile
    │   ├── isLoading
    │   └── error
    │
    └── Methods:
        ├── openKnowledgeModal()
        ├── closeKnowledgeModal()
        ├── openUploadModal()
        ├── closeUploadModal()
        ├── selectFile()
        ├── deselectFile()
        ├── uploadFile()
        ├── deleteFile()
        └── fetchFiles()
```

## Database Schema

```
agents (Table)
├── id (Primary Key)
├── name (String)
├── created_at (DateTime)
└── files[] (Many-to-Many through association)

files (Table)
├── id (Primary Key)
├── file_name (String)
├── file_type (String)
├── file_size (Integer)
├── storage_path (String) → File on disk
├── created_at (DateTime)
└── agents[] (Many-to-Many through association)

agent_file_association (Junction Table)
├── agent_id (Foreign Key → agents.id)
└── file_id (Foreign Key → files.id)
```

## API Endpoint Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  POST /api/agents/{agent_id}/files                          │
│  ├── Input: File (multipart/form-data)                      │
│  ├── Process:                                                │
│  │  1. Validate file (type, size)                           │
│  │  2. Save to disk                                         │
│  │  3. Create File record in DB                             │
│  │  4. Associate with Agent                                 │
│  └── Output: FileUploadResponse                             │
│                                                               │
│  GET /api/agents/{agent_id}/files                           │
│  ├── Input: agent_id (path parameter)                       │
│  ├── Process: Query all files for agent                     │
│  └── Output: FilesListResponse                              │
│                                                               │
│  GET /api/files/{file_id}                                   │
│  ├── Input: file_id (path parameter)                        │
│  ├── Process: Query file by ID                              │
│  └── Output: FileResponse                                   │
│                                                               │
│  DELETE /api/files/{file_id}                                │
│  ├── Input: file_id (path parameter)                        │
│  ├── Process:                                                │
│  │  1. Get file from DB                                     │
│  │  2. Delete file from disk                                │
│  │  3. Delete from DB                                       │
│  └── Output: FileDeleteResponse                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## File Storage Structure

```
C:\Users\karan\PycharmProjects\Analytics-and-forecasting\
├── uploads/
│   ├── agent_1/
│   │   ├── 20260403_120000_report.pdf
│   │   ├── 20260403_120530_data.csv
│   │   └── 20260403_121015_notes.txt
│   │
│   ├── agent_2/
│   │   ├── 20260403_125000_document.md
│   │   └── 20260403_130000_export.json
│   │
│   └── agent_3/
│       └── 20260403_135000_analysis.pdf
│
└── analytics_agent.db (SQLite Database)
```

## Data Flow - Complete User Journey

```
1. USER OPENS APP
   ├─ App.tsx mounts
   ├─ KnowledgeBaseProvider wraps app
   └─ Context is ready for all components

2. USER CLICKS "KNOWLEDGE BASE" BUTTON
   ├─ Header calls openKnowledgeModal()
   ├─ ExistingFilesModal opens
   ├─ Context calls fetchFiles()
   ├─ API: GET /api/agents/1/files
   └─ Modal displays file list

3. USER UPLOADS A FILE
   ├─ User clicks "Upload File" button
   ├─ UploadFileModal opens
   ├─ User selects/drags file
   ├─ User clicks "Upload File"
   ├─ Context calls uploadFile()
   ├─ API: POST /api/agents/1/files
   ├─ Backend:
   │  ├─ Validates file
   │  ├─ Saves to disk
   │  ├─ Creates DB record
   │  └─ Associates with agent
   ├─ Frontend:
   │  ├─ Shows success message
   │  ├─ Closes upload modal
   │  └─ Refreshes file list
   └─ File now visible in Knowledge Base

4. USER SELECTS FILE FOR USAGE
   ├─ User clicks file in Knowledge Base
   ├─ Context calls selectFile()
   ├─ State updates: selectedFile = file
   ├─ UI highlights selected file
   ├─ Button text changes: "Use: filename"
   ├─ User clicks "Use Selected File"
   ├─ Modal closes
   └─ File is now available for analytics

5. USER DELETES FILE
   ├─ User clicks delete (trash icon)
   ├─ Confirmation dialog appears
   ├─ User confirms deletion
   ├─ Context calls deleteFile()
   ├─ API: DELETE /api/files/{id}
   ├─ Backend:
   │  ├─ Deletes from disk
   │  └─ Deletes from DB
   ├─ Frontend:
   │  ├─ Shows success message
   │  └─ Refreshes file list
   └─ File removed from list

6. USER REFRESHES PAGE
   ├─ All files still available
   ├─ Data persisted in DB
   ├─ Files still on disk
   └─ Knowledge Base remembers everything
```

## Error Handling Flow

```
┌─────────────────────────┐
│  Invalid File Type      │
│  (.exe, .zip, etc.)     │
└────────────┬────────────┘
             │
      Validation Fails
             │
      400 Bad Request
             │
    Frontend Error State
             │
   Show: "File type not allowed"
   Ask:  "Try PDF, TXT, CSV, MD, JSON"

┌─────────────────────────┐
│  File Too Large         │
│  (> 5MB)                │
└────────────┬────────────┘
             │
      Validation Fails
             │
      413 Payload Too Large
             │
    Frontend Error State
             │
   Show: "File exceeds 5MB limit"

┌─────────────────────────┐
│  Database Error         │
│  (connection failed)    │
└────────────┬────────────┘
             │
      Backend Exception
             │
      500 Internal Server Error
             │
    Frontend Error State
             │
   Show: "Failed to save file"
   Log:  Full error in console

┌─────────────────────────┐
│  Network Error          │
│  (API unreachable)      │
└────────────┬────────────┘
             │
      Fetch Fails
             │
    Frontend Catch Block
             │
   Show: Error Message
   State: isLoading = false
```

## Performance Characteristics

```
File Upload:
├─ Validation:  O(1) - Just check extension and read size
├─ Save to disk: O(n) - Linear in file size
├─ DB insert:   O(1) - Single row insert
└─ Total:       O(n) where n = file size

File List:
├─ Agent lookup: O(1) - By ID index
├─ Load files:   O(m) - Where m = number of files
└─ Total:        O(m)

File Deletion:
├─ DB lookup:    O(1) - By ID index
├─ File delete:  O(1) - Single file removal
└─ Total:        O(1)

Memory Usage:
├─ Files in memory: Only when being uploaded
├─ Context state:   Small (just IDs and booleans)
├─ Modal DOM:       Minimal (hidden when closed)
└─ Total:           Very efficient
```

## Security Boundaries

```
Frontend (Browser)
├─ Input validation (file type check)
├─ UI state management
└─ User interaction handling
        │
        ▼ HTTP Request
        │ (FormData, JSON)
        │ (CORS validated)
        │
Backend (Python/FastAPI)
├─ File type validation (whitelist)
├─ File size validation (5MB limit)
├─ Path traversal prevention
├─ SQL injection prevention (ORM)
├─ Database access control
└─ Error message sanitization
        │
        ▼ Response
        │ (Safe JSON)
        │ (No sensitive info leaks)
        │
Frontend (Browser)
├─ Display results
└─ Handle errors gracefully
```

This architecture ensures:
- ✅ Clean separation of concerns
- ✅ Type safety (TypeScript + Python types)
- ✅ Error handling at each layer
- ✅ Security by design
- ✅ Performance optimized
- ✅ Scalable and maintainable

