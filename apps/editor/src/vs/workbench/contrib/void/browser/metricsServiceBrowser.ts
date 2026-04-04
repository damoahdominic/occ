/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMetricsService } from '../common/metricsService.js';

/**
 * No-op metrics service for the browser/web context.
 * The real MetricsService depends on IMainProcessService (Electron IPC), which is not
 * available when running as a VS Code Server / web workbench.
 */
export class NullMetricsService implements IMetricsService {
	declare readonly _serviceBrand: undefined;

	capture(_event: string, _params: Record<string, unknown>): void {
		// no-op in web/server mode
	}

	setOptOut(_val: boolean): void {
		// no-op in web/server mode
	}

	async getDebuggingProperties(): Promise<object> {
		return {};
	}
}

// Re-register over the common/metricsService.ts registration so that the web workbench
// never tries to create an Electron IPC channel for metrics.
registerSingleton(IMetricsService, NullMetricsService, InstantiationType.Delayed);
