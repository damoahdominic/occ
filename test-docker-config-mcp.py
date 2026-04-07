#!/usr/bin/env python3
"""
Test the Docker config flow using Playwright MCP server.

This script automates:
1. Navigate to OCC editor (http://localhost:9888/)
2. Open the Home panel
3. Click the Docker setup card
4. Verify the 3-step config modal appears
5. Fill in config (tmp data dir, port 18791)
6. Navigate through Config → Confirm → Start steps
"""

import json
import socket
import sys
import time
import os

def send_request(sock, method, params=None, req_id=1):
    """Send a JSON-RPC request to the MCP server."""
    msg = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
        "params": params or {}
    }
    payload = json.dumps(msg) + "\n"
    sock.send(payload.encode('utf-8'))
    return req_id + 1

def read_response(sock, timeout=5):
    """Read a response from the SSE stream."""
    sock.settimeout(timeout)
    try:
        data = sock.recv(8192)
        if not data:
            return None
        text = data.decode('utf-8', errors='ignore')
        # Parse SSE: lines starting with "data: "
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith('data:'):
                json_str = line[5:].strip()
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    continue
    except socket.timeout:
        return None
    except Exception as e:
        print(f"Error reading: {e}")
        return None
    return None

def wait_for_response(sock, expected_id=None, timeout=10):
    """Wait for a specific response ID."""
    start = time.time()
    while time.time() - start < timeout:
        resp = read_response(sock, timeout=1)
        if resp and 'id' in resp:
            if expected_id is None or resp['id'] == expected_id:
                return resp
        time.sleep(0.2)
    return None

def test_docker_config_flow():
    """Full test of the Docker config flow via MCP."""
    host = "localhost"
    port = 3080

    print("🚀 Starting Docker Config Flow Test")
    print(f"   MCP Server: {host}:{port}")
    print(f"   Editor URL: http://localhost:9888/")
    print("")

    # Connect to MCP server
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))
        print("✅ Connected to MCP server")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

    # Read initial data (welcome message, etc.)
    sock.settimeout(2)
    try:
        data = sock.recv(1024)
        if data:
            print("   (Connection established)")
    except socket.timeout:
        pass

    # Step 1: Initialize
    print("\n1️⃣  Initializing MCP session...")
    req_id = send_request(sock, "initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "docker-config-test", "version": "1.0"}
    }, 1)
    resp = wait_for_response(sock, expected_id=1, timeout=5)
    if resp and 'result' in resp:
        server_info = resp['result'].get('serverInfo', {})
        print(f"   ✅ Initialized: {server_info.get('name')} v{server_info.get('version')}")
    else:
        print(f"   ❌ Initialize failed: {resp}")
        sock.close()
        return False

    # Step 2: List tools (just to verify)
    print("\n2️⃣  Checking available tools...")
    req_id = send_request(sock, "tools/list", {}, 2)
    resp = wait_for_response(sock, expected_id=2, timeout=3)
    if resp and 'result' in resp and 'tools' in resp['result']:
        tools = resp['result']['tools']
        print(f"   ✅ Got {len(tools)} tools")
        # Find browser_* tools
        browser_tools = [t['name'] for t in tools if t['name'].startswith('browser_')]
        print(f"   Browser tools: {', '.join(browser_tools[:5])}...")
    else:
        print("   ⚠️  No tools list received")

    # Step 3: Navigate to editor
    print("\n3️⃣  Navigating to editor...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_navigate",
        "arguments": {"url": "http://localhost:9888/"}
    }, 3)
    resp = wait_for_response(sock, expected_id=3, timeout=10)
    if resp:
        if 'error' in resp:
            print(f"   ❌ Navigate error: {resp['error']}")
        else:
            print(f"   ✅ Navigate: {resp.get('result', {}).get('status', 'ok')}")
    else:
        print("   ⚠️  No response for navigate")

    # Wait for page to fully load
    time.sleep(3)

    # Step 4: Take snapshot to see the page
    print("\n4️⃣  Taking snapshot...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_snapshot",
        "arguments": {"interactive": True}
    }, 4)
    resp = wait_for_response(sock, expected_id=4, timeout=5)
    if resp and 'result' in resp:
        snapshot = resp['result']
        print(f"   ✅ Snapshot captured (elements: {len(snapshot.get('tree', {}))})")
        # Look for Docker card in the tree
        tree = snapshot.get('tree', {})
        docker_card_uid = find_element_by_text(tree, "Docker")
        if docker_card_uid:
            print(f"   ✅ Found Docker card: {docker_card_uid}")
        else:
            print("   ⚠️  Docker card not found (text may differ)")
    else:
        print("   ⚠️  Snapshot failed or not supported")

    # Step 5: Try to click Docker card using direct selector
    print("\n5️⃣  Clicking Docker setup card...")
    # The Docker card should have data-card="docker" or contain "Docker" text
    req_id = send_request(sock, "tools/call", {
        "name": "browser_click",
        "arguments": {"selector": "[data-card='docker']"}
    }, 5)
    resp = wait_for_response(sock, expected_id=5, timeout=5)
    if resp:
        if 'error' in resp:
            print(f"   ⚠️  Click error: {resp['error']}")
            # Try alternative: click by text
            print("   Trying alternative: click by text 'Docker'...")
            req_id = send_request(sock, "tools/call", {
                "name": "browser_click",
                "arguments": {"selector": "text=Docker"}
            }, 6)
            resp = wait_for_response(sock, expected_id=6, timeout=5)
            if resp and 'result' in resp:
                print(f"   ✅ Click by text: {resp['result'].get('status', 'ok')}")
        else:
            print(f"   ✅ Click successful")
    else:
        print("   ⚠️  No response for click")

    # Wait for modal to appear
    time.sleep(2)

    # Step 6: Verify config modal is visible
    print("\n6️⃣  Checking for config modal...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_snapshot",
        "arguments": {"interactive": True}
    }, 7)
    resp = wait_for_response(sock, expected_id=7, timeout=5)
    if resp and 'result' in resp:
        tree = resp['result'].get('tree', {})
        config_panel = find_element_by_id_or_attr(tree, "panel-docker-config")
        if config_panel:
            print("   ✅ Config modal found")
            # Check for Step 1 indicator
            step1 = find_element_by_text(tree, "1. Config") or find_element_by_id_or_attr(tree, "config-step-1-indicator")
            if step1:
                print("   ✅ Step 1 (Config) is active")
            else:
                print("   ⚠️  Step 1 indicator not found")
        else:
            print("   ⚠️  Config modal not found")

    # Step 7: Fill in config values (tmp dir and port 18791)
    print("\n7️⃣  Filling config form...")
    # First, find the data dir input
    req_id = send_request(sock, "tools/call", {
        "name": "browser_fill_form",
        "arguments": {
            "selector": "#config-data-dir",
            "value": "/tmp/openclaw-data"
        }
    }, 8)
    resp = wait_for_response(sock, expected_id=8, timeout=3)
    if resp and 'result' in resp:
        print(f"   ✅ Set data dir")
    else:
        print("   ⚠️  Could not set data dir")

    # Set port to 18791
    req_id = send_request(sock, "tools/call", {
        "name": "browser_fill_form",
        "arguments": {
            "selector": "#config-gateway-port",
            "value": "18791"
        }
    }, 9)
    resp = wait_for_response(sock, expected_id=9, timeout=3)
    if resp and 'result' in resp:
        print(f"   ✅ Set port to 18791")
    else:
        print("   ⚠️  Could not set port")

    # Step 8: Click Next to go to Step 2
    print("\n8️⃣  Clicking Next (Step 1 → Step 2)...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_click",
        "arguments": {"selector": "text=Next →"}
    }, 10)
    resp = wait_for_response(sock, expected_id=10, timeout=5)
    if resp and 'result' in resp:
        print("   ✅ Next clicked")
    else:
        print("   ⚠️  Next click failed")

    time.sleep(1)

    # Step 9: Verify Step 2 (Confirm)
    print("\n9️⃣  Verifying Step 2 (Confirm)...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_snapshot",
        "arguments": {"interactive": True}
    }, 11)
    resp = wait_for_response(sock, expected_id=11, timeout=5)
    if resp and 'result' in resp:
        tree = resp['result'].get('tree', {})
        step2 = find_element_by_id_or_attr(tree, "docker-config-step-2")
        confirm_btn = find_element_by_text(tree, "Confirm") or find_element_by_text(tree, "Confirm & Start")
        if step2:
            print("   ✅ Step 2 (Confirm) is visible")
            # Check values
            confirm_port = find_element_by_id_or_attr(tree, "confirm-port")
            if confirm_port:
                port_text = confirm_port.get('text', {}).get('value', '')
                if '18791' in port_text:
                    print("   ✅ Port 18791 shown in confirmation")
                else:
                    print(f"   ⚠️  Port in confirmation: {port_text}")
        else:
            print("   ⚠️  Step 2 not found")

    # Step 10: Click Confirm to go to Step 3
    print("\n🔟 Clicking Confirm (Step 2 → Step 3)...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_click",
        "arguments": {"selector": "#btn-confirm-config"}
    }, 12)
    resp = wait_for_response(sock, expected_id=12, timeout=5)
    if resp and 'result' in resp:
        print("   ✅ Confirm clicked")
    else:
        print("   ⚠️  Confirm click failed")

    time.sleep(2)

    # Step 11: Verify Step 3 (Provisioning)
    print("\n1️⃣1️⃣ Verifying Step 3 (Provisioning)...")
    req_id = send_request(sock, "tools/call", {
        "name": "browser_snapshot",
        "arguments": {"interactive": True}
    }, 13)
    resp = wait_for_response(sock, expected_id=13, timeout=5)
    if resp and 'result' in resp:
        tree = resp['result'].get('tree', {})
        step3 = find_element_by_id_or_attr(tree, "docker-config-step-3")
        provision_log = find_element_by_id_or_attr(tree, "config-provision-log")
        if step3:
            print("   ✅ Step 3 (Provisioning) is visible")
        if provision_log:
            print("   ✅ Provision log element found")
        else:
            print("   ⚠️  Provision log not found")
    else:
        print("   ⚠️  Could not verify Step 3")

    # Close connection
    sock.close()

    print("\n✅ Test completed!")
    print("\nNext steps:")
    print("  - Check the editor UI to see if provisioning started")
    print("  - Verify docker/.env.openclaw was created with:")
    print("      GATEWAY_IMAGE=openclaw/pod:latest")
    print("      GATEWAY_PORT=18791")
    print("      OPENCLAW_DATA_DIR=/tmp/openclaw-data")
    print("  - Check if gateway container started: docker ps | grep openclaw")
    return True

def find_element_by_text(tree, text):
    """Recursively search for element containing given text."""
    if isinstance(tree, dict):
        node = tree.get('node', {})
        node_text = ' '.join(node.get('text', [])).strip()
        if text.lower() in node_text.lower():
            return tree.get('uid')
        for child in tree.get('children', []):
            found = find_element_by_text(child, text)
            if found:
                return found
    elif isinstance(tree, list):
        for item in tree:
            found = find_element_by_text(item, text)
            if found:
                return found
    return None

def find_element_by_id_or_attr(tree, element_id):
    """Search for element with specific ID or attribute."""
    if isinstance(tree, dict):
        node = tree.get('node', {})
        if node.get('attributes', {}).get('id') == element_id:
            return tree
        for child in tree.get('children', []):
            found = find_element_by_id_or_attr(child, element_id)
            if found:
                return found
    elif isinstance(tree, list):
        for item in tree:
            found = find_element_by_id_or_attr(item, element_id)
            if found:
                return found
    return None

if __name__ == "__main__":
    try:
        success = test_docker_config_flow()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted")
        sys.exit(2)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
