import os
import uuid
import base64
import json
import hashlib
import logging
import shutil
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

try:
    from .config import STORAGE_DIR, HOST, PORT
    from .database import connect_to_mongo, close_mongo_connection, get_database
except ImportError:
    from config import STORAGE_DIR, HOST, PORT
    from database import connect_to_mongo, close_mongo_connection, get_database

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Ensure storage directory exists
os.makedirs(STORAGE_DIR, exist_ok=True)

app = FastAPI(title="Visual Data Pipeline API", version="0.2.0")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve storage folder statically so frontend can access images
app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

# ───────────────────────────────────────────────────────────
# Pydantic Schemas
# ───────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    startUrl: str

class SessionResponse(BaseModel):
    id: str
    createdAt: str
    startUrl: str

class CaptureMetadata(BaseModel):
    resolution: Optional[dict] = None        # {"width": 1920, "height": 1080}
    scale: Optional[float] = None
    quality: Optional[int] = None
    outputSize: Optional[dict] = None        # {"width": 960, "height": 540}
    fileSizeBytes: Optional[int] = None
    isDuplicate: Optional[bool] = False
    perceptualHash: Optional[str] = None

class AnalysisStub(BaseModel):
    status: str = "pending"
    extractedData: Optional[dict] = None
    analyzedAt: Optional[str] = None

class ScreenshotResponse(BaseModel):
    id: str
    sessionId: str
    timestamp: str
    url: str
    imagePath: str
    capture: Optional[dict] = None
    analysis: Optional[dict] = None

# ───────────────────────────────────────────────────────────
# Lifecycle Events
# ───────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

# ───────────────────────────────────────────────────────────
# REST Endpoints
# ───────────────────────────────────────────────────────────

@app.post("/sessions", response_model=SessionResponse)
async def create_session(session_data: SessionCreate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection not available")
    
    session_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat() + "Z"
    
    new_session = {
        "_id": session_id,
        "createdAt": created_at,
        "startUrl": session_data.startUrl
    }
    
    try:
        await db.sessions.insert_one(new_session)
        # Create session directory in storage
        session_storage_dir = os.path.join(STORAGE_DIR, session_id)
        os.makedirs(session_storage_dir, exist_ok=True)
        
        logger.info(f"Created new session: {session_id} for URL {session_data.startUrl}")
        return SessionResponse(
            id=session_id,
            createdAt=created_at,
            startUrl=session_data.startUrl
        )
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions", response_model=List[SessionResponse])
async def list_sessions():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection not available")
    
    try:
        cursor = db.sessions.find().sort("createdAt", -1)
        sessions = []
        async for doc in cursor:
            sessions.append(SessionResponse(
                id=doc["_id"],
                createdAt=doc["createdAt"],
                startUrl=doc["startUrl"]
            ))
        return sessions
    except Exception as e:
        logger.error(f"Error listing sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sessions/{sessionId}")
async def delete_session(sessionId: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection not available")
    
    try:
        session = await db.sessions.find_one({"_id": sessionId})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # 1. Delete associated screenshots from MongoDB
        screenshots_result = await db.screenshots.delete_many({"sessionId": sessionId})
        
        # 2. Delete session document from MongoDB
        await db.sessions.delete_one({"_id": sessionId})
        
        # 3. Delete session storage directory and images from disk
        session_storage_dir = os.path.join(STORAGE_DIR, sessionId)
        if os.path.exists(session_storage_dir):
            shutil.rmtree(session_storage_dir, ignore_errors=True)
            
        logger.info(f"Deleted session {sessionId}: removed {screenshots_result.deleted_count} screenshot records and storage directory")
        return {
            "status": "success",
            "message": f"Session {sessionId} and associated data deleted successfully",
            "deletedScreenshots": screenshots_result.deleted_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session {sessionId}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/screenshots/{sessionId}", response_model=List[ScreenshotResponse])
async def get_screenshots(sessionId: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection not available")
    
    try:
        cursor = db.screenshots.find({"sessionId": sessionId}).sort("timestamp", 1)
        screenshots = []
        async for doc in cursor:
            screenshots.append(ScreenshotResponse(
                id=doc["_id"],
                sessionId=doc["sessionId"],
                timestamp=doc["timestamp"],
                url=doc["url"],
                imagePath=doc["imagePath"],
                capture=doc.get("capture"),
                analysis=doc.get("analysis"),
            ))
        return screenshots
    except Exception as e:
        logger.error(f"Error fetching screenshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ───────────────────────────────────────────────────────────
# Utility Functions
# ───────────────────────────────────────────────────────────

def compute_image_hash(image_bytes: bytes) -> str:
    """Compute a quick hash for deduplication of stored images."""
    return hashlib.md5(image_bytes).hexdigest()

# ───────────────────────────────────────────────────────────
# WebSocket Endpoint — Supports both binary and base64 modes
# ───────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established")
    db = get_database()
    
    # Buffer for batch inserts
    screenshot_buffer = []
    BATCH_SIZE = 10
    
    async def flush_buffer():
        nonlocal screenshot_buffer
        if screenshot_buffer:
            try:
                await db.screenshots.insert_many(screenshot_buffer)
                logger.info(f"Batch inserted {len(screenshot_buffer)} screenshots")
                screenshot_buffer = []
            except Exception as e:
                logger.error(f"Error in batch insert: {e}")
                # Fallback: insert one by one
                for record in screenshot_buffer:
                    try:
                        await db.screenshots.insert_one(record)
                    except Exception as inner_e:
                        logger.error(f"Individual insert also failed: {inner_e}")
                screenshot_buffer = []
    
    try:
        while True:
            # Receive the metadata JSON message
            raw_message = await websocket.receive()
            
            # Determine message type (binary or text)
            if "bytes" in raw_message and raw_message["bytes"]:
                # Binary protocol: first receive was binary — unexpected, skip
                logger.warning("Received unexpected binary message first. Skipping.")
                continue
            
            if "text" not in raw_message or not raw_message["text"]:
                continue
                
            data = json.loads(raw_message["text"])
            
            session_id = data.get("sessionId")
            timestamp = data.get("timestamp") or datetime.utcnow().isoformat() + "Z"
            url = data.get("url") or ""
            capture_meta = data.get("capture")  # Enriched capture metadata
            
            # Check if image is included inline (base64) or will arrive as next binary message
            image_data = data.get("image")
            send_binary = data.get("binaryFollows", False)
            
            if not session_id:
                await websocket.send_json({"status": "error", "message": "Missing sessionId"})
                continue
                
            if db is None:
                await websocket.send_json({"status": "error", "message": "Database not available"})
                continue
            
            try:
                image_bytes = None
                
                if send_binary:
                    # Binary mode: image arrives as next WebSocket message
                    binary_msg = await websocket.receive()
                    if "bytes" in binary_msg and binary_msg["bytes"]:
                        image_bytes = binary_msg["bytes"]
                    else:
                        await websocket.send_json({"status": "error", "message": "Expected binary image data"})
                        continue
                elif image_data:
                    # Legacy base64 mode (backward compatibility)
                    if "," in image_data:
                        image_data = image_data.split(",")[1]
                    image_bytes = base64.b64decode(image_data)
                else:
                    await websocket.send_json({"status": "error", "message": "No image data provided"})
                    continue
                
                # Determine screenshot filename based on sequence index
                sequence = data.get("sequence")
                if sequence is not None:
                    next_index = int(sequence)
                    filename = f"{next_index:06d}.jpg"
                else:
                    # Fallback to counting documents (backward compatibility)
                    count = await db.screenshots.count_documents({"sessionId": session_id})
                    next_index = count + 1
                    filename = f"{next_index:06d}.jpg"
                
                # File paths
                relative_path = f"{session_id}/{filename}"
                absolute_path = os.path.join(STORAGE_DIR, session_id, filename)
                
                # Ensure the folder exists (safety fallback)
                os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
                
                # Compute hash for deduplication
                image_hash = compute_image_hash(image_bytes)
                
                # Save image to disk
                with open(absolute_path, 'wb') as f:
                    f.write(image_bytes)
                
                # Build enriched screenshot record
                screenshot_id = str(uuid.uuid4())
                screenshot_record = {
                    "_id": screenshot_id,
                    "sessionId": session_id,
                    "timestamp": timestamp,
                    "url": url,
                    "imagePath": f"/storage/{relative_path}",
                    "capture": {
                        "resolution": capture_meta.get("resolution") if capture_meta else None,
                        "scale": capture_meta.get("scale") if capture_meta else None,
                        "quality": capture_meta.get("quality") if capture_meta else None,
                        "outputSize": capture_meta.get("outputSize") if capture_meta else None,
                        "fileSizeBytes": len(image_bytes),
                        "isDuplicate": False,
                        "perceptualHash": image_hash,
                    },
                    "analysis": {
                        "status": "pending",
                        "extractedData": None,
                        "analyzedAt": None,
                    },
                }
                
                # Add to batch buffer
                screenshot_buffer.append(screenshot_record)
                
                # Flush buffer if batch size reached
                if len(screenshot_buffer) >= BATCH_SIZE:
                    await flush_buffer()
                
                # Acknowledge receipt
                await websocket.send_json({
                    "status": "ok",
                    "screenshotId": screenshot_id,
                    "filename": filename,
                    "count": next_index,
                    "fileSizeBytes": len(image_bytes),
                })
                logger.info(f"Saved screenshot {filename} for session {session_id} ({len(image_bytes)} bytes)")
                
            except Exception as e:
                logger.error(f"Error processing screenshot frame: {e}")
                await websocket.send_json({"status": "error", "message": str(e)})
                
    except WebSocketDisconnect:
        # Flush any remaining buffer on disconnect
        if screenshot_buffer:
            await flush_buffer()
        logger.info("WebSocket client disconnected")
    except Exception as e:
        # Flush buffer on error too
        if screenshot_buffer:
            await flush_buffer()
        logger.error(f"WebSocket server error: {e}")

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting server on {HOST}:{PORT}")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
