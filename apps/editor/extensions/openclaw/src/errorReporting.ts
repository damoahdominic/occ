/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorCode } from './errorCodes.js';

/**
 * System information to include in error reports
 */
export interface SystemInfo {
  os: string;
  platform: 'win32' | 'darwin' | 'linux';
  architecture: string;
  nodeVersion: string;
  totalMemory: number;
  freeMemory: number;
}

/**
 * Error report to send to backend
 */
export interface ErrorReport {
  timestamp: number;
  errorCode: ErrorCode;
  errorMessage: string;
  logs: string[];
  systemInfo: SystemInfo;
  extensionVersion?: string;
  userEmail?: string;
}

/**
 * Collects system information and logs for error reporting
 */
export class ErrorReporter {
  /**
   * Get current system information
   */
  static getSystemInfo(): SystemInfo {
    const meminfo = os.totalmem();
    return {
      os: os.type(),
      platform: process.platform as 'win32' | 'darwin' | 'linux',
      architecture: os.arch(),
      nodeVersion: process.version,
      totalMemory: meminfo,
      freeMemory: os.freemem(),
    };
  }

  /**
   * Read recent logs from ~/.openclaw/occ-home.log
   * Returns the last N lines, or all lines if less than N
   */
  static collectRecentLogs(lineLimit: number = 100): string[] {
    const logPath = path.join(os.homedir(), '.openclaw', 'occ-home.log');
    
    try {
      if (!fs.existsSync(logPath)) {
        return ['[No logs found - log file does not exist]'];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Return last N lines
      return lines.slice(Math.max(0, lines.length - lineLimit));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return [`[Failed to read logs: ${errorMsg}]`];
    }
  }

  /**
   * Build a complete error report
   */
  static createErrorReport(
    errorCode: ErrorCode,
    errorMessage: string,
    options?: {
      extensionVersion?: string;
      userEmail?: string;
      logLimit?: number;
    }
  ): ErrorReport {
    return {
      timestamp: Date.now(),
      errorCode,
      errorMessage,
      logs: this.collectRecentLogs(options?.logLimit ?? 100),
      systemInfo: this.getSystemInfo(),
      extensionVersion: options?.extensionVersion,
      userEmail: options?.userEmail,
    };
  }

  /**
   * Send error report to backend
   * Fires asynchronously and does not block on failure
   */
  static async sendErrorReport(
    report: ErrorReport,
    backendUrl: string = 'https://occ.mba.sh',
    options?: {
      timeout?: number;
      onSuccess?: (report: ErrorReport) => void;
      onFailure?: (error: Error) => void;
    }
  ): Promise<void> {
    const endpoint = `${backendUrl}/api/v1/developer/error-report`;
    const timeout = options?.timeout ?? 5000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      options?.onSuccess?.(report);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      options?.onFailure?.(error);
      // Don't throw - fire-and-forget
    }
  }

  /**
   * Store a failed report locally for manual retry
   * Saves to ~/.openclaw/failed-error-reports.jsonl (one JSON per line)
   */
  static storeFailedReport(report: ErrorReport): boolean {
    const logDir = path.join(os.homedir(), '.openclaw');
    const reportPath = path.join(logDir, 'failed-error-reports.jsonl');

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const line = JSON.stringify(report) + '\n';
      fs.appendFileSync(reportPath, line, 'utf-8');
      return true;
    } catch {
      // Non-fatal - failure to store is not critical
      return false;
    }
  }

  /**
   * Retrieve stored failed reports for manual sending
   */
  static getStoredFailedReports(): ErrorReport[] {
    const reportPath = path.join(os.homedir(), '.openclaw', 'failed-error-reports.jsonl');
    
    try {
      if (!fs.existsSync(reportPath)) {
        return [];
      }

      const content = fs.readFileSync(reportPath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line) as ErrorReport;
          } catch {
            return null;
          }
        })
        .filter((r): r is ErrorReport => r !== null);
    } catch {
      return [];
    }
  }

  /**
   * Clear stored reports after successful sending
   */
  static clearStoredReports(): boolean {
    const reportPath = path.join(os.homedir(), '.openclaw', 'failed-error-reports.jsonl');
    
    try {
      if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath);
      }
      return true;
    } catch {
      return false;
    }
  }
}
