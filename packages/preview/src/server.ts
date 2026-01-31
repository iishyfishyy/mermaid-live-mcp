import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { exec } from "node:child_process";

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sketchdraw Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 12px 24px;
      background: #16213e;
      border-bottom: 1px solid #0f3460;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    header h1 {
      font-size: 16px;
      font-weight: 600;
      color: #e94560;
    }
    .status {
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 10px;
      background: #0f3460;
    }
    .status.connected { color: #4ECDC4; }
    .status.disconnected { color: #FF6B6B; }
    .toolbar {
      display: none;
      gap: 8px;
      margin-left: auto;
    }
    .toolbar.visible { display: flex; }
    .toolbar button {
      padding: 5px 12px;
      border: 1px solid #0f3460;
      border-radius: 6px;
      background: #16213e;
      color: #e0e0e0;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .toolbar button:hover { background: #0f3460; }
    main {
      flex: 1;
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 24px;
      overflow: hidden;
      min-height: 0;
    }
    #diagram-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      padding: 16px;
      width: 100%;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #diagram-container svg {
      max-width: 100%;
      max-height: 100%;
    }
    .empty-state {
      text-align: center;
      color: #666;
      font-size: 14px;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
</head>
<body>
  <header>
    <h1>Sketchdraw Preview</h1>
    <span class="status disconnected" id="status">Connecting...</span>
    <div class="toolbar" id="toolbar">
      <button id="download-svg">Download SVG</button>
      <button id="download-png">Download PNG</button>
    </div>
  </header>
  <main>
    <div id="diagram-container">
      <div class="empty-state">Waiting for diagram...</div>
    </div>
  </main>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'default' });

    const container = document.getElementById('diagram-container');
    const statusEl = document.getElementById('status');
    const toolbar = document.getElementById('toolbar');
    let ws;
    let currentDiagramId = null;

    function showToolbar() {
      toolbar.classList.add('visible');
    }

    document.getElementById('download-svg').addEventListener('click', () => {
      const svg = container.querySelector('svg');
      if (!svg) return;
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (currentDiagramId || 'diagram') + '.svg';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('download-png').addEventListener('click', () => {
      const svg = container.querySelector('svg');
      if (!svg) return;
      const clone = svg.cloneNode(true);
      const rect = svg.getBoundingClientRect();
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      clone.style.maxWidth = '';
      clone.style.maxHeight = '';
      const svgData = new XMLSerializer().serializeToString(clone);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = rect.width * scale;
        canvas.height = rect.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = (currentDiagramId || 'diagram') + '.png';
          a.click();
          URL.revokeObjectURL(pngUrl);
        }, 'image/png');
      };
      img.src = url;
    });

    function connect() {
      ws = new WebSocket('ws://' + location.host + '/ws');

      ws.onopen = () => {
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'title') {
          document.title = data.title;
          document.querySelector('header h1').textContent = data.title;
        } else if (data.type === 'mermaid') {
          currentDiagramId = data.id;
          try {
            const { svg } = await mermaid.render('mermaid-output', data.syntax);
            container.innerHTML = svg;
            showToolbar();
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'svg-result', id: data.id, svg: svg }));
            }
          } catch (err) {
            container.innerHTML = '<div style="color:red;padding:16px;">Mermaid render error: ' + err.message + '</div>';
          }
        }
      };

      ws.onclose = () => {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status disconnected';
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
  </script>
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
