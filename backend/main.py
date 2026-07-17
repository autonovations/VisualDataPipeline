import os
import uuid
import base64
import logging
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
import aiofiles

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

app = FastAPI(title="Visual Data Pipeline API", version="0.1.0")

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

# Pydantic schemas
class SessionCreate(BaseModel):
    startUrl: str

class SessionResponse(BaseModel):
    id: str
    createdAt: str
    startUrl: str

class ScreenshotResponse(BaseModel):
    id: str
    sessionId: str
    timestamp: str
    url: str
    imagePath: str

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

# REST Endpoints
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
                imagePath=doc["imagePath"]
            ))
        return screenshots
    except Exception as e:
        logger.error(f"Error fetching screenshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket Endpoint for streaming screenshots
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established")
    db = get_database()
    
    try:
        while True:
            # Expecting JSON frame containing metadata and base64 encoded image
            data = await websocket.receive_json()
            
            session_id = data.get("sessionId")
            timestamp = data.get("timestamp") or datetime.utcnow().isoformat() + "Z"
            url = data.get("url") or ""
            image_data = data.get("image")
            
            if not session_id or not image_data:
                await websocket.send_json({"status": "error", "message": "Missing sessionId or image"})
                continue
                
            if db is None:
                await websocket.send_json({"status": "error", "message": "Database not available"})
                continue
            
            try:
                # Decode base64 image
                if "," in image_data:
                    # Strip out standard header if present (e.g. data:image/jpeg;base64,)
                    image_data = image_data.split(",")[1]
                
                image_bytes = base64.b64decode(image_data)
                
                # Determine screenshot filename based on sequence index
                sequence = data.get("sequence")
                if sequence is not None:
                    next_index = int(sequence)
                    filename = f"{next_index:06d}.jpg"
                else:
                    # Fallback to counting documents if not provided (backward compatibility)
                    count = await db.screenshots.count_documents({"sessionId": session_id})
                    next_index = count + 1
                    filename = f"{next_index:06d}.jpg"
                
                # Path relative to storage folder for DB reference
                relative_path = f"{session_id}/{filename}"
                absolute_path = os.path.join(STORAGE_DIR, session_id, filename)
                
                # Ensure the folder exists (safety fallback)
                os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
                
                # Save physically using asynchronous file writing
                async with aiofiles.open(absolute_path, 'wb') as f:
                    await f.write(image_bytes)
                
                # Insert in MongoDB
                screenshot_id = str(uuid.uuid4())
                screenshot_record = {
                    "_id": screenshot_id,
                    "sessionId": session_id,
                    "timestamp": timestamp,
                    "url": url,
                    "imagePath": f"/storage/{relative_path}" # path accessible via static files mount
                }
                await db.screenshots.insert_one(screenshot_record)
                
                # Acknowledge receipt
                await websocket.send_json({
                    "status": "ok",
                    "screenshotId": screenshot_id,
                    "filename": filename,
                    "count": next_index
                })
                logger.info(f"Saved screenshot {filename} for session {session_id}")
                
            except Exception as e:
                logger.error(f"Error processing screenshot frame: {e}")
                await websocket.send_json({"status": "error", "message": str(e)})
                
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket server error: {e}")

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting server on {HOST}:{PORT}")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
