# Chrome DevTools MCP — Direct Curl Access

This document explains how to call the Chrome DevTools MCP server using curl when the MCP server is running in the mcp-playwright-novnc container.

## MCP Server Location

The mcp-playwright-novnc container runs the MCP server on port **3080**:

```
http://localhost:3080
```

## MCP Transport Protocol

The MCP server uses **JSON-RPC 2.0** over **SSE (Server-Sent Events)** for responses. However, you can also use **streamable HTTP** transport.

### Option 1: SSE Transport (long-lived connection)

```bash
# Initialize the MCP session
curl -X POST http://localhost:3080/sse \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0"
      }
    }
  }'
```

### Option 2: Streamable HTTP (recommended for curl)

```bash
# Initialize
curl -X POST http://localhost:3080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0"
      }
    }
  }'
```

## Available Tools

Once initialized, you can call these tools:

### Navigation
- `navigate_page` — Navigate to a URL
- `list_pages` — List open tabs
- `select_page` — Switch tabs
- `close_page` — Close a tab

### Snapshot & Interaction
- `take_snapshot` — Get page structure with element UIDs
- `take_screenshot` — Take a screenshot
- `click` — Click an element by UID
- `fill` — Fill an input by UID
- `type_text` — Type text

### Debugging
- `evaluate_script` — Run JavaScript
- `get_console_message` — Get console logs
- `list_console_messages` — List all console messages

## Example: Navigate and Take Snapshot

```bash
#!/bin/bash
# chrome-devtools-mcp-curl.sh

BASE_URL="http://localhost:3080"

# 1. Initialize and get session ID
echo "=== Initializing MCP session ==="
INIT_RESPONSE=$(curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "curl", "version": "1.0"}
    }
  }')

echo "$INIT_RESPONSE"
echo ""

# 2. Navigate to the editor
echo "=== Navigating to OCC Editor ==="
curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "navigate_page",
      "arguments": {"url": "http://localhost:9888/"}
    }
  }' | jq '.'
echo ""

# 3. Wait a bit for page to load
sleep 2

# 4. Take a snapshot to see elements
echo "=== Taking snapshot ==="
curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "take_snapshot",
      "arguments": {}
    }
  }' | jq '.result.content[0].text' | head -c 5000
echo ""
echo "... (truncated)"
echo ""

# 5. Take a screenshot
echo "=== Taking screenshot ==="
SCREENSHOT=$(curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "take_screenshot",
      "arguments": {"filePath": "/tmp/editor-screenshot.png"}
    }
  }')

echo "$SCREENSHOT"
echo "Screenshot saved to /tmp/editor-screenshot.png"
```

## Running the Script

```bash
# Make executable
chmod +x chrome-devtools-mcp-curl.sh

# Run
./chrome-devtools-mcp-curl.sh
```

## List Available Tools

```bash
curl -s -X POST "http://localhost:3080/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' | jq '.result.tools[].name'
```

Expected output:
```
"click"
"drag"
"fill"
"fill_form"
"handle_dialog"
"hover"
"press_key"
"type_text"
"upload_file"
"close_page"
"list_pages"
"navigate_page"
"new_page"
"select_page"
"wait_for"
"emulate"
"resize_page"
"performance_analyze_insight"
"performance_start_trace"
"performance_stop_trace"
"take_memory_snapshot"
"get_network_request"
"list_network_requests"
"evaluate_script"
"get_console_message"
"lighthouse_audit"
"list_console_messages"
"take_screenshot"
"take_snapshot"
```

## Troubleshooting

### MCP server not responding

Check if the container is running:
```bash
docker ps | grep playwright
```

Check the MCP server port:
```bash
curl -s http://localhost:3080/ | head -5
```

### Connection refused

The noVNC container needs to be started with port 3080 exposed:
```bash
docker run -d --name playwright-novnc \
  --network host \
  -e SCREEN_WIDTH=1920 \
  -e SCREEN_HEIGHT=1080 \
  -e MCP_BROWSER=chromium \
  ghcr.io/xtr-dev/mcp-playwright-novnc:latest
```

### No browser available

The MCP server needs Chrome to be running. The noVNC container starts Chrome automatically. Check:
```bash
docker exec playwright-novnc bash -c "ps aux | grep chrome"
```

## References

- MCP Server GitHub: https://github.com/chromedevtools/chrome-devtools-mcp
- Tool Reference: https://github.com/chromedevtools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- Skills: https://skills.sh/chromedevtools/chrome-devtools-mcp/chrome-devtools
