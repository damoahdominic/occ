/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { ChevronDown, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface GatewayStatus {
  status: 'connected' | 'connecting' | 'unavailable';
  port?: number;
  health?: string;
  volumes?: string[];
}

export const GatewayInfo: React.FC<{ isDevMode?: boolean }> = ({ isDevMode = false }) => {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({
    status: 'unavailable',
  });
  const [isExpanded, setIsExpanded] = useState(isDevMode || false);

  useEffect(() => {
    const checkGateway = async () => {
      setGatewayStatus(prev => ({ ...prev, status: 'connecting' }));

      // Retry logic: 5 attempts with 1-second delay between attempts
      const maxRetries = 5;
      const retryDelay = 1000; // 1 second
      let lastError: string | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Try to fetch gateway info from localhost:18789 with 2-second timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const response = await fetch('http://127.0.0.1:18789/info', {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            setGatewayStatus({
              status: 'connected',
              port: 18789,
              health: data.health || 'healthy',
              volumes: data.volumes || [],
            });
            console.log(`[GatewayInfo] Connected on attempt ${attempt + 1}/${maxRetries}`);
            return; // Success - exit early
          } else {
            // Check for transient errors (409, 502, 503)
            const isTransient = [409, 502, 503].includes(response.status);
            if (!isTransient) {
              lastError = `HTTP ${response.status}`;
              setGatewayStatus(prev => ({ ...prev, status: 'unavailable' }));
              return; // Permanent error - exit early
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
          // Log but continue retrying
          console.log(`[GatewayInfo] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError}`);
        }

        // Wait before retrying (except on last attempt)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      // All retries exhausted
      console.log(`[GatewayInfo] All ${maxRetries} retry attempts failed`);
      setGatewayStatus({
        status: 'unavailable',
        health: lastError || 'Unable to connect',
      });
    };

    checkGateway();
    // Poll every 10 seconds
    const interval = setInterval(checkGateway, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = {
    connected: <CheckCircle size={16} className="text-green-500" />,
    connecting: <Clock size={16} className="text-yellow-500 animate-spin" />,
    unavailable: <AlertCircle size={16} className="text-red-500" />,
  }[gatewayStatus.status];

  const statusText = {
    connected: 'Connected',
    connecting: 'Connecting...',
    unavailable: 'Unavailable',
  }[gatewayStatus.status];

  return (
    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-void-fg-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded transition-colors"
        data-testid="gateway-info-header"
      >
        <div className="flex items-center gap-2">
          {statusIcon}
          <span>Gateway: {statusText}</span>
        </div>
        <ChevronDown
          size={16}
          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 text-xs text-void-fg-3 space-y-1" data-testid="gateway-info-details">
          {gatewayStatus.port && (
            <div>
              <span className="font-medium">Port:</span> {gatewayStatus.port}
            </div>
          )}
          {gatewayStatus.health && (
            <div>
              <span className="font-medium">Health:</span> {gatewayStatus.health}
            </div>
          )}
          {gatewayStatus.volumes && gatewayStatus.volumes.length > 0 && (
            <div>
              <span className="font-medium">Volumes:</span>
              <ul className="ml-4 mt-1">
                {gatewayStatus.volumes.map((vol, idx) => (
                  <li key={idx}>• {vol}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
