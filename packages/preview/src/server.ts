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
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow: auto;
    }
    #diagram-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      padding: 16px;
      max-width: 95vw;
      max-height: 85vh;
      overflow: auto;
    }
    #diagram-container svg {
      max-width: 100%;
      height: auto;
    }
    .empty-state {
      text-align: center;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <header>
    <h1>Sketchdraw Preview</h1>
    <span class="status disconnected" id="status">Connecting...</span>
  </header>
  <main>
    <div id="diagram-container">
      <div class="empty-state">Waiting for diagram...</div>
    </div>
  </main>
  <script>
    const container = document.getElementById('diagram-container');
    const statusEl = document.getElementById('status');
    let ws;

    function connect() {
      ws = new WebSocket('ws://' + location.host + '/ws');

      ws.onopen = () => {
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'svg') {
          container.innerHTML = data.svg;
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
  private currentSvg: string | null = null;
  private port: number;

  constructor(port = 3210) {
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
      // Send current diagram if we have one
      if (this.currentSvg) {
        ws.send(JSON.stringify({ type: "svg", svg: this.currentSvg }));
      }
      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, () => {
        const url = `http://localhost:${this.port}`;
        resolve(url);
      });
      this.httpServer.on("error", reject);
    });
  }

  updateDiagram(svg: string): void {
    this.currentSvg = svg;
    const message = JSON.stringify({ type: "svg", svg });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(message);
      }
    }
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
