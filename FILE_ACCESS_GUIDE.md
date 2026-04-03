# 📋 How to Use Uploaded Files in Agents

Now that you have file management functions in `queries.py`, here's how agents can access uploaded files:

---

## ✅ New Functions Available in queries.py

### 1. **Get All Files for an Agent**
```python
from analytics_agent.db.queries import get_files_by_agent_id

# Get all files uploaded for agent with ID 1
files = get_files_by_agent_id(agent_id=1)

# Returns:
# [
#     {
#         'id': 1,
#         'file_name': 'sales_data.csv',
#         'file_type': 'csv',
#         'file_size': 2048,
#         'storage_path': '/uploads/...',
#         'created_at': '2026-04-03T...'
#     },
#     ...
# ]
```

### 2. **Get All Files (Any Agent)**
```python
from analytics_agent.db.queries import get_files_from_db

# Get all files
all_files = get_files_from_db()

# Returns list of all file objects
```

### 3. **Get File by ID**
```python
from analytics_agent.db.queries import get_file_by_id

# Get specific file
file = get_file_by_id(file_id=5)

# Returns file metadata or None
```

### 4. **Read CSV File Content**
```python
from analytics_agent.db.queries import read_csv_file_content

# Read CSV content into DataFrame
df = read_csv_file_content(file_path='/uploads/sales_data.csv')

# Use the DataFrame
print(df.head())
```

### 5. **Get Files as DataFrame**
```python
from analytics_agent.db.queries import get_files_dataframe

# Get metadata of all files for agent
files_df = get_files_dataframe(agent_id=1)

# DataFrame with columns: id, file_name, file_type, file_size, storage_path, created_at
```

### 6. **Get File Metadata for Agent**
```python
from analytics_agent.db.queries import get_file_metadata_for_agent

# Get simplified metadata
metadata = get_file_metadata_for_agent(agent_id=1)

# Returns:
# [
#     {
#         'id': 1,
#         'name': 'sales_data.csv',
#         'type': 'csv',
#         'size': 2048,
#         'path': '/uploads/...',
#         'uploaded_at': '2026-04-03T...'
#     }
# ]
```

### 7. **Get All Agent-File Associations**
```python
from analytics_agent.db.queries import get_all_agent_file_associations

# Get mapping of all agents to their files
mapping = get_all_agent_file_associations()

# Returns:
# {
#     1: [{'id': 1, 'file_name': '...', ...}],
#     2: [{'id': 2, 'file_name': '...', ...}],
#     ...
# }
```

---

## 🎯 Example: Using Files in an Agent

### Example Agent Node
```python
from analytics_agent.db.queries import (
    get_files_by_agent_id,
    read_csv_file_content,
    get_campaign_dataframe
)
import pandas as pd

def custom_analysis_node(state: AnalyticsState) -> dict:
    """Agent node that uses both Supabase data and uploaded files."""
    
    agent_id = 1
    
    # 1. Get uploaded files for this agent
    files = get_files_by_agent_id(agent_id)
    print(f"Available files: {len(files)}")
    
    # 2. Read file content if CSV available
    if files:
        first_file = files[0]
        if first_file['file_type'] == 'csv':
            file_df = read_csv_file_content(first_file['storage_path'])
            print(f"Loaded file with {len(file_df)} rows")
    
    # 3. Also get Supabase data
    campaign_df = get_campaign_dataframe()
    
    # 4. Combine and analyze
    combined_data = {
        'user_files': files,
        'file_data': file_df if 'file_df' in locals() else None,
        'supabase_data': campaign_df
    }
    
    return combined_data
```

---

## 📊 Frontend Integration

When user uploads file in UI:
```
User clicks "Upload File" in Agent Workspace
    ↓
File uploaded to Supabase storage
    ↓
File metadata stored in `files` table
    ↓
File associated with agent in `agent_file_association` table
    ↓
Agent can now query using get_files_by_agent_id()
```

---

## 🔄 Complete Workflow

1. **User uploads file** via knowledge base modal
   - File saved to storage
   - Metadata saved to database

2. **Agent queries the files**
   ```python
   files = get_files_by_agent_id(agent_id=1)
   ```

3. **Agent reads file content**
   ```python
   df = read_csv_file_content(files[0]['storage_path'])
   ```

4. **Agent uses data in analysis**
   - Combine with Supabase data
   - Perform analysis
   - Return results

---

## ⚠️ Important Notes

1. **File Path**: The `storage_path` is where the file is stored. Make sure the path is accessible to your Python code.

2. **CSV Only**: The `read_csv_file_content()` function assumes CSV format. For other formats (Excel, JSON), you'll need similar functions.

3. **File Size**: Files are limited to prevent storage issues. Check `file_size` before reading.

4. **Agent Association**: Files are associated with agents via the `agent_file_association` table.

---

## 🚀 Now Your Agents Can:

✅ See what files users uploaded
✅ Access file metadata
✅ Read file content
✅ Combine with Supabase data
✅ Use in analysis

All through the `queries.py` functions!

---

**Usage Summary:**
```python
# In any agent node:
from analytics_agent.db.queries import get_files_by_agent_id, read_csv_file_content

files = get_files_by_agent_id(agent_id)
for file in files:
    data = read_csv_file_content(file['storage_path'])
    # Use data in analysis
```

Done! Files are now accessible from queries.py 🎉

