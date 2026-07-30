const { app, BrowserWindow, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function startStaticServer(root) {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(root, "index.html");
    const extension = path.extname(filePath).toLowerCase();
    response.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
    fs.createReadStream(filePath).on("error", () => {
      response.writeHead(500);
      response.end("Unable to read application asset");
    }).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
}

const hasSingleInstance = app.requestSingleInstanceLock();
let browserUrl = "";
let staticServer = null;

async function createWindow() {
  const distRoot = path.join(__dirname, "..", "dist");
  const { server, port } = await startStaticServer(distRoot);
  staticServer = server;
  const url = `http://127.0.0.1:${port}/`;
  const browserMode = !process.argv.includes("--app-window");
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#f4f7f7",
    icon: path.join(__dirname, "..", "sherry-ielts.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on("closed", () => server.close());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  if (browserMode) {
    window.setSkipTaskbar(true);
    await window.loadURL(url);
    window.hide();
    browserUrl = url;
    await shell.openExternal(url);
    return;
  }

  await window.loadURL(url);
}

if (!hasSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (browserUrl) void shell.openExternal(browserUrl);
  });

  app.whenReady().then(() => createWindow().catch((error) => {
    console.error(error);
    if (staticServer) staticServer.close();
    app.quit();
  }));
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
