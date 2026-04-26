import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { z } from "zod";
import {
  query,
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "web");
const PORT = Number(process.env.CANVAS_CHAT_PORT || 7878);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const httpServer = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(WEB_DIR, urlPath);
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of clients) {
    if (c.readyState === 1) c.send(data);
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("message", async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (payload.type === "user_message") {
      handleUserMessage(payload).catch((err) => {
        ws.send(JSON.stringify({ type: "error", text: String(err?.message || err) }));
      });
    }
  });
});

const canvasMcp = createSdkMcpServer({
  name: "canvas",
  version: "0.1.0",
  tools: [
    tool(
      "highlight_object",
      "Highlight an object on the user's canvas by its id. Use this to point at something visually.",
      { objectId: z.string().describe("The id of the canvas object to highlight") },
      async (args) => {
        broadcast({ type: "highlight_object", objectId: args.objectId });
        return {
          content: [{ type: "text", text: `Highlighted object ${args.objectId}.` }],
        };
      }
    ),
    tool(
      "highlight_region",
      "Highlight a rectangular region on the canvas by pixel coordinates. Use when no specific object id matches.",
      {
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        label: z.string().optional(),
      },
      async (args) => {
        broadcast({ type: "highlight_region", ...args });
        return {
          content: [{ type: "text", text: `Highlighted region (${args.x}, ${args.y}, ${args.width}x${args.height}).` }],
        };
      }
    ),
    tool(
      "draw_annotation",
      "Draw a text label or arrow on the canvas to annotate something for the user.",
      {
        x: z.number(),
        y: z.number(),
        text: z.string(),
      },
      async (args) => {
        broadcast({ type: "draw_annotation", ...args });
        return {
          content: [{ type: "text", text: `Annotated at (${args.x}, ${args.y}): ${args.text}` }],
        };
      }
    ),
  ],
});

async function* makeUserStream(text, attachments, objectsSummary) {
  const content = [];
  const intro =
    `You are connected to a visual canvas the user is working on. ` +
    `You can call the canvas MCP tools (highlight_object, highlight_region, draw_annotation) to point things out on their canvas.\n\n` +
    `Current canvas objects:\n${objectsSummary || "(empty)"}\n\n` +
    `User message:\n${text || "(no text)"}`;
  content.push({ type: "text", text: intro });
  for (const att of attachments || []) {
    if (att.kind === "image" && att.dataBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType || "image/png",
          data: att.dataBase64,
        },
      });
      if (att.caption) {
        content.push({ type: "text", text: `(image above: ${att.caption})` });
      }
    }
  }
  yield {
    type: "user",
    message: { role: "user", content },
  };
}

async function handleUserMessage({ text, attachments, objects }) {
  const objectsSummary = (objects || [])
    .map((o) => `- id=${o.id} type=${o.type} bbox=(${o.x}, ${o.y}, ${o.width}x${o.height})${o.label ? " label=" + o.label : ""}`)
    .join("\n");

  broadcast({ type: "assistant_start" });

  const response = query({
    prompt: makeUserStream(text, attachments, objectsSummary),
    options: {
      mcpServers: { canvas: canvasMcp },
      allowedTools: [
        "mcp__canvas__highlight_object",
        "mcp__canvas__highlight_region",
        "mcp__canvas__draw_annotation",
      ],
      permissionMode: "acceptEdits",
    },
  });

  for await (const msg of response) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          broadcast({ type: "assistant_text", text: block.text });
        } else if (block.type === "tool_use") {
          broadcast({
            type: "tool_use",
            name: block.name,
            input: block.input,
          });
        }
      }
    } else if (msg.type === "result") {
      broadcast({ type: "assistant_end", usage: msg.usage });
    }
  }
}

httpServer.listen(PORT, () => {
  console.log(`canvas_chat ready at http://localhost:${PORT}`);
});
