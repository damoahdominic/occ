/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Error codes for app failures, used for diagnostic reporting and UI display.
 * Each code maps to a user-friendly message and determines retry behavior.
 */
export enum ErrorCode {
  // Docker provisioning errors
  ERR_DOCKER_TIMEOUT = 'ERR_DOCKER_TIMEOUT',
  ERR_DOCKER_NOT_INSTALLED = 'ERR_DOCKER_NOT_INSTALLED',
  ERR_DOCKER_NOT_RUNNING = 'ERR_DOCKER_NOT_RUNNING',
  ERR_DOCKER_PULL_FAILED = 'ERR_DOCKER_PULL_FAILED',
  ERR_DOCKER_CONTAINER_START = 'ERR_DOCKER_CONTAINER_START',

  // Gateway/OpenClaw service errors
  ERR_GATEWAY_START = 'ERR_GATEWAY_START',
  ERR_GATEWAY_HEALTH_CHECK = 'ERR_GATEWAY_HEALTH_CHECK',
  ERR_GATEWAY_PORT_CONFLICT = 'ERR_GATEWAY_PORT_CONFLICT',
  ERR_GATEWAY_AUTH = 'ERR_GATEWAY_AUTH',

  // CLI/Installation errors
  ERR_CLI_NOT_INSTALLED = 'ERR_CLI_NOT_INSTALLED',
  ERR_CLI_MISSING_DEPENDENCY = 'ERR_CLI_MISSING_DEPENDENCY',
  ERR_CLI_VERSION_MISMATCH = 'ERR_CLI_VERSION_MISMATCH',
  ERR_NPM_INSTALL_FAILED = 'ERR_NPM_INSTALL_FAILED',

  // Network errors
  ERR_NETWORK_TIMEOUT = 'ERR_NETWORK_TIMEOUT',
  ERR_NETWORK_CONNECTION_FAILED = 'ERR_NETWORK_CONNECTION_FAILED',
  ERR_NETWORK_DNS_FAILED = 'ERR_NETWORK_DNS_FAILED',

  // System resource errors
  ERR_INSUFFICIENT_DISK_SPACE = 'ERR_INSUFFICIENT_DISK_SPACE',
  ERR_INSUFFICIENT_MEMORY = 'ERR_INSUFFICIENT_MEMORY',
  ERR_PERMISSION_DENIED = 'ERR_PERMISSION_DENIED',

  // File system errors
  ERR_FILE_NOT_FOUND = 'ERR_FILE_NOT_FOUND',
  ERR_FILE_READ_FAILED = 'ERR_FILE_READ_FAILED',
  ERR_CONFIG_INVALID = 'ERR_CONFIG_INVALID',

  // Unknown errors
  ERR_UNKNOWN = 'ERR_UNKNOWN',
}

/**
 * Maps error codes to user-friendly messages and retry recommendations
 */
export const errorCodeMessages: Record<ErrorCode, { title: string; message: string; canRetry: boolean }> = {
  [ErrorCode.ERR_DOCKER_TIMEOUT]: {
    title: 'Docker Operation Timed Out',
    message: 'Docker took too long to respond. Check your internet connection and Docker resources.',
    canRetry: true,
  },
  [ErrorCode.ERR_DOCKER_NOT_INSTALLED]: {
    title: 'Docker Not Installed',
    message: 'Docker is required but not installed. Visit https://docs.docker.com/get-docker/ to install.',
    canRetry: false,
  },
  [ErrorCode.ERR_DOCKER_NOT_RUNNING]: {
    title: 'Docker Not Running',
    message: 'Docker daemon is not running. Start Docker Desktop or Docker service and retry.',
    canRetry: true,
  },
  [ErrorCode.ERR_DOCKER_PULL_FAILED]: {
    title: 'Failed to Download Docker Image',
    message: 'Could not download the required Docker image. Check your internet and retry.',
    canRetry: true,
  },
  [ErrorCode.ERR_DOCKER_CONTAINER_START]: {
    title: 'Failed to Start Container',
    message: 'The Docker container failed to start. Check Docker logs and available resources.',
    canRetry: true,
  },
  [ErrorCode.ERR_GATEWAY_START]: {
    title: 'Gateway Failed to Start',
    message: 'The OpenClaw gateway service failed to start. Check the data directory and configuration.',
    canRetry: true,
  },
  [ErrorCode.ERR_GATEWAY_HEALTH_CHECK]: {
    title: 'Gateway Health Check Failed',
    message: 'The gateway started but failed health checks. It may be overloaded or misconfigured.',
    canRetry: true,
  },
  [ErrorCode.ERR_GATEWAY_PORT_CONFLICT]: {
    title: 'Port Already in Use',
    message: 'The configured port is already in use. Choose a different port or close the conflicting application.',
    canRetry: false,
  },
  [ErrorCode.ERR_GATEWAY_AUTH]: {
    title: 'Gateway Authentication Failed',
    message: 'Could not authenticate with the gateway. Check your credentials and retry.',
    canRetry: true,
  },
  [ErrorCode.ERR_CLI_NOT_INSTALLED]: {
    title: 'OpenClaw CLI Not Found',
    message: 'The OpenClaw command-line tool is not installed. Run "npm install -g @openclaw/cli".',
    canRetry: false,
  },
  [ErrorCode.ERR_CLI_MISSING_DEPENDENCY]: {
    title: 'Missing Dependency',
    message: 'A required dependency for OpenClaw is missing. Try reinstalling.',
    canRetry: false,
  },
  [ErrorCode.ERR_CLI_VERSION_MISMATCH]: {
    title: 'Version Mismatch',
    message: 'The installed version is incompatible. Update or reinstall OpenClaw.',
    canRetry: false,
  },
  [ErrorCode.ERR_NPM_INSTALL_FAILED]: {
    title: 'npm Install Failed',
    message: 'Failed to install Node.js dependencies. Check your network and npm configuration.',
    canRetry: true,
  },
  [ErrorCode.ERR_NETWORK_TIMEOUT]: {
    title: 'Network Request Timed Out',
    message: 'The network request took too long. Check your connection and retry.',
    canRetry: true,
  },
  [ErrorCode.ERR_NETWORK_CONNECTION_FAILED]: {
    title: 'Network Connection Failed',
    message: 'Could not connect to the required service. Check your internet connection.',
    canRetry: true,
  },
  [ErrorCode.ERR_NETWORK_DNS_FAILED]: {
    title: 'DNS Resolution Failed',
    message: 'Could not resolve the hostname. Check your internet connection and DNS.',
    canRetry: true,
  },
  [ErrorCode.ERR_INSUFFICIENT_DISK_SPACE]: {
    title: 'Insufficient Disk Space',
    message: 'Not enough disk space available. Free up space and retry.',
    canRetry: false,
  },
  [ErrorCode.ERR_INSUFFICIENT_MEMORY]: {
    title: 'Insufficient Memory',
    message: 'Not enough memory available. Close other applications and retry.',
    canRetry: false,
  },
  [ErrorCode.ERR_PERMISSION_DENIED]: {
    title: 'Permission Denied',
    message: 'Missing permissions to complete this operation. Check file/directory permissions.',
    canRetry: false,
  },
  [ErrorCode.ERR_FILE_NOT_FOUND]: {
    title: 'File Not Found',
    message: 'A required file could not be found. Check your configuration and data directory.',
    canRetry: false,
  },
  [ErrorCode.ERR_FILE_READ_FAILED]: {
    title: 'Failed to Read File',
    message: 'Could not read a required file. Check file permissions and disk status.',
    canRetry: true,
  },
  [ErrorCode.ERR_CONFIG_INVALID]: {
    title: 'Invalid Configuration',
    message: 'Configuration file is invalid or corrupted. Reset and reconfigure.',
    canRetry: false,
  },
  [ErrorCode.ERR_UNKNOWN]: {
    title: 'Unknown Error',
    message: 'An unexpected error occurred. Check the logs for more details and try again.',
    canRetry: true,
  },
};

/**
 * Infer error code from error message or exception
 */
export function inferErrorCode(error: Error | string): ErrorCode {
  const message = typeof error === 'string' ? error : error.message;
  const lower = message.toLowerCase();

  // Docker errors
  if (lower.includes('docker') && lower.includes('not found')) return ErrorCode.ERR_DOCKER_NOT_INSTALLED;
  if (lower.includes('docker') && lower.includes('timeout')) return ErrorCode.ERR_DOCKER_TIMEOUT;
  if (lower.includes('docker') && lower.includes('not running')) return ErrorCode.ERR_DOCKER_NOT_RUNNING;
  if (lower.includes('pull') && lower.includes('failed')) return ErrorCode.ERR_DOCKER_PULL_FAILED;
  if (lower.includes('container') && lower.includes('start')) return ErrorCode.ERR_DOCKER_CONTAINER_START;

  // Gateway errors
  if (lower.includes('gateway') && lower.includes('health')) return ErrorCode.ERR_GATEWAY_HEALTH_CHECK;
  if (lower.includes('gateway') && lower.includes('start')) return ErrorCode.ERR_GATEWAY_START;
  if (lower.includes('port') && lower.includes('already in use')) return ErrorCode.ERR_GATEWAY_PORT_CONFLICT;
  if (lower.includes('gateway') && lower.includes('auth')) return ErrorCode.ERR_GATEWAY_AUTH;

  // CLI errors
  if (lower.includes('openclaw') && lower.includes('not found')) return ErrorCode.ERR_CLI_NOT_INSTALLED;
  if (lower.includes('npm install') && lower.includes('fail')) return ErrorCode.ERR_NPM_INSTALL_FAILED;

  // Network errors
  if (lower.includes('timeout')) return ErrorCode.ERR_NETWORK_TIMEOUT;
  if (lower.includes('econnrefused') || lower.includes('connection refused')) return ErrorCode.ERR_NETWORK_CONNECTION_FAILED;
  if (lower.includes('enotfound') || lower.includes('dns')) return ErrorCode.ERR_NETWORK_DNS_FAILED;

  // File system errors
  if (lower.includes('enoent') || lower.includes('no such file')) return ErrorCode.ERR_FILE_NOT_FOUND;
  if (lower.includes('permission denied') || lower.includes('eacces')) return ErrorCode.ERR_PERMISSION_DENIED;
  if (lower.includes('enospc') || lower.includes('no space')) return ErrorCode.ERR_INSUFFICIENT_DISK_SPACE;

  return ErrorCode.ERR_UNKNOWN;
}
