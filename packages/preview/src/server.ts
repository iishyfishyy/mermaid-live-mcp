import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { exec } from "node:child_process";

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sketchdraw Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0f0f1a;
      --bg-surface: #161625;
      --bg-elevated: #1e1e32;
      --accent: #6c5ce7;
      --accent-hover: #7c6ef7;
      --accent-glow: rgba(108,92,231,0.35);
      --text-primary: #eaeaff;
      --text-secondary: #a0a0c0;
      --text-tertiary: #6a6a8a;
      --border: #2a2a44;
      --border-light: #33335a;
      --green: #4ade80;
      --red: #f87171;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
      --shadow-lg: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
      --transition-fast: 0.15s ease;
      --transition-normal: 0.25s ease;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-base);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    header {
      padding: 10px 20px;
      background: rgba(22,22,37,0.82);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 10;
    }
    .logo-icon {
      flex-shrink: 0;
    }
    .logo-icon svg { display: block; }
    .header-title { display: flex; flex-direction: column; gap: 1px; }
    .header-title h1 {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .header-subtitle {
      font-size: 11px;
      color: var(--text-tertiary);
      display: flex;
      align-items: center;
      gap: 6px;
      line-height: 1.2;
    }
    .status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--red);
      flex-shrink: 0;
    }
    .status-dot.connected {
      background: var(--green);
      animation: pulse-green 2s ease-in-out infinite;
    }
    @keyframes pulse-green {
      0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
      50% { box-shadow: 0 0 0 4px rgba(74,222,128,0); }
    }
    .status-dot.disconnected {
      background: var(--red);
    }

    /* ── Toolbar ── */
    .toolbar {
      display: none;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }
    .toolbar.visible { display: flex; }
    .toolbar .divider {
      width: 1px; height: 20px;
      background: var(--border);
      margin: 0 6px;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: background var(--transition-fast), transform var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
      white-space: nowrap;
      line-height: 1;
    }
    .btn svg { flex-shrink: 0; }
    .btn:hover {
      background: var(--border);
      color: var(--text-primary);
      transform: translateY(-1px);
    }
    .btn:active { transform: translateY(0); }
    .btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
      box-shadow: 0 0 16px var(--accent-glow);
      color: #fff;
    }
    .zoom-display {
      font-size: 11px;
      color: var(--text-tertiary);
      min-width: 36px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      user-select: none;
    }

    /* ── Main ── */
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px;
      overflow: hidden;
      min-height: 0;
      position: relative;
    }

    /* ── Diagram container ── */
    #diagram-container {
      background: #ffffff;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      width: 100%;
      flex: 1;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
      transition: background var(--transition-normal);
    }
    #diagram-container.dark-canvas {
      background: #1a1a2e;
    }
    #diagram-container.dark-canvas #diagram-viewport svg {
      filter: invert(1) hue-rotate(180deg);
    }

    /* ── Viewport (zoom/pan) ── */
    #diagram-viewport {
      flex: 1;
      overflow: hidden;
      cursor: grab;
      display: flex;
      min-height: 0;
    }
    #diagram-viewport.grabbing { cursor: grabbing; }
    .diagram-transform {
      transform-origin: 0 0;
      transition: none;
    }
    .diagram-transform svg {
      display: block;
    }
    .diagram-entrance {
      animation: diagramIn 0.35s ease forwards;
    }
    @keyframes diagramIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 12px;
      padding: 32px;
    }
    .empty-icon {
      animation: breathe 3s ease-in-out infinite;
      color: var(--text-tertiary);
    }
    @keyframes breathe {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    .empty-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .empty-subtitle {
      font-size: 12px;
      color: var(--text-tertiary);
    }
    .dots-loading { display: flex; gap: 4px; margin-top: 4px; }
    .dots-loading span {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--text-tertiary);
      animation: dotBounce 1.4s ease-in-out infinite;
    }
    .dots-loading span:nth-child(2) { animation-delay: 0.16s; }
    .dots-loading span:nth-child(3) { animation-delay: 0.32s; }
    @keyframes dotBounce {
      0%,80%,100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-6px); opacity: 1; }
    }

    /* ── Loading state ── */
    .loading-overlay {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 5;
      opacity: 1;
      transition: opacity 0.3s ease;
      border-radius: var(--radius-lg);
    }
    .loading-overlay.hidden { opacity: 0; pointer-events: none; }
    #diagram-container.dark-canvas .loading-overlay {
      background: rgba(26,26,46,0.85);
    }
    .spinner {
      width: 28px; height: 28px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    /* ── Error panel ── */
    .error-panel {
      display: none;
      flex-direction: column;
      gap: 10px;
      padding: 20px;
      flex: 1;
    }
    .error-panel.visible { display: flex; }
    .error-header {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--red);
      font-size: 14px;
      font-weight: 600;
    }
    .error-message {
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px;
      overflow: auto;
      max-height: 200px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .error-dismiss {
      align-self: flex-start;
    }

    /* ── Info bar ── */
    .info-bar {
      display: none;
      padding: 6px 14px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 11px;
      color: var(--text-tertiary);
      border-top: 1px solid var(--border);
      gap: 16px;
      background: rgba(0,0,0,0.1);
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }
    .info-bar.visible { display: flex; }

    /* ── Shortcuts overlay ── */
    .shortcuts-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0,0,0,0.6);
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    .shortcuts-overlay.visible { display: flex; }
    .shortcuts-panel {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      max-width: 360px;
      width: 90%;
      box-shadow: var(--shadow-lg);
    }
    .shortcuts-panel h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 14px;
      color: var(--text-primary);
    }
    .shortcut-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
      font-size: 12px;
    }
    .shortcut-row span:first-child { color: var(--text-secondary); }
    .shortcut-keys {
      display: flex; gap: 3px;
    }
    kbd {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 11px;
      color: var(--text-primary);
    }
    .shortcuts-close {
      margin-top: 16px;
      width: 100%;
    }

    /* ── Responsive ── */
    @media (max-width: 640px) {
      header { flex-wrap: wrap; padding: 8px 12px; gap: 8px; }
      .toolbar { gap: 3px; }
      .btn .btn-label { display: none; }
      .btn { padding: 5px 7px; }
      .divider { display: none; }
      main { padding: 12px; }
    }
    @media (max-width: 400px) {
      .zoom-display { display: none; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>
</head>
<body>
  <header>
    <div class="logo-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        <path d="m15 5 4 4"/>
      </svg>
    </div>
    <div class="header-title">
      <h1 id="page-title">Sketchdraw Preview</h1>
      <div class="header-subtitle">
        <span class="status-dot disconnected" id="status-dot"></span>
        <span id="status-text">Connecting</span>
        <span id="diagram-id-label"></span>
      </div>
    </div>
    <div class="toolbar" id="toolbar">
      <button class="btn" id="zoom-out" title="Zoom out (-)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <span class="zoom-display" id="zoom-display">100%</span>
      <button class="btn" id="zoom-in" title="Zoom in (+)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="btn" id="zoom-fit" title="Reset zoom (0)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/></svg>
      </button>
      <div class="divider"></div>
      <button class="btn" id="theme-toggle" title="Toggle canvas theme (T)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="theme-icon-sun"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="theme-icon-moon" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <div class="divider"></div>
      <button class="btn" id="download-svg" title="Download SVG (Cmd+S)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span class="btn-label">SVG</span>
      </button>
      <button class="btn btn-primary" id="download-png" title="Download PNG (Cmd+Shift+S)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span class="btn-label">PNG</span>
      </button>
    </div>
  </header>

  <main>
    <div id="diagram-container">
      <!-- Empty state -->
      <div class="empty-state" id="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18"/><path d="M9 21V9"/>
          </svg>
        </div>
        <div class="empty-title">Waiting for a diagram...</div>
        <div class="empty-subtitle">Use generate_diagram to send a diagram here</div>
        <div class="dots-loading"><span></span><span></span><span></span></div>
      </div>

      <!-- Diagram viewport -->
      <div id="diagram-viewport" style="display:none;">
        <div class="diagram-transform" id="diagram-transform"></div>
      </div>

      <!-- Loading overlay -->
      <div class="loading-overlay hidden" id="loading-overlay">
        <div class="spinner"></div>
        <div class="loading-text">Rendering diagram...</div>
      </div>

      <!-- Error panel -->
      <div class="error-panel" id="error-panel">
        <div class="error-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Render Error
        </div>
        <div class="error-message" id="error-message"></div>
        <button class="btn error-dismiss" id="error-dismiss">Dismiss</button>
      </div>

      <!-- Info bar -->
      <div class="info-bar" id="info-bar">
        <span id="info-id"></span>
        <span id="info-type"></span>
        <span id="info-time"></span>
      </div>
    </div>
  </main>

  <!-- Shortcuts overlay -->
  <div class="shortcuts-overlay" id="shortcuts-overlay">
    <div class="shortcuts-panel">
      <h3>Keyboard Shortcuts</h3>
      <div class="shortcut-row"><span>Download SVG</span><span class="shortcut-keys"><kbd>Cmd</kbd><kbd>S</kbd></span></div>
      <div class="shortcut-row"><span>Download PNG</span><span class="shortcut-keys"><kbd>Cmd</kbd><kbd>Shift</kbd><kbd>S</kbd></span></div>
      <div class="shortcut-row"><span>Zoom in</span><span class="shortcut-keys"><kbd>+</kbd></span></div>
      <div class="shortcut-row"><span>Zoom out</span><span class="shortcut-keys"><kbd>-</kbd></span></div>
      <div class="shortcut-row"><span>Reset zoom</span><span class="shortcut-keys"><kbd>0</kbd></span></div>
      <div class="shortcut-row"><span>Toggle theme</span><span class="shortcut-keys"><kbd>T</kbd></span></div>
      <div class="shortcut-row"><span>Show shortcuts</span><span class="shortcut-keys"><kbd>?</kbd></span></div>
      <button class="btn shortcuts-close" id="shortcuts-close">Close</button>
    </div>
  </div>

  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'default' });

    /* ── DOM refs ── */
    const diagramContainer = document.getElementById('diagram-container');
    const viewport = document.getElementById('diagram-viewport');
    const transformEl = document.getElementById('diagram-transform');
    const emptyState = document.getElementById('empty-state');
    const loadingOverlay = document.getElementById('loading-overlay');
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');
    const toolbar = document.getElementById('toolbar');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const diagramIdLabel = document.getElementById('diagram-id-label');
    const zoomDisplay = document.getElementById('zoom-display');
    const infoBar = document.getElementById('info-bar');
    const infoId = document.getElementById('info-id');
    const infoType = document.getElementById('info-type');
    const infoTime = document.getElementById('info-time');
    const shortcutsOverlay = document.getElementById('shortcuts-overlay');
    const themeIconSun = document.getElementById('theme-icon-sun');
    const themeIconMoon = document.getElementById('theme-icon-moon');

    /* ── State ── */
    let ws;
    let currentDiagramId = null;
    let zoom = 1;
    let panX = 0, panY = 0;
    let svgBaseWidth = 0, svgBaseHeight = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let darkCanvas = localStorage.getItem('sketchdraw-dark-canvas') === 'true';

    const ZOOM_MIN = 0.1;
    const ZOOM_MAX = 5;
    const ZOOM_STEP = 0.15;

    /* ── Init canvas theme ── */
    if (darkCanvas) {
      diagramContainer.classList.add('dark-canvas');
      themeIconSun.style.display = 'none';
      themeIconMoon.style.display = '';
    }

    /* ── Helpers ── */
    function applyTransform() {
      var svg = transformEl.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', svgBaseWidth * zoom);
        svg.setAttribute('height', svgBaseHeight * zoom);
      }
      transformEl.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
      zoomDisplay.textContent = Math.round(zoom * 100) + '%';
    }

    function fitToViewport() {
      if (!svgBaseWidth || !svgBaseHeight) return;
      var rect = viewport.getBoundingClientRect();
      var pad = 32;
      var availW = rect.width - pad * 2;
      var availH = rect.height - pad * 2;
      if (availW <= 0 || availH <= 0) return;
      var scaleX = availW / svgBaseWidth;
      var scaleY = availH / svgBaseHeight;
      zoom = Math.min(scaleX, scaleY);
      var renderedW = svgBaseWidth * zoom;
      var renderedH = svgBaseHeight * zoom;
      panX = (rect.width - renderedW) / 2;
      panY = (rect.height - renderedH) / 2;
      applyTransform();
    }

    transformEl.addEventListener('animationend', function() {
      transformEl.classList.remove('diagram-entrance');
    });

    function setZoom(newZoom, centerX, centerY) {
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
      if (centerX !== undefined && centerY !== undefined) {
        const ratio = clamped / zoom;
        panX = centerX - ratio * (centerX - panX);
        panY = centerY - ratio * (centerY - panY);
      }
      zoom = clamped;
      applyTransform();
    }

    function resetZoom() {
      fitToViewport();
    }

    function showState(state) {
      emptyState.style.display = state === 'empty' ? 'flex' : 'none';
      viewport.style.display = state === 'diagram' ? 'flex' : 'none';
      errorPanel.classList.toggle('visible', state === 'error');
      if (state === 'diagram') {
        loadingOverlay.classList.remove('hidden');
      }
      if (state !== 'diagram') {
        infoBar.classList.remove('visible');
      }
    }

    function showToolbar() {
      toolbar.classList.add('visible');
    }

    function detectDiagramType(syntax) {
      const first = syntax.trim().split('\\n')[0].trim().toLowerCase();
      const types = ['graph','flowchart','sequenceDiagram','classDiagram','stateDiagram','erDiagram','journey','gantt','pie','quadrantChart','requirementDiagram','gitGraph','mindmap','timeline','sankey','xychart'];
      for (const t of types) {
        if (first.startsWith(t.toLowerCase())) return t;
      }
      return 'diagram';
    }

    function formatTime(d) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    /* ── Canvas theme toggle ── */
    function toggleCanvasTheme() {
      darkCanvas = !darkCanvas;
      diagramContainer.classList.toggle('dark-canvas', darkCanvas);
      themeIconSun.style.display = darkCanvas ? 'none' : '';
      themeIconMoon.style.display = darkCanvas ? '' : 'none';
      localStorage.setItem('sketchdraw-dark-canvas', darkCanvas);
    }
    document.getElementById('theme-toggle').addEventListener('click', toggleCanvasTheme);

    /* ── Zoom buttons ── */
    document.getElementById('zoom-in').addEventListener('click', function() { setZoom(zoom + ZOOM_STEP); });
    document.getElementById('zoom-out').addEventListener('click', function() { setZoom(zoom - ZOOM_STEP); });
    document.getElementById('zoom-fit').addEventListener('click', resetZoom);

    /* ── Mouse wheel zoom ── */
    viewport.addEventListener('wheel', function(e) {
      e.preventDefault();
      var rect = viewport.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      var delta = -e.deltaY * 0.002;
      setZoom(zoom + delta, cx, cy);
    }, { passive: false });

    /* ── Pan with mouse ── */
    viewport.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      viewport.classList.add('grabbing');
      e.preventDefault();
    });
    window.addEventListener('mousemove', function(e) {
      if (!isPanning) return;
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      applyTransform();
    });
    window.addEventListener('mouseup', function() {
      if (!isPanning) return;
      isPanning = false;
      viewport.classList.remove('grabbing');
    });

    /* ── Touch pan ── */
    var touchId = null;
    viewport.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        var t = e.touches[0];
        touchId = t.identifier;
        panStartX = t.clientX - panX;
        panStartY = t.clientY - panY;
        viewport.classList.add('grabbing');
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', function(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === touchId) {
          panX = t.clientX - panStartX;
          panY = t.clientY - panStartY;
          applyTransform();
          break;
        }
      }
    }, { passive: true });
    viewport.addEventListener('touchend', function(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          touchId = null;
          viewport.classList.remove('grabbing');
          break;
        }
      }
    }, { passive: true });

    /* ── Error dismiss ── */
    document.getElementById('error-dismiss').addEventListener('click', function() {
      showState('empty');
    });

    /* ── Shortcuts overlay ── */
    document.getElementById('shortcuts-close').addEventListener('click', function() {
      shortcutsOverlay.classList.remove('visible');
    });
    shortcutsOverlay.addEventListener('click', function(e) {
      if (e.target === shortcutsOverlay) shortcutsOverlay.classList.remove('visible');
    });

    /* ── Download SVG ── */
    function downloadSvg() {
      var svg = transformEl.querySelector('svg');
      if (!svg) return;
      var clone = svg.cloneNode(true);
      clone.setAttribute('width', svgBaseWidth);
      clone.setAttribute('height', svgBaseHeight);
      var blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (currentDiagramId || 'diagram') + '.svg';
      a.click();
      URL.revokeObjectURL(url);
    }

    /* ── Download PNG ── */
    function downloadPng() {
      var svg = transformEl.querySelector('svg');
      if (!svg) return;
      var clone = svg.cloneNode(true);
      var w = svgBaseWidth;
      var h = svgBaseHeight;
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      if (diagramContainer.classList.contains('dark-canvas')) {
        clone.style.filter = 'invert(1) hue-rotate(180deg)';
      }
      var svgData = new XMLSerializer().serializeToString(clone);
      var dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
      var img = new Image();
      img.onload = function() {
        var scale = 2;
        var canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        var ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          if (!blob) return;
          var pngUrl = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = pngUrl;
          a.download = (currentDiagramId || 'diagram') + '.png';
          a.click();
          URL.revokeObjectURL(pngUrl);
        }, 'image/png');
      };
      img.src = dataUrl;
    }

    document.getElementById('download-svg').addEventListener('click', downloadSvg);
    document.getElementById('download-png').addEventListener('click', downloadPng);

    /* ── Keyboard shortcuts ── */
    document.addEventListener('keydown', function(e) {
      var mod = e.metaKey || e.ctrlKey;

      if (mod && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadPng();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadSvg();
        return;
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === '+' || e.key === '=') { setZoom(zoom + ZOOM_STEP); e.preventDefault(); }
      else if (e.key === '-') { setZoom(zoom - ZOOM_STEP); e.preventDefault(); }
      else if (e.key === '0') { resetZoom(); e.preventDefault(); }
      else if (e.key.toLowerCase() === 't' && !mod) { toggleCanvasTheme(); e.preventDefault(); }
      else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        shortcutsOverlay.classList.toggle('visible');
        e.preventDefault();
      }
      else if (e.key === 'Escape') {
        shortcutsOverlay.classList.remove('visible');
      }
    });

    /* ── WebSocket connection ── */
    function connect() {
      ws = new WebSocket('ws://' + location.host + '/ws');

      ws.onopen = function() {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected';
      };

      ws.onmessage = async function(event) {
        var data = JSON.parse(event.data);
        if (data.type === 'title') {
          document.title = data.title;
          document.getElementById('page-title').textContent = data.title;
        } else if (data.type === 'mermaid') {
          currentDiagramId = data.id;
          diagramIdLabel.textContent = data.id ? ' · ' + data.id : '';

          showState('diagram');

          try {
            var result = await mermaid.render('mermaid-output', data.syntax);
            transformEl.innerHTML = result.svg;

            var svg = transformEl.querySelector('svg');
            if (svg) {
              var vb = svg.viewBox.baseVal;
              if (vb && vb.width) {
                svgBaseWidth = vb.width;
                svgBaseHeight = vb.height;
              } else {
                svgBaseWidth = svg.width.baseVal.value || svg.getBoundingClientRect().width;
                svgBaseHeight = svg.height.baseVal.value || svg.getBoundingClientRect().height;
              }
            }

            fitToViewport();
            transformEl.classList.remove('diagram-entrance');
            void transformEl.offsetWidth;
            transformEl.classList.add('diagram-entrance');
            loadingOverlay.classList.add('hidden');
            showToolbar();

            /* Info bar */
            infoId.textContent = 'ID: ' + (data.id || '–');
            infoType.textContent = 'Type: ' + detectDiagramType(data.syntax);
            infoTime.textContent = 'Updated: ' + formatTime(new Date());
            infoBar.classList.add('visible');

            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'svg-result', id: data.id, svg: result.svg }));
            }
          } catch (err) {
            showState('error');
            errorMessage.textContent = err.message || String(err);
          }
        }
      };

      ws.onclose = function() {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Disconnected';
        setTimeout(connect, 2000);
      };

      ws.onerror = function() { ws.close(); };
    }

    connect();
  <\/script>
</body>
</html>`;

export class PreviewServer {
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private currentContent:
    | { type: "mermaid"; syntax: string; id: string }
    | null = null;
  private port: number;
  private title: string = "Sketchdraw Preview";
  public onSvgRendered: ((id: string, svg: string) => void) | null = null;

  constructor(port = 0) {
    this.port = port;

    this.httpServer = createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(HTML_PAGE);
      }
    );

    this.wss = new WebSocketServer({ server: this.httpServer, path: "/ws" });

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type: "title", title: this.title }));
      if (this.currentContent) {
        ws.send(JSON.stringify(this.currentContent));
      }
      ws.on("message", (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
          if (msg.type === "svg-result" && msg.id && msg.svg) {
            this.onSvgRendered?.(msg.id, msg.svg);
          }
        } catch {
          // ignore malformed messages
        }
      });
      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, () => {
        const addr = this.httpServer.address();
        if (addr && typeof addr === "object") {
          this.port = addr.port;
        }
        const url = `http://localhost:${this.port}`;
        resolve(url);
      });
      this.httpServer.on("error", reject);
    });
  }

  private broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  setTitle(title: string): void {
    this.title = title;
    this.broadcast({ type: "title", title });
  }

  updateMermaid(id: string, syntax: string, title?: string): void {
    if (title) this.setTitle(title);
    this.currentContent = { type: "mermaid", syntax, id };
    this.broadcast(this.currentContent);
  }

  openBrowser(): void {
    const url = `http://localhost:${this.port}`;
    const platform = process.platform;
    const cmd =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "start"
          : "xdg-open";
    exec(`${cmd} ${url}`);
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close();
    }
    this.wss.close();
    return new Promise((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }
}
