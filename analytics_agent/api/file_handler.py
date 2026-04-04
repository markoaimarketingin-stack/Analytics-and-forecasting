"""
File handling module for managing file uploads and storage.
Includes validation, storage management, and metadata extraction.
"""
import os
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import UploadFile, HTTPException
from analytics_agent.logging_config import get_logger

logger = get_logger(__name__)

# Configuration
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".csv", ".json"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


class FileHandler:
    """Handles file uploads, validation, and storage."""

    @staticmethod
    def ensure_upload_directory():
        """Create upload directory if it doesn't exist."""
        try:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            logger.info("Upload directory ensured", path=str(UPLOAD_DIR))
        except Exception as e:
            logger.error("Failed to create upload directory", error=str(e))
            raise

    @staticmethod
    def validate_file(file: UploadFile) -> bool:
        """
        Validate file extension and size.
        
        Args:
            file: The uploaded file
            
        Returns:
            bool: True if valid, raises HTTPException if not
            
        Raises:
            HTTPException: If file is invalid
        """
        # Check file extension
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        logger.debug("File validated successfully", filename=file.filename)
        return True

    @staticmethod
    async def save_file(file: UploadFile, agent_id: int) -> Dict[str, Any]:
        """
        Save uploaded file to disk.
        
        Args:
            file: The uploaded file
            agent_id: The agent ID for organizational purposes
            
        Returns:
            dict: File metadata including path and details
            
        Raises:
            HTTPException: If save fails or file is invalid
        """
        try:
            # Validate file
            FileHandler.validate_file(file)
            
            # Ensure directory exists
            FileHandler.ensure_upload_directory()
            
            # Create agent-specific subdirectory
            agent_dir = UPLOAD_DIR / f"agent_{agent_id}"
            agent_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate unique filename to avoid conflicts
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_")
            filename = timestamp + (file.filename or "unknown_file")
            file_path = agent_dir / filename
            
            # Read file content and check size
            content = await file.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File size exceeds {MAX_FILE_SIZE / 1024 / 1024:.0f}MB limit"
                )
            
            # Save file to disk
            with open(file_path, "wb") as f:
                f.write(content)
            
            logger.info(
                "File saved successfully",
                filename=filename,
                path=str(file_path),
                size=len(content),
                agent_id=agent_id
            )
            
            return {
                "file_name": file.filename,
                "file_type": Path(file.filename).suffix.lower(),
                "file_size": len(content),
                "storage_path": str(file_path),
                "created_at": datetime.utcnow().isoformat(),
            }
        
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to save file", error=str(e), filename=file.filename)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save file: {str(e)}"
            )

    @staticmethod
    def delete_file(storage_path: str) -> bool:
        """
        Delete a file from storage.
        
        Args:
            storage_path: The path to the file to delete
            
        Returns:
            bool: True if deleted successfully
            
        Raises:
            HTTPException: If deletion fails
        """
        try:
            path = Path(storage_path)
            if path.exists():
                path.unlink()
                logger.info("File deleted successfully", path=storage_path)
                return True
            else:
                logger.warning("File not found for deletion", path=storage_path)
                return False
        except Exception as e:
            logger.error("Failed to delete file", error=str(e), path=storage_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete file: {str(e)}"
            )

    @staticmethod
    def get_file_content(storage_path: str) -> str:
        """
        Read file content from storage.
        
        Args:
            storage_path: The path to the file
            
        Returns:
            str: File content
            
        Raises:
            HTTPException: If file cannot be read
        """
        try:
            path = Path(storage_path)
            if not path.exists():
                raise HTTPException(status_code=404, detail="File not found")
            
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            
            logger.debug("File content retrieved", path=storage_path)
            return content
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to read file", error=str(e), path=storage_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to read file: {str(e)}"
            )

    @staticmethod
    def extract_file_preview(storage_path: str, lines: int = 5) -> str:
        """
        Extract first few lines of a file as preview.
        
        Args:
            storage_path: The path to the file
            lines: Number of lines to extract
            
        Returns:
            str: Preview of file content
        """
        try:
            path = Path(storage_path)
            if not path.exists():
                return ""
            
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                preview_lines = [f.readline() for _ in range(lines)]
            
            return "".join(preview_lines).strip()
        except Exception as e:
            logger.warning("Failed to extract preview", error=str(e), path=storage_path)
            return ""

