/*--------------------------------------------------------------------------------------
 *  OCC Authentication Provider
 *  Registers the logged-in OCC account with VS Code's built-in authentication service
 *  so it appears in the bottom-left accounts button with the user's profile picture.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IAuthenticationService, AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider } from '../../../services/authentication/common/authentication.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

const OCC_PROVIDER_ID = 'occ-legacy';
const OCC_SESSION_ID = 'occ-main';

class OccAuthProvider extends Disposable implements IAuthenticationProvider {

	readonly id = OCC_PROVIDER_ID;
	readonly label = 'OCC Account';
	readonly supportsMultipleAccounts = false;

	private readonly _onDidChangeSessions = this._register(new Emitter<AuthenticationSessionsChangeEvent>());
	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	private _prevJwt = '';
	private _prevEmail = '';
	private _prevPicture = '';

	constructor(
		private readonly voidSettingsService: IVoidSettingsService,
		private readonly openerService: IOpenerService,
		private readonly commandService: ICommandService,
	) {
		super();
		const s = this.voidSettingsService.state.globalSettings;
		this._prevJwt = s.occLegacyJwt;
		this._prevEmail = s.occUserEmail;
		this._prevPicture = s.occUserPicture;

		// Fire session change events whenever relevant settings change
		this._register(this.voidSettingsService.onDidChangeState(() => {
			const { occLegacyJwt, occUserEmail, occUserPicture } = this.voidSettingsService.state.globalSettings;
			const jwtChanged = occLegacyJwt !== this._prevJwt;
			const emailChanged = occUserEmail !== this._prevEmail;
			const pictureChanged = occUserPicture !== this._prevPicture;
			const emailBeforeClear = this._prevEmail; // capture before updating

			this._prevJwt = occLegacyJwt;
			this._prevEmail = occUserEmail;
			this._prevPicture = occUserPicture;

			if (!jwtChanged && !emailChanged && !pictureChanged) { return; }

			if (jwtChanged && !occLegacyJwt) {
				// Logged out — use email captured before it was cleared so removeAccount can match
				this._onDidChangeSessions.fire({ added: undefined, changed: undefined, removed: [this._buildRemovedSession(emailBeforeClear)] });
			} else {
				const session = this._buildSession();
				if (session) {
					this._onDidChangeSessions.fire({ added: undefined, changed: [session], removed: undefined });
				}
			}
		}));
	}

	private _buildSession(): AuthenticationSession | null {
		const { occLegacyJwt, occUserEmail, occUserPicture } = this.voidSettingsService.state.globalSettings;
		if (!occLegacyJwt || !occUserEmail) { return null; }
		return {
			id: OCC_SESSION_ID,
			accessToken: occLegacyJwt,
			account: { id: occUserEmail, label: occUserEmail },
			scopes: [],
		};
	}

	private _buildRemovedSession(email: string): AuthenticationSession {
		return {
			id: OCC_SESSION_ID,
			accessToken: '',
			account: { id: email, label: email },
			scopes: [],
		};
	}

	async getSessions(_scopes: string[] | undefined, _options: { account?: { id: string; label: string } }): Promise<readonly AuthenticationSession[]> {
		const session = this._buildSession();
		return session ? [session] : [];
	}

	async createSession(_scopes: string[], _options: { account?: { id: string; label: string } }): Promise<AuthenticationSession> {
		await this.openerService.open(URI.parse('https://occ.mba.sh/login?ref=occ-editor'));
		// Return whatever session we have (login is out-of-band via deep link)
		const session = this._buildSession();
		if (session) { return session; }
		throw new Error('No OCC session available after login redirect.');
	}

	async removeSession(_sessionId: string): Promise<void> {
		// Clearing the JWT fires onDidChangeState → listener fires the removed event
		await this.commandService.executeCommand('occ.auth.setLegacyJwt', '');
		await this.commandService.executeCommand('occ.auth.setMoltpilotKey', '');
		await this.commandService.executeCommand('occ.auth.setUserInfo', '', '');
	}
}

/** Workbench contribution that registers the OCC auth provider at startup. */
export class OccAuthContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.occAuthProvider';

	constructor(
		@IAuthenticationService authService: IAuthenticationService,
		@IVoidSettingsService voidSettingsService: IVoidSettingsService,
		@IOpenerService openerService: IOpenerService,
		@ICommandService commandService: ICommandService,
	) {
		super();
		const provider = this._register(new OccAuthProvider(voidSettingsService, openerService, commandService));
		authService.registerAuthenticationProvider(OCC_PROVIDER_ID, provider);
	}
}

registerWorkbenchContribution2(OccAuthContribution.ID, OccAuthContribution, WorkbenchPhase.BlockRestore);
