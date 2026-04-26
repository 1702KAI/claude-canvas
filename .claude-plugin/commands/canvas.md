---
description: Launch the visual canvas chat in your browser
allowed-tools: Bash(npm:*), Bash(node:*), Bash(open:*), Bash(cd:*), Bash(test:*), Bash(cat:*), Bash(sleep:*), Bash(curl:*)
---

Start the canvas chat server (if not already running) and open it in the default browser.

Steps to run:

1. If `${CLAUDE_PLUGIN_ROOT}/server/node_modules` does not exist, install dependencies:
   `cd "${CLAUDE_PLUGIN_ROOT}/server" && npm install --silent`

2. Check if a server is already up on port 7878 by trying `curl -fsS http://localhost:7878/healthz`. If it responds, skip step 3.

3. Otherwise launch the server in the background and write logs to `/tmp/canvas_chat.log`:
   `node "${CLAUDE_PLUGIN_ROOT}/server/index.js" > /tmp/canvas_chat.log 2>&1 &`
   then `sleep 1`.

4. Open the page: `open http://localhost:7878`.

5. Tell the user the canvas is open at http://localhost:7878 and that messages typed in the chatbox will reach Claude using their existing Claude Code login. Mention that logs live at `/tmp/canvas_chat.log`.
