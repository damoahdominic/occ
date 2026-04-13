/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

export type OCCBalanceState = {
	balance: number | null;
	lastFetched: number | null;
	error: string | null;
	isLoading: boolean;
};

export type OCCAuthState = {
	isAuthenticated: boolean;
	email: string | null;
	jwt: string | null;
};
