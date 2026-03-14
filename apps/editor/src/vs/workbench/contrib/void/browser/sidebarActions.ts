/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';


import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';

import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { VOID_VIEW_CONTAINER_ID, VOID_VIEW_ID } from './sidebarPane.js';
import { IMetricsService } from '../common/metricsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { VOID_TOGGLE_SETTINGS_ACTION_ID } from './voidSettingsPane.js';
import { VOID_CTRL_L_ACTION_ID } from './actionIDs.js';
import { localize2 } from '../../../../nls.js';
import { IChatThreadService } from './chatThreadService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { ChatMode } from '../common/voidSettingsTypes.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

// ---------- Register commands and keybindings ----------


export const roundRangeToLines = (range: IRange | null | undefined, options: { emptySelectionBehavior: 'null' | 'line' }) => {
	if (!range)
		return null

	// treat as no selection if selection is empty
	if (range.endColumn === range.startColumn && range.endLineNumber === range.startLineNumber) {
		if (options.emptySelectionBehavior === 'null')
			return null
		else if (options.emptySelectionBehavior === 'line')
			return { startLineNumber: range.startLineNumber, startColumn: 1, endLineNumber: range.startLineNumber, endColumn: 1 }
	}

	// IRange is 1-indexed
	const endLine = range.endColumn === 1 ? range.endLineNumber - 1 : range.endLineNumber // e.g. if the user triple clicks, it selects column=0, line=line -> column=0, line=line+1
	const newRange: IRange = {
		startLineNumber: range.startLineNumber,
		startColumn: 1,
		endLineNumber: endLine,
		endColumn: Number.MAX_SAFE_INTEGER
	}
	return newRange
}

// const getContentInRange = (model: ITextModel, range: IRange | null) => {
// 	if (!range)
// 		return null
// 	const content = model.getValueInRange(range)
// 	const trimmedContent = content
// 		.replace(/^\s*\n/g, '') // trim pure whitespace lines from start
// 		.replace(/\n\s*$/g, '') // trim pure whitespace lines from end
// 	return trimmedContent
// }



const VOID_OPEN_SIDEBAR_ACTION_ID = 'void.sidebar.open'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: VOID_OPEN_SIDEBAR_ACTION_ID, title: localize2('voidOpenSidebar', 'OCC: Open Sidebar'), f1: true });
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const chatThreadsService = accessor.get(IChatThreadService)
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)
		await chatThreadsService.focusCurrentChat()
	}
})

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'void.sidebar.isVisible', title: localize2('voidSidebarIsVisible', 'OCC: Is Sidebar Visible'), f1: false });
	}
	run(accessor: ServicesAccessor): boolean {
		return accessor.get(IViewsService).isViewContainerVisible(VOID_VIEW_CONTAINER_ID)
	}
})

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'void.sidebar.close', title: localize2('voidCloseSidebar', 'OCC: Close Sidebar'), f1: true });
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IViewsService).closeViewContainer(VOID_VIEW_CONTAINER_ID)
	}
})


// cmd L
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CTRL_L_ACTION_ID,
			f1: true,
			title: localize2('voidCmdL', 'OCC: Add Selection to Chat'),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				weight: KeybindingWeight.VoidExtension
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		// Get services
		const commandService = accessor.get(ICommandService)
		const viewsService = accessor.get(IViewsService)
		const metricsService = accessor.get(IMetricsService)
		const editorService = accessor.get(ICodeEditorService)
		const chatThreadService = accessor.get(IChatThreadService)

		metricsService.capture('Ctrl+L', {})

		// capture selection and model before opening the chat panel
		const editor = editorService.getActiveCodeEditor()
		const model = editor?.getModel()
		if (!model) return

		const selectionRange = roundRangeToLines(editor?.getSelection(), { emptySelectionBehavior: 'null' })

		// open panel
		const wasAlreadyOpen = viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)
		if (!wasAlreadyOpen) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID)
		}

		// Add selection to chat
		// add line selection
		if (selectionRange) {
			editor?.setSelection({
				startLineNumber: selectionRange.startLineNumber,
				endLineNumber: selectionRange.endLineNumber,
				startColumn: 1,
				endColumn: Number.MAX_SAFE_INTEGER
			})
			chatThreadService.addNewStagingSelection({
				type: 'CodeSelection',
				uri: model.uri,
				language: model.getLanguageId(),
				range: [selectionRange.startLineNumber, selectionRange.endLineNumber],
				state: { wasAddedAsCurrentFile: false },
			})
		}
		// add file
		else {
			chatThreadService.addNewStagingSelection({
				type: 'File',
				uri: model.uri,
				language: model.getLanguageId(),
				state: { wasAddedAsCurrentFile: false },
			})
		}

		await chatThreadService.focusCurrentChat()
	}
})


// Opens a new Void chat thread and immediately sends a message — callable by extensions.
// Optional second argument: chatMode ('agent' | 'gather' | 'normal') — overrides the global setting for this chat.
export const VOID_OPEN_CHAT_WITH_MESSAGE_ID = 'void.openChatWithMessage'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: VOID_OPEN_CHAT_WITH_MESSAGE_ID, title: localize2('voidOpenChatWithMessage', 'OCC: Open Chat with Message') });
	}
	async run(accessor: ServicesAccessor, message: string, chatMode?: ChatMode): Promise<void> {
		if (!message) return
		const commandService = accessor.get(ICommandService)
		const viewsService = accessor.get(IViewsService)
		const chatThreadService = accessor.get(IChatThreadService)
		const settingsService = accessor.get(IVoidSettingsService)

		// Optionally switch chat mode before opening (e.g. 'agent' so AI can run commands)
		if (chatMode) {
			settingsService.setGlobalSetting('chatMode', chatMode)
		}

		// Ensure the sidebar is open
		const wasAlreadyOpen = viewsService.isViewContainerVisible(VOID_VIEW_CONTAINER_ID)
		if (!wasAlreadyOpen) {
			await commandService.executeCommand(VOID_OPEN_SIDEBAR_ACTION_ID)
		}

		// Open a fresh thread
		chatThreadService.openNewThread()
		await chatThreadService.focusCurrentChat()

		const threadId = chatThreadService.state.currentThreadId
		await chatThreadService.addUserMessageAndStreamResponse({ userMessage: message, threadId })
	}
})


// New chat keybind + menu button
const VOID_CMD_SHIFT_L_ACTION_ID = 'void.cmdShiftL'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CMD_SHIFT_L_ACTION_ID,
			title: 'New Chat',
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
				weight: KeybindingWeight.VoidExtension,
			},
			icon: { id: 'add' },
			menu: [{ id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', VOID_VIEW_ID), }],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {

		const metricsService = accessor.get(IMetricsService)
		const chatThreadsService = accessor.get(IChatThreadService)
		const editorService = accessor.get(ICodeEditorService)
		metricsService.capture('Chat Navigation', { type: 'Start New Chat' })

		// get current selections and value to transfer
		const oldThreadId = chatThreadsService.state.currentThreadId
		const oldThread = chatThreadsService.state.allThreads[oldThreadId]

		const oldUI = await oldThread?.state.mountedInfo?.whenMounted

		const oldSelns = oldThread?.state.stagingSelections
		const oldVal = oldUI?.textAreaRef?.current?.value

		// open and focus new thread
		chatThreadsService.openNewThread()
		await chatThreadsService.focusCurrentChat()


		// set new thread values
		const newThreadId = chatThreadsService.state.currentThreadId
		const newThread = chatThreadsService.state.allThreads[newThreadId]

		const newUI = await newThread?.state.mountedInfo?.whenMounted
		chatThreadsService.setCurrentThreadState({ stagingSelections: oldSelns, })
		if (newUI?.textAreaRef?.current && oldVal) newUI.textAreaRef.current.value = oldVal


		// if has selection, add it
		const editor = editorService.getActiveCodeEditor()
		const model = editor?.getModel()
		if (!model) return
		const selectionRange = roundRangeToLines(editor?.getSelection(), { emptySelectionBehavior: 'null' })
		if (!selectionRange) return
		editor?.setSelection({ startLineNumber: selectionRange.startLineNumber, endLineNumber: selectionRange.endLineNumber, startColumn: 1, endColumn: Number.MAX_SAFE_INTEGER })
		chatThreadsService.addNewStagingSelection({
			type: 'CodeSelection',
			uri: model.uri,
			language: model.getLanguageId(),
			range: [selectionRange.startLineNumber, selectionRange.endLineNumber],
			state: { wasAddedAsCurrentFile: false },
		})
	}
})

// History menu button
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'void.historyAction',
			title: 'View Past Chats',
			icon: { id: 'history' },
			menu: [{ id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', VOID_VIEW_ID), }]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {

		// do not do anything if there are no messages (without this it clears all of the user's selections if the button is pressed)
		// TODO the history button should be disabled in this case so we can remove this logic
		const thread = accessor.get(IChatThreadService).getCurrentThread()
		if (thread.messages.length === 0) {
			return;
		}

		const metricsService = accessor.get(IMetricsService)

		const commandService = accessor.get(ICommandService)

		metricsService.capture('Chat Navigation', { type: 'History' })
		commandService.executeCommand(VOID_CMD_SHIFT_L_ACTION_ID)

	}
})


// Settings gear
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'void.settingsAction',
			title: `Void's Settings`,
			icon: { id: 'settings-gear' },
			menu: [{ id: MenuId.ViewTitle, group: 'navigation', when: ContextKeyExpr.equals('view', VOID_VIEW_ID), }]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService)
		commandService.executeCommand(VOID_TOGGLE_SETTINGS_ACTION_ID)
	}
})




// Exposes AI running state to extensions (e.g. OpenClaw home panel MoltPilot indicator).
export const VOID_GET_IS_RUNNING_ID = 'void.getIsRunning'
registerAction2(class extends Action2 {
	constructor() {
		super({ id: VOID_GET_IS_RUNNING_ID, title: localize2('voidGetIsRunning', 'MoltPilot: Get AI Running State') });
	}
	run(accessor: ServicesAccessor): boolean {
		const streamState = accessor.get(IChatThreadService).streamState
		return Object.values(streamState).some(s => s?.isRunning && s.isRunning !== 'idle')
	}
})

// Opens the OCC signup page in the system browser — runs in renderer so it's always reliable.
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'occ.onboarding.openSignupUrl', title: localize2('occOpenSignupUrl', 'OCC: Open Signup URL') });
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IOpenerService).open(URI.parse('https://occ.mba.sh/signup?ref=occ-editor'));
	}
})

// Called by the openclaw extension URI handler when MBA.sh redirects back with a JWT.
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'occ.auth.setLegacyJwt', title: localize2('occSetLegacyJwt', 'OCC: Set Legacy JWT') });
	}
	async run(accessor: ServicesAccessor, token: string): Promise<void> {
		if (typeof token === 'string') {
			const settingsService = accessor.get(IVoidSettingsService);
			const commandService = accessor.get(ICommandService);
			await settingsService.setGlobalSetting('occLegacyJwt', token);
			if (token) {
				commandService.executeCommand('occ.onboarding.darkTheme');
				await settingsService.setGlobalSetting('isOnboardingComplete', true);
			}
			// Sync JWT to extension-host storage so balance bar can read it without renderer IPC.
			// openclaw.jwt.set also triggers fetchAndUpdateBackendBalance internally.
			commandService.executeCommand('openclaw.jwt.set', token);
		}
	}
})

// Returns the stored OCC Legacy JWT so the HomePanel webview can show the user avatar.
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'occ.auth.getLegacyJwt', title: localize2('occGetLegacyJwt', 'OCC: Get Legacy JWT') });
	}
	run(accessor: ServicesAccessor): string {
		return accessor.get(IVoidSettingsService).state.globalSettings.occLegacyJwt ?? '';
	}
})


// export class TabSwitchListener extends Disposable {

// 	constructor(
// 		onSwitchTab: () => void,
// 		@ICodeEditorService private readonly _editorService: ICodeEditorService,
// 	) {
// 		super()

// 		// when editor switches tabs (models)
// 		const addTabSwitchListeners = (editor: ICodeEditor) => {
// 			this._register(editor.onDidChangeModel(e => {
// 				if (e.newModelUrl?.scheme !== 'file') return
// 				onSwitchTab()
// 			}))
// 		}

// 		const initializeEditor = (editor: ICodeEditor) => {
// 			addTabSwitchListeners(editor)
// 		}

// 		// initialize current editors + any new editors
// 		for (let editor of this._editorService.listCodeEditors()) initializeEditor(editor)
// 		this._register(this._editorService.onCodeEditorAdd(editor => { initializeEditor(editor) }))
// 	}
// }
