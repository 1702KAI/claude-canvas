(function () {
  const messagesEl = document.getElementById("messages");
  const inputEl = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const addSelBtn = document.getElementById("add_selection");
  const stripEl = document.getElementById("attachments_strip");
  const statusEl = document.getElementById("status");
  const collapseBtn = document.getElementById("collapse");
  const chatbox = document.getElementById("chatbox");

  let pending = [];
  let ws;
  let currentAssistant = null;

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => (statusEl.textContent = "Connected");
    ws.onclose = () => {
      statusEl.textContent = "Disconnected. Retrying in 2s...";
      setTimeout(connect, 2000);
    };
    ws.onerror = () => (statusEl.textContent = "WebSocket error");
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleServerMessage(msg);
    };
  }

  function handleServerMessage(msg) {
    if (msg.type === "assistant_start") {
      currentAssistant = addMessage("assistant", "");
    } else if (msg.type === "assistant_text") {
      if (!currentAssistant) currentAssistant = addMessage("assistant", "");
      currentAssistant.textContent += msg.text;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (msg.type === "assistant_end") {
      currentAssistant = null;
      const u = msg.usage;
      if (u) statusEl.textContent = `tokens in ${u.input_tokens || 0} / out ${u.output_tokens || 0}`;
    } else if (msg.type === "tool_use") {
      addMessage("tool", `${msg.name}(${JSON.stringify(msg.input)})`);
      const api = window.canvasApi;
      if (msg.name === "mcp__canvas__highlight_object" && api) {
        api.highlightObject(msg.input.objectId);
      } else if (msg.name === "mcp__canvas__highlight_region" && api) {
        api.highlightRegion(msg.input);
      } else if (msg.name === "mcp__canvas__draw_annotation" && api) {
        api.drawAnnotation(msg.input);
      }
    } else if (msg.type === "error") {
      addMessage("error", msg.text);
    }
  }

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function renderStrip() {
    stripEl.innerHTML = "";
    pending.forEach((att, i) => {
      const t = document.createElement("div");
      t.className = "thumb";
      const img = document.createElement("img");
      img.src = "data:image/png;base64," + att.dataBase64;
      const x = document.createElement("div");
      x.className = "x";
      x.textContent = "x";
      x.onclick = () => { pending.splice(i, 1); renderStrip(); };
      t.appendChild(img); t.appendChild(x);
      stripEl.appendChild(t);
    });
  }

  addSelBtn.addEventListener("click", () => {
    const snaps = window.canvasApi.getSelectionSnapshot();
    snaps.forEach((s) => {
      pending.push({
        kind: "image",
        mediaType: "image/png",
        dataBase64: s.dataBase64,
        caption: `${s.type} ${s.id} at (${s.x}, ${s.y}) ${s.width}x${s.height}` + (s.label ? ` "${s.label}"` : ""),
      });
    });
    renderStrip();
  });

  function send() {
    const text = inputEl.value.trim();
    if (!text && pending.length === 0) return;
    if (!ws || ws.readyState !== 1) {
      addMessage("error", "Not connected to server.");
      return;
    }
    let display = text;
    if (pending.length) display += `\n[${pending.length} attachment(s)]`;
    addMessage("user", display);

    const objects = window.canvasApi ? window.canvasApi.listObjects() : [];
    ws.send(JSON.stringify({
      type: "user_message",
      text,
      attachments: pending,
      objects,
    }));
    inputEl.value = "";
    pending = [];
    renderStrip();
  }

  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  collapseBtn.addEventListener("click", () => {
    chatbox.classList.toggle("collapsed");
    collapseBtn.textContent = chatbox.classList.contains("collapsed") ? "+" : "_";
  });

  connect();
})();
