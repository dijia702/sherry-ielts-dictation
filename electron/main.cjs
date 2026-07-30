const { app, BrowserWindow, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const WEB_HOST = "127.0.0.1";
const WEB_PORT = 5173;
const EXPECTED_QUESTION_COUNT = 1779;
const EXPECTED_COLLECTION_IDS = ["jian21", "jijing_supplement", "xiahua_p1p4"];

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
    server.listen(WEB_PORT, WEB_HOST, () => {
      resolve({ server, port: WEB_PORT });
    });
  });
}

function isExistingQuizServer() {
  return new Promise((resolve) => {
    const request = http.get({
      host: WEB_HOST,
      port: WEB_PORT,
      path: "/data/quiz-data.json",
      timeout: 2500,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 8 * 1024 * 1024) request.destroy();
      });
      response.on("end", () => {
        try {
          const data = JSON.parse(body);
          const collectionIds = new Set(data.collections?.map((collection) => collection.id));
          resolve(
            response.statusCode === 200 &&
            data.questions?.length === EXPECTED_QUESTION_COUNT &&
            EXPECTED_COLLECTION_IDS.every((id) => collectionIds.has(id))
          );
        } catch {
          resolve(false);
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function acquireStaticServer(root) {
  try {
    return await startStaticServer(root);
  } catch (error) {
    if (error?.code === "EADDRINUSE" && await isExistingQuizServer()) {
      return { server: null, port: WEB_PORT };
    }
    throw error;
  }
}

const hasSingleInstance = app.requestSingleInstanceLock();
let browserUrl = "";
let staticServer = null;

async function createWindow() {
  const distRoot = path.join(__dirname, "..", "dist");
  const { server, port } = await acquireStaticServer(distRoot);
  staticServer = server;
  const url = `http://127.0.0.1:${port}/`;
  const browserMode = !process.argv.includes("--app-window");

  if (browserMode && !server) {
    browserUrl = url;
    await shell.openExternal(url);
    app.quit();
    return;
  }

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

  window.on("closed", () => {
    if (server) server.close();
  });
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
