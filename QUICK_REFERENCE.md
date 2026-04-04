# Quick Reference Guide - Knowledge Base Features

## 🚀 Getting Started (2 Minutes)

### Terminal 1: Start Backend
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting\analytics_agent\api
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8001
```

Wait for: `Uvicorn running on http://0.0.0.0:8001`

### Terminal 2: Start Frontend
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting\frontend
npm run dev
```

Wait for: `Local: http://localhost:5173`

### Browser
Open: `http://localhost:5173`

## 📂 File Upload (30 Seconds)

1. **Click "Upload File"** button on Dashboard
2. **Select file** by clicking or drag & drop
   - Supported: PDF, CSV, TXT, MD, JSON
   - Max size: 5MB
3. **Click "Upload File"** button
4. ✅ Done! File is saved

**Where files go:**
- Disk: `uploads/agent_1/{timestamp}_{filename}`
- Database: `analytics_agent.db`

## 🗂️ View Knowledge Base (20 Seconds)

1. **Click "Knowledge Base"** button (violet button in header)
2. **See all files** with:
   - File name
   - File size (formatted: KB, MB)
   - Upload date
3. **Click a file** to select it (checkbox highlights)
4. **Button shows** "Use: {filename}"
5. ✅ File is ready to use in analytics

## 🗑️ Delete File (15 Seconds)

1. **Open Knowledge Base** (click button)
2. **Hover over file** you want to delete
3. **Click trash icon** (🗑️) on the right
4. **Confirm deletion** in popup
5. ✅ File removed from list and storage

## 📊 Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Knowledge Base | Click button |
| Upload File | Dashboard button |
| Select File | Click checkbox |
| Delete File | Click trash icon |
| Close Modal | Click X or Cancel |

## 🎨 UI Elements

### Modal Layouts

**Knowledge Base Modal**
```
┌─────────────────────────────┐
│ Knowledge Base        [✕]    │
│ Select a file to use as...  │
├─────────────────────────────┤
│ ☐ file1.pdf  2.5 MB 4/1/26 │
│ ☐ file2.csv  1.2 MB 4/2/26 │
│ ☐ file3.txt  0.5 MB 4/3/26 │
├─────────────────────────────┤
│           [Cancel] [Use File]│
└─────────────────────────────┘
```

**Upload Modal**
```
┌─────────────────────────────┐
│ Upload File           [✕]    │
│ Add a new file to the...    │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │  📄 file.pdf selected │  │
│  │     0.8 KB            │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│           [Cancel] [Upload]  │
└─────────────────────────────┘
```

## 🎯 Common Tasks

### Task: Upload Multiple Files
1. Click "Upload File"
2. Upload first file
3. Click "Upload File" again
4. Upload second file
5. Repeat as needed

### Task: Switch Between Files
1. Open Knowledge Base
2. Click first file (select)
3. Use it for analysis
4. Open Knowledge Base again
5. Click different file (select)
6. Use for new analysis

### Task: Clean Up Old Files
1. Open Knowledge Base
2. Scroll through list
3. Click trash icon on unwanted files
4. Confirm each deletion
5. Done!

### Task: Check File Storage
Files stored at:
```
C:\Users\karan\PycharmProjects\Analytics-and-forecasting\
└── uploads/
    └── agent_1/
        ├── 20260403_120000_report.pdf
        ├── 20260403_121530_data.csv
        └── 20260403_130000_notes.txt
```

## 🔧 Troubleshooting

### Backend Won't Start
```
Error: Module not found
→ Run: pip install -r requirements.txt
```

### Frontend Won't Start
```
Error: Cannot find module
→ Run: npm install
→ Run: npm run dev
```

### Upload Fails
```
Error: File too large
→ Use file under 5MB
→ Try: PDF, CSV, TXT, MD, JSON only
```

### Files Not Showing
```
Error: List is empty
→ Upload a file first
→ Check browser console (F12)
→ Check backend terminal
```

### Modal Won't Close
```
Error: Modal stuck open
→ Press Escape key
→ Refresh page (F5)
→ Check browser console
```

## 📱 Browser Support

✅ **Fully Supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

✅ **Mobile Support:**
- iOS Safari
- Android Chrome
- Responsive design

## 🔒 Security Notes

✅ **Safe to use:**
- Files validated on backend
- Only allowed types: PDF, CSV, TXT, MD, JSON
- Size limit: 5MB (prevents abuse)
- Database encryption: Configure in production
- No automatic sharing (private to agent)

⚠️ **Recommendations:**
- Don't store sensitive passwords in files
- Review files before uploading
- Regular backups of database
- Monitor disk space in `uploads/` folder

## 📊 API Endpoints (For Developers)

### Upload File
```bash
curl -X POST "http://localhost:8001/api/agents/1/files" \
  -F "file=@report.pdf"
```

### List Files
```bash
curl "http://localhost:8001/api/agents/1/files"
```

### Delete File
```bash
curl -X DELETE "http://localhost:8001/api/files/1"
```

## 📈 Performance Tips

1. **Large files** - Break into smaller chunks
2. **Many files** - Archive old ones
3. **Disk space** - Monitor `uploads/` folder
4. **Database** - Clear old entries periodically
5. **Network** - Upload during off-peak hours

## 🎓 Learning Resources

### Documentation Files
- `KNOWLEDGE_BASE_QUICKSTART.md` - Start here
- `KNOWLEDGE_BASE_IMPLEMENTATION.md` - Technical details
- `ARCHITECTURE_DIAGRAMS.md` - How it works
- `DEPLOYMENT_READY.md` - Production checklist

### Code Files
- Backend: `analytics_agent/api/file_handler.py`
- API: `analytics_agent/api/app.py`
- Frontend: `frontend/src/context/KnowledgeBaseContext.tsx`
- Components: `frontend/src/components/knowledge/`

## 💡 Pro Tips

1. **Name files clearly** - Include date: `2026-04-03_report.pdf`
2. **Upload once** - No need to re-upload same file
3. **Select before use** - Always select file before analytics
4. **Delete when done** - Clean up old files to save space
5. **Backup important files** - Keep copy outside system

## ✅ Quality Checklist

Before uploading important data:
- [x] File is under 5MB
- [x] File is PDF, CSV, TXT, MD, or JSON
- [x] No sensitive passwords in file
- [x] File name is clear and descriptive
- [x] You have backup copy elsewhere

## 🆘 Quick Help

**Q: How do I upload a file?**
A: Click "Upload File" button on dashboard

**Q: Where are my files stored?**
A: In `uploads/agent_1/` folder on disk + database

**Q: Can I upload images?**
A: No, only PDF, CSV, TXT, MD, JSON

**Q: What's the file size limit?**
A: 5MB maximum

**Q: Can I share files?**
A: Not built-in. Copy from `uploads/` folder to share

**Q: How do I delete a file?**
A: Click trash icon next to file in Knowledge Base

**Q: Can I recover deleted files?**
A: No, deletion is permanent. Keep backups!

**Q: What if upload fails?**
A: Check file type and size, check browser console

## 📞 Support

Need help? Check:
1. Browser console (F12) for errors
2. Backend terminal for error messages
3. Documentation files included
4. This quick reference guide

---

**Happy analyzing with your knowledge base! 📚🚀**

Last updated: April 3, 2026

