"""Web server for MTG Card Analyzer with progress reporting."""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
import base64
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from PIL import Image
from dotenv import load_dotenv

from agents.coordinator import CoordinatorAgent, PipelineProgress


# Load environment variables from current dir and parent dirs
load_dotenv()  # Load from current directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))  # Load from promptfoo root

# Initialize FastAPI app
app = FastAPI(title="MTG Card Analyzer", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_progress(self, progress: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(progress)
            except:
                pass


manager = ConnectionManager()

# Global coordinator instance
coordinator = None


def get_coordinator():
    """Get or create coordinator instance."""
    global coordinator
    if coordinator is None:
        coordinator = CoordinatorAgent(
            max_parallel_cards=16,
            enable_caching=True
        )
    return coordinator


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main HTML page."""
    return HTMLResponse(content=open("static/index.html").read())


@app.post("/api/analyze")
async def analyze_image(file: UploadFile = File(...), output_format: str = "json"):
    """Analyze uploaded image."""
    try:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read image data
        image_data = await file.read()
        
        # Get coordinator
        coord = get_coordinator()
        
        # Create progress callback that sends to WebSocket
        async def ws_progress_callback(progress: PipelineProgress):
            await manager.send_progress({
                "type": "progress",
                "stage": progress.stage,
                "current": progress.current,
                "total": progress.total,
                "percentage": progress.percentage,
                "message": progress.message
            })
        
        # Set progress callback
        coord.progress_callback = ws_progress_callback
        
        # Analyze image
        result = await coord.analyze_image(
            image_bytes=image_data,
            output_format=output_format
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time progress updates."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/api/status")
async def get_status():
    """Get pipeline status."""
    coord = get_coordinator()
    return coord.get_pipeline_status()




# Create static directory
os.makedirs("static", exist_ok=True)

# Create the HTML file
html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MTG Card Analyzer - ADK Example</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            background: #1a1a1a;
            color: white;
            padding: 2rem 0;
            margin-bottom: 2rem;
        }
        
        h1 {
            text-align: center;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }
        
        .subtitle {
            text-align: center;
            opacity: 0.8;
        }
        
        .upload-section {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }
        
        .upload-area {
            border: 2px dashed #ccc;
            border-radius: 8px;
            padding: 3rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .upload-area:hover {
            border-color: #4CAF50;
            background: #fafafa;
        }
        
        .upload-area.dragging {
            border-color: #4CAF50;
            background: #e8f5e9;
        }
        
        #fileInput {
            display: none;
        }
        
        .button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background 0.3s;
        }
        
        .button:hover {
            background: #45a049;
        }
        
        .button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        
        .progress-section {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
            display: none;
        }
        
        .progress-item {
            margin-bottom: 1.5rem;
        }
        
        .progress-label {
            font-weight: bold;
            margin-bottom: 0.5rem;
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #e0e0e0;
            border-radius: 10px;
            overflow: hidden;
        }
        
        .progress-fill {
            height: 100%;
            background: #4CAF50;
            width: 0%;
            transition: width 0.3s;
        }
        
        .progress-message {
            margin-top: 0.5rem;
            color: #666;
            font-size: 0.9rem;
        }
        
        .results-section {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: none;
        }
        
        .card-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-top: 2rem;
        }
        
        .card-result {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 1rem;
        }
        
        .card-image {
            width: 100%;
            max-width: 200px;
            margin: 0 auto;
            display: block;
            border-radius: 8px;
        }
        
        .card-info {
            margin-top: 1rem;
        }
        
        .card-name {
            font-weight: bold;
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
        }
        
        .grade-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            margin-right: 0.5rem;
        }
        
        .grade-nm { background: #4CAF50; color: white; }
        .grade-lp { background: #8BC34A; color: white; }
        .grade-mp { background: #FFC107; color: #333; }
        .grade-hp { background: #FF9800; color: white; }
        .grade-dmg { background: #f44336; color: white; }
        
        .evidence-list {
            margin-top: 1rem;
            font-size: 0.9rem;
        }
        
        .evidence-item {
            padding: 0.25rem 0;
            color: #666;
        }
        
        .error {
            background: #ffebee;
            color: #c62828;
            padding: 1rem;
            border-radius: 4px;
            margin-top: 1rem;
        }
        
        .preview-image {
            max-width: 100%;
            margin-top: 1rem;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>🎴 MTG Card Analyzer</h1>
            <p class="subtitle">AI-powered card detection and grading using Google ADK</p>
        </div>
    </header>
    
    <div class="container">
        <div class="upload-section">
            <h2>Upload Card Image</h2>
            <p>Upload a photo containing one or more Magic: The Gathering cards</p>
            
            <div class="upload-area" id="uploadArea">
                <p>📷 Drag and drop an image here or click to browse</p>
                <input type="file" id="fileInput" accept="image/*">
            </div>
            
            <img id="previewImage" class="preview-image" style="display: none;">
            
            <div style="margin-top: 1rem; text-align: center;">
                <button class="button" id="analyzeBtn" disabled>Analyze Cards</button>
            </div>
        </div>
        
        <div class="progress-section" id="progressSection">
            <h2>Analysis Progress</h2>
            
            <div class="progress-item" id="segmentationProgress">
                <div class="progress-label">🔍 Segmentation</div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-message"></div>
            </div>
            
            <div class="progress-item" id="identificationProgress">
                <div class="progress-label">🎯 Identification</div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-message"></div>
            </div>
            
            <div class="progress-item" id="gradingProgress">
                <div class="progress-label">📊 Grading</div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-message"></div>
            </div>
            
            <div class="progress-item" id="reportingProgress">
                <div class="progress-label">📝 Reporting</div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-message"></div>
            </div>
        </div>
        
        <div class="results-section" id="resultsSection">
            <h2>Analysis Results</h2>
            <div id="resultsSummary"></div>
            <div class="card-grid" id="cardGrid"></div>
        </div>
        
        <div id="errorContainer"></div>
    </div>
    
    <script>
        let selectedFile = null;
        let ws = null;
        
        // File upload handling
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const previewImage = document.getElementById('previewImage');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                selectedFile = file;
                analyzeBtn.disabled = false;
                
                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImage.src = e.target.result;
                    previewImage.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragging');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragging');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragging');
            
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                selectedFile = file;
                fileInput.files = e.dataTransfer.files;
                analyzeBtn.disabled = false;
                
                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImage.src = e.target.result;
                    previewImage.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
        
        // WebSocket connection
        function connectWebSocket() {
            ws = new WebSocket(`ws://${window.location.host}/ws`);
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'progress') {
                    updateProgress(data.stage, data.percentage, data.message);
                }
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
            ws.onclose = () => {
                // Reconnect after 1 second
                setTimeout(connectWebSocket, 1000);
            };
        }
        
        // Progress update
        function updateProgress(stage, percentage, message) {
            const progressItem = document.getElementById(`${stage}Progress`);
            if (progressItem) {
                const fill = progressItem.querySelector('.progress-fill');
                const msgEl = progressItem.querySelector('.progress-message');
                
                fill.style.width = `${percentage}%`;
                msgEl.textContent = message;
            }
        }
        
        // Analyze button click
        analyzeBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            
            // Reset UI
            document.getElementById('errorContainer').innerHTML = '';
            document.getElementById('progressSection').style.display = 'block';
            document.getElementById('resultsSection').style.display = 'none';
            
            // Reset progress bars
            document.querySelectorAll('.progress-fill').forEach(el => el.style.width = '0%');
            document.querySelectorAll('.progress-message').forEach(el => el.textContent = '');
            
            analyzeBtn.disabled = true;
            
            try {
                const formData = new FormData();
                formData.append('file', selectedFile);
                
                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    displayResults(result);
                } else {
                    showError(result.detail || 'Analysis failed');
                }
            } catch (error) {
                showError('Network error: ' + error.message);
            } finally {
                analyzeBtn.disabled = false;
            }
        });
        
        // Display results
        function displayResults(data) {
            document.getElementById('progressSection').style.display = 'none';
            document.getElementById('resultsSection').style.display = 'block';
            
            // Summary
            const summary = document.getElementById('resultsSummary');
            summary.innerHTML = `
                <p>✅ Analysis complete in ${data.metadata.processing_time_seconds.toFixed(2)}s</p>
                <p>📊 Cards analyzed: ${data.metadata.cards_analyzed} / ${data.metadata.cards_detected} detected</p>
            `;
            
            // Card grid
            const grid = document.getElementById('cardGrid');
            grid.innerHTML = '';
            
            data.cards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card-result';
                
                const gradeClass = `grade-${card.grade.tcg_condition.toLowerCase()}`;
                
                cardEl.innerHTML = `
                    <h3 class="card-name">${card.identity.name}</h3>
                    <p>${card.identity.set_code} #${card.identity.collector_number}</p>
                    
                    <div style="margin: 1rem 0;">
                        <span class="grade-badge ${gradeClass}">${card.grade.tcg_condition}</span>
                        <span class="grade-badge" style="background: #666; color: white;">PSA ${card.grade.psa_equivalent}</span>
                    </div>
                    
                    <p>Overall Score: ${card.grade.overall_score.toFixed(1)}/10 (${(card.grade.confidence * 100).toFixed(0)}% confidence)</p>
                    
                    <div class="evidence-list">
                        <strong>Condition Details:</strong>
                        ${card.evidence.map(e => `
                            <div class="evidence-item">
                                ${e.category}: ${e.description} (${e.score.toFixed(1)}/10)
                            </div>
                        `).join('')}
                    </div>
                    
                    ${card.estimated_value ? `
                        <div style="margin-top: 1rem;">
                            <strong>Estimated Value:</strong>
                            $${card.estimated_value.low.toFixed(2)} - $${card.estimated_value.high.toFixed(2)}
                        </div>
                    ` : ''}
                `;
                
                grid.appendChild(cardEl);
            });
        }
        
        // Show error
        function showError(message) {
            document.getElementById('errorContainer').innerHTML = `
                <div class="error">❌ ${message}</div>
            `;
        }
        
        // Initialize WebSocket
        connectWebSocket();
        
        // Check server status
        fetch('/api/status')
            .then(r => r.json())
            .then(data => {
                console.log('Pipeline status:', data);
            })
            .catch(err => {
                console.error('Failed to get status:', err);
            });
    </script>
</body>
</html>"""

# Write the HTML file
with open("static/index.html", "w") as f:
    f.write(html_content)


if __name__ == "__main__":
    print("🚀 Starting MTG Card Analyzer server...")
    print("📍 Open http://localhost:8000 in your browser")
    print("\nℹ️  First time setup:")
    print("   1. Set GOOGLE_API_KEY in .env file")
    print("   2. Upload an image containing MTG cards to analyze\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)