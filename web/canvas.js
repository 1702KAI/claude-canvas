(function () {
  const stageEl = document.getElementById("stage");
  const stage = new Konva.Stage({
    container: "stage",
    width: stageEl.clientWidth,
    height: stageEl.clientHeight,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  const tr = new Konva.Transformer({ rotateEnabled: true });
  layer.add(tr);

  let tool = "select";
  let nextId = 1;
  function newId(prefix) {
    return `${prefix}_${nextId++}`;
  }

  let drawing = null;
  let startPos = null;

  function setTool(name) {
    tool = name;
    document.querySelectorAll("#toolbar button[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === name);
    });
    if (name !== "select") {
      tr.nodes([]);
    }
    stage.container().style.cursor = name === "draw" ? "crosshair" : "default";
  }

  document.querySelectorAll("#toolbar button[data-tool]").forEach((b) => {
    b.addEventListener("click", () => setTool(b.dataset.tool));
  });

  stage.on("mousedown touchstart", (e) => {
    if (tool === "select") {
      if (e.target === stage) {
        tr.nodes([]);
      } else {
        const node = findSelectable(e.target);
        if (node) tr.nodes([node]);
      }
      return;
    }
    const pos = stage.getPointerPosition();
    startPos = pos;
    if (tool === "draw") {
      drawing = new Konva.Line({
        stroke: "#222",
        strokeWidth: 2,
        points: [pos.x, pos.y],
        lineCap: "round",
        lineJoin: "round",
        tension: 0.3,
        id: newId("stroke"),
        name: "selectable stroke",
      });
      layer.add(drawing);
    } else if (tool === "rect") {
      drawing = new Konva.Rect({
        x: pos.x, y: pos.y, width: 1, height: 1,
        stroke: "#4c8bf5", strokeWidth: 2, fill: "rgba(76,139,245,0.08)",
        id: newId("rect"), name: "selectable shape", draggable: true,
      });
      layer.add(drawing);
    } else if (tool === "ellipse") {
      drawing = new Konva.Ellipse({
        x: pos.x, y: pos.y, radiusX: 1, radiusY: 1,
        stroke: "#e25c5c", strokeWidth: 2, fill: "rgba(226,92,92,0.08)",
        id: newId("ellipse"), name: "selectable shape", draggable: true,
      });
      layer.add(drawing);
    } else if (tool === "text") {
      const t = prompt("Text:");
      if (t) {
        const node = new Konva.Text({
          x: pos.x, y: pos.y, text: t, fontSize: 18, fill: "#222",
          id: newId("text"), name: "selectable text", draggable: true,
        });
        layer.add(node);
      }
      setTool("select");
    } else if (tool === "node") {
      const t = prompt("Mind node label:") || "node";
      const grp = new Konva.Group({
        x: pos.x, y: pos.y, draggable: true,
        id: newId("node"), name: "selectable mindnode",
      });
      const txt = new Konva.Text({ text: t, fontSize: 14, fill: "#222", padding: 8 });
      const w = Math.max(60, txt.width() + 16);
      const h = txt.height() + 8;
      const bg = new Konva.Rect({
        width: w, height: h, fill: "#fffbe6", stroke: "#caa14a",
        strokeWidth: 1.5, cornerRadius: 8,
      });
      grp.add(bg); grp.add(txt);
      layer.add(grp);
      setTool("select");
    }
  });

  stage.on("mousemove touchmove", () => {
    if (!drawing) return;
    const pos = stage.getPointerPosition();
    if (tool === "draw") {
      drawing.points(drawing.points().concat([pos.x, pos.y]));
    } else if (tool === "rect") {
      drawing.width(pos.x - startPos.x);
      drawing.height(pos.y - startPos.y);
    } else if (tool === "ellipse") {
      drawing.radiusX(Math.abs(pos.x - startPos.x));
      drawing.radiusY(Math.abs(pos.y - startPos.y));
    }
  });

  stage.on("mouseup touchend", () => {
    if (drawing) {
      drawing = null;
      startPos = null;
    }
  });

  function findSelectable(node) {
    let n = node;
    while (n && n !== stage) {
      if (n.name && n.name().includes("selectable")) return n;
      n = n.getParent();
    }
    return null;
  }

  function addImage(src, captionMaybe) {
    const img = new Image();
    img.onload = () => {
      const maxW = stage.width() * 0.6;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const knode = new Konva.Image({
        x: 80, y: 80,
        image: img,
        width: img.width * scale,
        height: img.height * scale,
        id: newId("image"),
        name: "selectable image",
        draggable: true,
      });
      knode.setAttr("caption", captionMaybe || "");
      layer.add(knode);
      tr.nodes([knode]);
    };
    img.src = src;
  }

  document.getElementById("upload").addEventListener("change", (e) => {
    for (const file of e.target.files) {
      const reader = new FileReader();
      reader.onload = () => addImage(reader.result, file.name);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  });

  document.getElementById("paste").addEventListener("click", async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onload = () => addImage(reader.result, "pasted");
            reader.readAsDataURL(blob);
          }
        }
      }
    } catch (err) {
      alert("Clipboard read failed. Try Cmd+V on the page instead.");
    }
  });

  window.addEventListener("paste", (e) => {
    if (!e.clipboardData) return;
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => addImage(reader.result, "pasted");
        reader.readAsDataURL(blob);
      }
    }
  });

  document.getElementById("delete").addEventListener("click", () => {
    tr.nodes().forEach((n) => n.destroy());
    tr.nodes([]);
  });

  document.getElementById("clear").addEventListener("click", () => {
    if (!confirm("Clear the whole canvas?")) return;
    layer.destroyChildren();
    layer.add(tr);
    tr.nodes([]);
  });

  window.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && document.activeElement.tagName !== "TEXTAREA" && document.activeElement.tagName !== "INPUT") {
      tr.nodes().forEach((n) => n.destroy());
      tr.nodes([]);
    }
  });

  window.addEventListener("resize", () => {
    stage.width(stageEl.clientWidth);
    stage.height(stageEl.clientHeight);
  });

  function snapshotNode(node) {
    const box = node.getClientRect();
    const dataUrl = node.toDataURL({
      pixelRatio: 1,
      mimeType: "image/png",
    });
    const base64 = dataUrl.split(",")[1];
    return {
      id: node.id(),
      type: node.getClassName().toLowerCase(),
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      label: node.getAttr("caption") || node.text?.() || "",
      dataBase64: base64,
    };
  }

  function listObjects() {
    const out = [];
    layer.getChildren().forEach((n) => {
      if (n === tr) return;
      const box = n.getClientRect();
      out.push({
        id: n.id(),
        type: n.getClassName().toLowerCase(),
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        label: n.getAttr("caption") || n.text?.() || "",
      });
    });
    return out;
  }

  function getSelectionSnapshot() {
    const nodes = tr.nodes();
    if (nodes.length === 0) {
      const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
      return [{
        id: "full_canvas",
        type: "stage",
        x: 0, y: 0,
        width: stage.width(),
        height: stage.height(),
        label: "full canvas",
        dataBase64: dataUrl.split(",")[1],
      }];
    }
    return nodes.map(snapshotNode);
  }

  function highlightObject(objectId) {
    const node = layer.findOne("#" + objectId);
    if (!node) return false;
    flash(node);
    tr.nodes([node]);
    return true;
  }

  function highlightRegion({ x, y, width, height, label }) {
    const flashRect = new Konva.Rect({
      x, y, width, height,
      stroke: "#ff3b3b", strokeWidth: 3,
      dash: [8, 6],
      listening: false,
    });
    layer.add(flashRect);
    if (label) {
      const lbl = new Konva.Text({
        x: x + 4, y: y + 4, text: label,
        fontSize: 13, fill: "#ff3b3b",
        listening: false,
      });
      layer.add(lbl);
      setTimeout(() => lbl.destroy(), 4000);
    }
    setTimeout(() => flashRect.destroy(), 4000);
  }

  function drawAnnotation({ x, y, text }) {
    const t = new Konva.Text({
      x, y, text,
      fontSize: 14,
      fill: "#0a0",
      padding: 4,
      id: newId("annotation"),
      name: "selectable text",
      draggable: true,
    });
    layer.add(t);
    flash(t);
  }

  function flash(node) {
    let i = 0;
    const orig = node.opacity();
    const t = setInterval(() => {
      node.opacity(i % 2 ? orig : 0.3);
      i++;
      if (i > 5) {
        clearInterval(t);
        node.opacity(orig);
      }
    }, 150);
  }

  window.canvasApi = {
    listObjects,
    getSelectionSnapshot,
    highlightObject,
    highlightRegion,
    drawAnnotation,
  };
})();
