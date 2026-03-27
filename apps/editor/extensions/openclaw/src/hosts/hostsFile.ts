import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface HostFileEntry {
  id: string;
  type: 'local' | 'docker' | 'ssh';
  label: string;
  configuredAt: string;
  containerName?: string;
  lastStatus?: string;
}

export interface HostsFileData {
  hosts: HostFileEntry[];
}

const HOSTS_PATH = path.join(os.homedir(), '.occ', 'hosts.json');

export function readHostsFile(): HostsFileData {
  try {
    const raw = fs.readFileSync(HOSTS_PATH, 'utf-8');
    return JSON.parse(raw) as HostsFileData;
  } catch {
    return { hosts: [] };
  }
}

export function writeHostEntry(entry: HostFileEntry): void {
  const occDir = path.join(os.homedir(), '.occ');
  if (!fs.existsSync(occDir)) { fs.mkdirSync(occDir, { recursive: true }); }
  const file = readHostsFile();
  // Remove existing entry with same id
  file.hosts = file.hosts.filter(h => h.id !== entry.id);
  file.hosts.push(entry);
  fs.writeFileSync(HOSTS_PATH, JSON.stringify(file, null, 2), 'utf-8');
}
