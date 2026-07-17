# Architecture - Visual Data Pipeline (MVP v0.1)

This document provides a breakdown of the architecture, data models, and setup instructions for the screenshot capture and storage pipeline.

## System Architecture

```
   ┌─────────────────────────────────────────────────────────────┐
   │                       DESKTOP (Electron)                    │
   │                                                             │
   │  ┌───────────────────────┐       ┌───────────────────────┐  │
   │  │       Frontend        │       │   Embedded Browser    │  │
   │  │   (React / Vite)      │       │     (<webview>)       │  │
   │  │                       │       │                       │  │
   │  │  - URL Input          │       │  - Native rendering   │  │
   │  │  - Session Sidebar    │       │  - CORS bypassed      │  │
   │  │  - Statistics         │       │  - User interaction   │  │
   │  │  - Live Gallery       │       └───────────┬───────────┘  │
   │  └───────────┬───────────┘                   │              │
   │              │                               │              │
   │              │ IPC (Start/Stop Capture)      │              │
   │              ▼                               │              │
   │  ┌───────────────────────────────────────────▼───────────┐  │
   │  │                  Electron Main Process                │  │
   │  │                                                       │  │
   │  │  - Timer Loop (every 333ms)                           │  │
   │  │  - captures webview using capturePage()               │  │
   │  │  - converts nativeImage to base64 JPEG                │  │
   │  └───────────────────┬───────────────────────────────────┘  │
   └──────────────────────┼──────────────────────────────────────┘
                          │ WebSocket: sends JPEG + Metadata
                          ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                       BACKEND (FastAPI)                     │
   │                                                             │
   │  - WebSocket /ws listener:                                  │
   │    1. Decodes JPEG base64 payload                           │
   │    2. Saves file to storage/session-id/00000X.jpg           │
   │    3. Inserts record to MongoDB                             │
   │                                                             │
   │  - REST Endpoints:                                          │
   │    - POST /sessions (init session)                         │
   │    - GET /sessions (fetch session logs)                     │
   │    - GET /screenshots/{id} (fetch images list)              │
   │                                                             │
   │  - Static Mount:                                            │
   │    - Serves storage/ folder at /storage/                    │
   └──────────────────────┬──────────────────────────────┬───────┘
                          │                              │
                          ▼                              ▼
                 ┌─────────────────┐            ┌─────────────────┐
                 │  Local Storage  │            │     MongoDB     │
                 │   (storage/)    │            │  (Port 27017)   │
                 └─────────────────┘            └─────────────────┘
```

---

## MongoDB Schemas

### Collection: `sessions`
Stores metadata for each capturing session.
```json
{
  "_id": "uuid-string-session-identifier",
  "createdAt": "2026-07-17T13:40:00.000Z",
  "startUrl": "https://news.ycombinator.com"
}
```

### Collection: `screenshots`
Stores individual frame metadata associated with a session.
```json
{
  "_id": "uuid-string-screenshot-identifier",
  "sessionId": "uuid-string-session-identifier",
  "timestamp": "2026-07-17T13:40:01.333Z",
  "url": "https://news.ycombinator.com/news?p=2",
  "imagePath": "/storage/uuid-string-session-identifier/000004.jpg"
}
```

---

## Setup & Running Guide

### 1. Requirements
Ensure you have the following installed:
- **Node.js** (v18+) and **npm**
- **Python** (v3.9+)
- **MongoDB** running on `localhost:27017` (a docker-compose config is provided in `docker/`)

### 2. Database Startup (if using Docker)
```bash
cd docker
docker compose up -d
```

### 3. Backend Setup
1. Create a virtual environment and activate it:
   ```bash
   cd backend
   python -m venv .venv
   # On Windows (PowerShell):
   .venv\Scripts\Activate.ps1
   # On Linux/macOS:
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the FastAPI development server:
   ```bash
   # Make sure you are inside backend/ or set pythonpath
   python -m uvicorn main:app --reload --port 8000
   ```

### 4. Frontend & Desktop Setup
1. Install all dependencies from the root directory:
   ```bash
   npm run install:all
   ```
2. Start the Vite React development server:
   ```bash
   npm run dev:frontend
   ```
3. Start the Electron application in another terminal window:
   ```bash
   npm run start:desktop
   ```
