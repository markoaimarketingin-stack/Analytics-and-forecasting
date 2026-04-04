# Quick Start Guide - Knowledge Base Feature

## Backend Setup

### 1. Install Dependencies
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting
pip install -r requirements.txt
```

The new dependency has been added:
- `python-multipart>=0.0.6` - For file upload handling

### 2. Start the Backend Server
```bash
cd analytics_agent/api
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8001
```

You should see:
```
Uvicorn running on http://0.0.0.0:8001
```

### 3. Verify Backend is Running
Visit: `http://localhost:8001/api`

You should see the API root response with all available endpoints.

## Frontend Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start the Frontend Dev Server
```bash
npm run dev
```

You should see:
```
Local: http://localhost:5173
```

## Using the Features

### 📂 Knowledge Base / Use Existing Data

1. Click the **"Knowledge Base"** button in the header (violet button)
2. The "Existing Files" modal opens
3. Initially shows "No files found"
4. Upload files first (see below)
5. Once uploaded, files appear in the list with:
   - File name
   - File size (in KB/MB)
   - Upload date
6. Click a file to select it (checkbox highlights in blue)
7. Click **"Use Selected File"** button to confirm
8. Selected file is now available for analytics

### ⬆️ Upload File

1. **Method 1:** Click the **"Upload File"** button on dashboard
2. **Method 2:** Open Knowledge Base modal and manually open upload dialog
3. The "Upload File" modal opens
4. Either:
   - Click the upload area to browse for file
   - Drag & drop a file onto the area
5. Selected file shows with:
   - File icon
   - File name
   - File size in KB
6. Click **"Upload File"** button
7. File uploads and saves to local database
8. Success! File now appears in Knowledge Base list

### 🗑️ Delete File

1. Open Knowledge Base modal
2. Hover over a file in the list
3. A trash icon (🗑️) appears on the right
4. Click the trash icon
5. Confirmation dialog appears
6. Click "OK" to confirm deletion
7. File is removed from storage and database
8. Reappears in list after refresh

## File Types Supported

✅ **Allowed:**
- `.pdf` - PDF documents
- `.txt` - Text files
- `.md` - Markdown files
- `.csv` - CSV data files
- `.json` - JSON data files

❌ **Not Allowed:**
- `.exe`, `.dll` (executables)
- `.zip` (archives)
- `.doc`, `.docx` (requires conversion)
- Any other format

## File Size Limits

- **Max file size:** 5 MB
- If file exceeds limit, you'll see error: "File size exceeds 5MB limit"

## File Storage Location

Files are stored at:
```
C:\Users\karan\PycharmProjects\Analytics-and-forecasting\uploads\
```

With structure:
```
uploads/
├── agent_1/
│   ├── 20260403_120000_document.pdf
│   ├── 20260403_120530_data.csv
│   └── 20260403_121000_report.txt
```

**Filename format:** `{YYYYMMDD}_{HHMMSS}_{original_filename}`

This prevents filename conflicts and tracks upload time.

## Database

Files are stored in SQLite database at:
```
analytics_agent.db
```

Tables used:
- `agents` - Agent records
- `files` - File metadata
- `agent_file_association` - Links agents to files

You can browse the database using:
- DB Browser for SQLite (GUI)
- SQLAlchemy ORM (Python)
- Any SQLite viewer

## Troubleshooting

### Backend Issues

**Error: "Failed to initialize services"**
- Make sure all Python dependencies are installed: `pip install -r requirements.txt`
- Check Python version is 3.9+

**Error: "Upload directory permission denied"**
- Ensure you have write permissions to the project folder
- Try running terminal as Administrator

**Error: "Module not found: analytics_agent"**
- Make sure you're running from the correct directory
- The Python path should include the project root

### Frontend Issues

**Error: "Cannot find module 'lucide-react'"**
- Run `npm install` in the frontend directory
- Delete `node_modules` and run `npm install` again

**Error: "API call failed"**
- Check backend is running on `http://localhost:8001`
- Check browser console for details
- Verify CORS is enabled (it is by default)

**Modals don't appear**
- Check browser console for JavaScript errors
- Make sure modals are rendered in App.tsx
- Verify KnowledgeBaseProvider wraps the app

### Common Issues

**Upload takes very long**
- Check file size (should be under 5MB)
- Check internet connection
- Check backend logs for errors

**Files don't appear after upload**
- Refresh the page
- Open Knowledge Base modal again
- Check browser console for errors
- Check backend logs

**Delete button doesn't work**
- Make sure you're not offline
- Check browser console for errors
- Verify backend is running

## API Endpoints

If you want to test the API directly:

### Upload File
```bash
curl -X POST "http://localhost:8001/api/agents/1/files" \
  -F "file=@/path/to/file.pdf"
```

### List Files
```bash
curl "http://localhost:8001/api/agents/1/files"
```

### Get File
```bash
curl "http://localhost:8001/api/files/1"
```

### Delete File
```bash
curl -X DELETE "http://localhost:8001/api/files/1"
```

## What's New

✅ **Backend:**
- New file handler module with validation
- 4 new API endpoints
- Database integration for file storage
- File size & type validation
- Error handling & logging

✅ **Frontend:**
- Enhanced Knowledge Base context
- Redesigned modal UIs
- File selection functionality
- File deletion with confirmation
- Drag & drop support
- Proper error/loading states

✅ **Styling:**
- Consistent modal design
- Icon integration (lucide-react)
- Loading spinners
- Empty states
- Error messages

## Next Steps

Once you have files uploaded, you can:

1. Use them in analytics by referencing them in chat
2. Build context-aware analysis using file contents
3. Compare data from multiple files
4. Generate reports based on uploaded data

For more details, see `KNOWLEDGE_BASE_IMPLEMENTATION.md`

