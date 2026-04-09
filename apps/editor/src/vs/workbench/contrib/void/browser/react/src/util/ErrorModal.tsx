/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, X, RotateCcw } from 'lucide-react';
import { ErrorCode, errorCodeMessages } from '../../../errorCodes.js';

export interface ErrorModalState {
  isOpen: boolean;
  errorCode: ErrorCode;
  errorMessage: string;
  logs?: string[];
  timestamp: number;
}

interface ErrorModalProps {
  state: ErrorModalState | null;
  onRetry?: () => void;
  onReportToDeveloper?: () => void;
  onDismiss: () => void;
}

/**
 * Error modal displayed when Docker setup or provisioning fails.
 * Shows error details, logs, and action buttons (retry, report, dismiss).
 */
export const ErrorModal: React.FC<ErrorModalProps> = ({
  state,
  onRetry,
  onReportToDeveloper,
  onDismiss,
}) => {
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);

  if (!state || !state.isOpen) {
    return null;
  }

  const errorInfo = errorCodeMessages[state.errorCode] || errorCodeMessages[ErrorCode.ERR_UNKNOWN];
  const canRetry = errorInfo.canRetry;
  const hasLogs = state.logs && state.logs.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-red-600/30 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-800">
          <div className="flex gap-3 flex-1">
            <AlertCircle className="h-6 w-6 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-red-400">{errorInfo.title}</h2>
              <p className="text-sm text-gray-400 mt-1">
                Error Code: <code className="text-red-300">{state.errorCode}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-200 p-1 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error Message */}
          <div className="bg-gray-800/50 border border-red-600/20 rounded p-4">
            <p className="text-gray-200">{errorInfo.message}</p>
          </div>

          {/* User's Error Message */}
          {state.errorMessage && (
            <div className="bg-gray-800/30 border border-gray-700/50 rounded p-4">
              <p className="text-sm text-gray-300 font-mono break-words">
                {state.errorMessage}
              </p>
            </div>
          )}

          {/* Logs Section (Collapsible) */}
          {hasLogs && (
            <div className="bg-gray-800/50 border border-gray-700/50 rounded overflow-hidden">
              <button
                onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/30 transition-colors"
              >
                <span className="text-sm font-medium text-gray-300">Recent Logs</span>
                {isLogsExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {isLogsExpanded && (
                <div className="px-4 py-3 border-t border-gray-700/50 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-words">
                    {state.logs.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-gray-500">
            {new Date(state.timestamp).toLocaleString()}
          </div>
        </div>

        {/* Footer with Actions */}
        <div className="flex gap-3 p-6 border-t border-gray-800 bg-gray-800/30">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded font-medium transition-colors"
          >
            Dismiss
          </button>

          {onReportToDeveloper && (
            <button
              onClick={onReportToDeveloper}
              className="flex-1 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 rounded font-medium border border-blue-700/50 transition-colors"
            >
              Report to Developer
            </button>
          )}

          {onRetry && canRetry && (
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2 bg-amber-900/50 hover:bg-amber-800/50 text-amber-300 rounded font-medium border border-amber-700/50 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
