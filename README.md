# Architecture - Visual Data Pipeline (v0.2)

This document provides a breakdown of the architecture, data models, and setup instructions for the screenshot capture and storage pipeline.

## System Architecture

```
   ┌─────────────────────────────────────────────────────────────────┐
   │                       DESKTOP (Electron)                        │
   │                                                                 │
   │  ┌───────────────────────┐       ┌───────────────────────────┐  │
   │  │       Frontend        │       │    Preview Webview        │  │
   │  │   (React / Vite)      │       │     (<webview>)           │  │
   │  │                       │       │                           │  │
   │  │  - URL Input          │       │  - Visual preview only    │  │
   │  │  - Session Sidebar    │       │  - Not used for capture   │  │
   │  │  - Pipeline Config    │       │  - Any size (UI-driven)   │  │
   │  │  - Live Gallery       │       └───────────────────────────┘  │
   │  │  - Real-time Stats    │                                      │
   │  └───────────┬───────────┘                                      │
   │              │                                                  │
   │              │ IPC (Start/Stop Capture + Config)                │
   │              ▼                                                  │
   │  ┌───────────────────────────────────────────────────────────┐  │
   │  │                  Electron Main Process                    │  │
   │  │                                                           │  │
   │  │  ┌─────────────────────────────────────────────────────┐  │  │
   │  │  │     Hidden Capture Window (BrowserWindow)           │  │  │
   │  │  │     Resolution: 1920×1080 (configurable)            │  │  │
   │  │  │     User-Agent: Desktop Chrome                      │  │  │
   │  │  │     show: false (invisible to user)                 │  │  │
   │  │  │                                                     │  │  │
   │  │  │  - Renders target site at REAL desktop resolution   │  │  │
   │  │  │  - capturePage() at 3 FPS (333ms)                   │  │  │
   │  │  │  - Visual change detection (16×16 thumbnail diff)   │  │  │
   │  │  │  - Converts to JPEG binary buffer                   │  │  │
   │  │  └─────────────────────────────────────────────────────┘  │  │
   │  └───────────────────┬───────────────────────────────────────┘  │
   └──────────────────────┼──────────────────────────────────────────┘
                          │ WebSocket: sends JPEG + Enriched Metadata
                          ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                       BACKEND (FastAPI)                         │
   │                                                                 │
   │  - WebSocket /ws listener:                                      │
   │    1. Receives JPEG payload (base64 or binary)                  │
   │    2. Computes perceptual hash for deduplication                │
   │    3. Saves file to storage/session-id/00000X.jpg               │
   │    4. Batch inserts enriched record to MongoDB (every 10)       │
   │                                                                 │
   │  - REST Endpoints:                                              │
   │    - POST /sessions (init session)                              │
   │    - GET /sessions (fetch session logs)                         │
   │    - GET /screenshots/{id} (fetch images list + metadata)       │
   │                                                                 │
   │  - Static Mount:                                                │
   │    - Serves storage/ folder at /storage/                        │
   └──────────────────────┬──────────────────────────────┬───────────┘
                          │                              │
                          ▼                              ▼
                 ┌─────────────────┐            ┌─────────────────┐
                 │  Local Storage  │            │     MongoDB     │
                 │   (storage/)    │            │  (Port 27017)   │
                 └─────────────────┘            └─────────────────┘
```

### Key Design Decision: Hidden Capture Window

The system uses a **hidden `BrowserWindow`** (not the visible `<webview>`) for actual screenshot capture. This guarantees:

- ✅ Screenshots are always at **real desktop resolution** (1920×1080 default)
- ✅ Websites render their **desktop layout**, not mobile/tablet
- ✅ The capture is **independent of the UI window size**
- ✅ A desktop **User-Agent** is forced so sites don't serve mobile versions
- ✅ The visible `<webview>` in the UI is only for **preview/navigation**

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
Stores individual frame metadata with enriched capture info and analysis stub.
```json
{
  "_id": "uuid-string-screenshot-identifier",
  "sessionId": "uuid-string-session-identifier",
  "timestamp": "2026-07-17T13:40:01.333Z",
  "url": "https://news.ycombinator.com/news?p=2",
  "imagePath": "/storage/uuid-string-session-identifier/000004.jpg",
  "capture": {
    "resolution": { "width": 1920, "height": 1080 },
    "scale": 1.0,
    "quality": 85,
    "outputSize": { "width": 1920, "height": 1080 },
    "fileSizeBytes": 48230,
    "isDuplicate": false,
    "perceptualHash": "a3f2b1c4d5e6f7..."
  },
  "analysis": {
    "status": "pending",
    "extractedData": null,
    "analyzedAt": null
  }
}
```

---

## Frontend Component Architecture

```
src/
├── components/
│   ├── Sidebar/index.tsx      — Session list, connection status, environment
│   ├── Header/index.tsx       — URL input, pipeline config, capture controls, stats
│   ├── Viewport/index.tsx     — Browser preview (webview or simulated)
│   └── Gallery/index.tsx      — Live + historical screenshot gallery with lightbox
├── hooks/
│   ├── useWebSocket.ts        — WebSocket connection management with auto-reconnect
│   ├── useElectron.ts         — Electron environment detection
│   └── useSessions.ts         — Session CRUD and screenshot fetching
├── types/
│   └── index.ts               — Shared TypeScript types and desktop resolutions
├── config/
│   └── api.ts                 — API endpoint configuration
├── App.tsx                    — Main layout and state orchestration (~270 lines)
├── index.css                  — Global styles and scrollbar customization
└── main.tsx                   — React entry point
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
