# Migration Path — Single-Host to MultiHost

## Guiding Principle

**Zero disruption for existing users.** The first release with MultiHost should feel identical to today for anyone who only uses local OpenClaw. The multi-host features are additive.

## Migration Phases

### Phase 0: Current State (Pre-Migration)

```
~/.openclaw/
├── openclaw.json          ← Runtime config (gateway owns this)
├── workspace/             ← Agent workspace
└── agents/                ← Agent sessions

~/.occ/                    ← Does not exist
```

The OpenClaw extension reads `~/.openclaw/openclaw.json` directly via `fs.readFileSync()`.

### Phase 1: Introduce `~/.occ/` (Transparent)

On first launch after the MultiHost update:

1. **Create `~/.occ/`** directory
2. **Seed `hosts.json`** with a single local-default entry:
   ```json
   {
     "version": 1,
     "activeHostId": "local-default",
     "hosts": [{
       "id": "local-default",
       "type": "local",
       "label": "<hostname>",
       "connection": { "type": "local" },
       "default": true,
       "createdAt": "<now>"
     }]
   }
   ```
3. **All existing code paths continue to work** — the local adapter wraps the same `fs.readFileSync` and `cp.spawn` calls

**User impact: None.** They don't see `~/.occ/` unless they look for it. The UI is identical — no host picker appears until they have 2+ hosts.

### Phase 2: Show Host Picker (Conditional)

The status bar host picker only appears when:
- User has 2+ hosts registered, OR
- User explicitly runs "OCC: Add Host", OR
- Docker containers with OpenClaw are detected (if openclaw-docker is installed)

```typescript
function shouldShowHostPicker(): boolean {
  const hosts = registry.getAllHosts();
  return hosts.length > 1;
}

// Status bar item:
if (shouldShowHostPicker()) {
  hostPickerItem.show();
} else {
  hostPickerItem.hide();
}
```

### Phase 3: Sidebar Tree (Optional)

The Hosts sidebar panel is registered but hidden by default. It appears when:
- User has 2+ hosts, OR
- User manually enables it via View → Sidebar

```json
// package.json contribution
{
  "views": {
    "occ-hosts": [{
      "id": "occ.hostsView",
      "name": "Hosts",
      "when": "occ.multiHostEnabled"
    }]
  }
}
```

```typescript
// Set context when multi-host is active
vscode.commands.executeCommand('setContext', 'occ.multiHostEnabled', hosts.length > 1);
```

## Breaking Change Avoidance

### Config File Locations

| File | Owner | Migration |
|---|---|---|
| `~/.openclaw/openclaw.json` | OpenClaw runtime | **Untouched.** Adapters read this via `HostConnection.readConfig()` |
| `~/.occ/hosts.json` | OCCode client | **New file.** Created on first launch. |
| `~/.occ/settings.json` | OCCode client | **New file.** Created when user changes app settings. |

### Extension Settings

Existing VS Code settings (if any) continue to work. New settings use the `occ.` prefix:

```json
{
  "occ.hosts.showPicker": true,
  "occ.hosts.healthCheckInterval": 30000,
  "occ.hosts.showOfflineHosts": true
}
```

### Command IDs

All existing commands keep their IDs. New commands use the `occ.hosts.` prefix:

```
// Existing (unchanged)
openclaw.openHome
openclaw.openWorkspace
openclaw.openConfig
openclaw.status

// New
occ.hosts.pick
occ.hosts.add
occ.hosts.remove
occ.hosts.openTerminal
occ.hosts.openExplorer
```

## Data Recovery

If `~/.occ/hosts.json` gets corrupted or deleted:
1. On next launch, the registry detects the missing file
2. Re-creates it with the local-default entry
3. Other hosts are lost but can be re-added manually
4. A warning notification is shown: "Host registry was reset. Your local host is still available."

If `~/.occ/` is entirely missing (fresh install, wiped, etc.):
1. Same as above — seed with local-default
2. No data loss because `~/.openclaw/` (the runtime data) is untouched

## Version Compatibility

The `hosts.json` includes a `version` field. If the schema changes:

```typescript
function migrateHostsFile(data: any): HostsFile {
  if (data.version === 1) {
    // Current version — no migration needed
    return data;
  }
  
  // Future: handle v1 → v2 migration
  // if (data.version === 1) { return migrateV1ToV2(data); }
  
  throw new Error(`Unknown hosts.json version: ${data.version}`);
}
```

## Rollback

If a user wants to disable MultiHost and go back to single-host behavior:

1. Delete `~/.occ/` directory
2. The extension falls back to direct local access (same as pre-MultiHost)
3. Or: keep `~/.occ/hosts.json` with only the local-default entry — functionally identical to single-host

## Testing the Migration

```bash
# Simulate fresh install
rm -rf ~/.occ/
# Launch OCCode → should auto-create ~/.occ/ with local-default
# Verify: no visible change in UI

# Simulate existing user
echo '{"version":1,"activeHostId":"local-default","hosts":[...]}' > ~/.occ/hosts.json
# Launch OCCode → should read existing hosts.json
# Verify: hosts appear in picker if > 1

# Simulate corrupted file
echo 'garbage' > ~/.occ/hosts.json
# Launch OCCode → should show warning and recreate
# Verify: local-default is available, other hosts lost
```
