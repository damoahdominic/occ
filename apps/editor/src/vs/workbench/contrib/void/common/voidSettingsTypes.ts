
/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { defaultModelsOfProvider, defaultProviderSettings, ModelOverrides } from './modelCapabilities.js';
import { ToolApprovalType } from './toolsServiceTypes.js';
import { VoidSettingsState } from './voidSettingsService.js'


type UnionOfKeys<T> = T extends T ? keyof T : never;



export type ProviderName = keyof typeof defaultProviderSettings
export const providerNames = Object.keys(defaultProviderSettings) as ProviderName[]

export const localProviderNames = ['ollama', 'vLLM', 'lmStudio'] satisfies ProviderName[] // all local names
export const nonlocalProviderNames = providerNames.filter((name) => !(localProviderNames as string[]).includes(name)) // all non-local names

type CustomSettingName = UnionOfKeys<typeof defaultProviderSettings[ProviderName]>
type CustomProviderSettings<providerName extends ProviderName> = {
	[k in CustomSettingName]: k extends keyof typeof defaultProviderSettings[providerName] ? string : undefined
}
export const customSettingNamesOfProvider = (providerName: ProviderName) => {
	return Object.keys(defaultProviderSettings[providerName]) as CustomSettingName[]
}



export type VoidStatefulModelInfo = { // <-- STATEFUL
	modelName: string,
	type: 'default' | 'autodetected' | 'custom';
	isHidden: boolean, // whether or not the user is hiding it (switched off)
}



type CommonProviderSettings = {
	_didFillInProviderSettings: boolean | undefined, // undefined initially, computed when user types in all fields
	models: VoidStatefulModelInfo[],
}

export type SettingsAtProvider<providerName extends ProviderName> = CustomProviderSettings<providerName> & CommonProviderSettings

// part of state
export type SettingsOfProvider = {
	[providerName in ProviderName]: SettingsAtProvider<providerName>
}


export type SettingName = keyof SettingsAtProvider<ProviderName>

type DisplayInfoForProviderName = {
	title: string,
	desc?: string,
}

export const displayInfoOfProviderName = (providerName: ProviderName): DisplayInfoForProviderName => {
	if (providerName === 'anthropic') {
		return { title: 'Anthropic', }
	}
	else if (providerName === 'openAI') {
		return { title: 'OpenAI', }
	}
	else if (providerName === 'deepseek') {
		return { title: 'DeepSeek', }
	}
	else if (providerName === 'openRouter') {
		return { title: 'OpenRouter', }
	}
	else if (providerName === 'ollama') {
		return { title: 'Ollama', }
	}
	else if (providerName === 'vLLM') {
		return { title: 'vLLM', }
	}
	else if (providerName === 'liteLLM') {
		return { title: 'LiteLLM', }
	}
	else if (providerName === 'lmStudio') {
		return { title: 'LM Studio', }
	}
	else if (providerName === 'openAICompatible') {
		return { title: 'OpenAI-Compatible', }
	}
	else if (providerName === 'gemini') {
		return { title: 'Gemini', }
	}
	else if (providerName === 'groq') {
		return { title: 'Groq', }
	}
	else if (providerName === 'xAI') {
		return { title: 'Grok (xAI)', }
	}
	else if (providerName === 'mistral') {
		return { title: 'Mistral', }
	}
	else if (providerName === 'googleVertex') {
		return { title: 'Google Vertex AI', }
	}
	else if (providerName === 'microsoftAzure') {
		return { title: 'Microsoft Azure OpenAI', }
	}
	else if (providerName === 'awsBedrock') {
		return { title: 'AWS Bedrock', }
	}
	else if (providerName === 'ocFreeModel') {
		return { title: 'OC Free Model', }
	}

	throw new Error(`descOfProviderName: Unknown provider name: "${providerName}"`)
}

export const subTextMdOfProviderName = (providerName: ProviderName): string => {

	if (providerName === 'anthropic') return 'Get your [API Key here](https://console.anthropic.com/settings/keys).'
	if (providerName === 'openAI') return 'Get your [API Key here](https://platform.openai.com/api-keys).'
	if (providerName === 'deepseek') return 'Get your [API Key here](https://platform.deepseek.com/api_keys).'
	if (providerName === 'openRouter') return 'Get your [API Key here](https://openrouter.ai/settings/keys). Read about [rate limits here](https://openrouter.ai/docs/api-reference/limits).'
	if (providerName === 'gemini') return 'Get your [API Key here](https://aistudio.google.com/apikey). Read about [rate limits here](https://ai.google.dev/gemini-api/docs/rate-limits#current-rate-limits).'
	if (providerName === 'groq') return 'Get your [API Key here](https://console.groq.com/keys).'
	if (providerName === 'xAI') return 'Get your [API Key here](https://console.x.ai).'
	if (providerName === 'mistral') return 'Get your [API Key here](https://console.mistral.ai/api-keys).'
	if (providerName === 'openAICompatible') return `Use any provider that's OpenAI-compatible (use this for llama.cpp and more).`
	if (providerName === 'googleVertex') return 'You must authenticate before using Vertex with Void. Read more about endpoints [here](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library), and regions [here](https://cloud.google.com/vertex-ai/docs/general/locations#available-regions).'
	if (providerName === 'microsoftAzure') return 'Read more about endpoints [here](https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions/get-chat-completions?view=rest-aifoundry-model-inference-2024-05-01-preview&tabs=HTTP), and get your API key [here](https://learn.microsoft.com/en-us/azure/search/search-security-api-keys?tabs=rest-use%2Cportal-find%2Cportal-query#find-existing-keys).'
	if (providerName === 'awsBedrock') return 'Connect via a LiteLLM proxy or the AWS [Bedrock-Access-Gateway](https://github.com/aws-samples/bedrock-access-gateway). LiteLLM Bedrock setup docs are [here](https://docs.litellm.ai/docs/providers/bedrock).'
	if (providerName === 'ollama') return 'Read more about custom [Endpoints here](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-expose-ollama-on-my-network).'
	if (providerName === 'vLLM') return 'Read more about custom [Endpoints here](https://docs.vllm.ai/en/latest/getting_started/quickstart.html#openai-compatible-server).'
	if (providerName === 'lmStudio') return 'Read more about custom [Endpoints here](https://lmstudio.ai/docs/app/api/endpoints/openai).'
	if (providerName === 'liteLLM') return 'Read more about endpoints [here](https://docs.litellm.ai/docs/providers/openai_compatible).'
	if (providerName === 'ocFreeModel') return 'Free model provided by OpenClaw Code. No API key required — just add a model name and start chatting.'

	throw new Error(`subTextMdOfProviderName: Unknown provider name: "${providerName}"`)
}

type DisplayInfo = {
	title: string;
	placeholder: string;
	isPasswordField?: boolean;
}
export const displayInfoOfSettingName = (providerName: ProviderName, settingName: SettingName): DisplayInfo => {
	if (settingName === 'apiKey') {
		return {
			title: 'API Key',

			// **Please follow this convention**:
			// The word "key..." here is a placeholder for the hash. For example, sk-ant-key... means the key will look like sk-ant-abcdefg123...
			placeholder: providerName === 'anthropic' ? 'sk-ant-key...' : // sk-ant-api03-key
				providerName === 'openAI' ? 'sk-proj-key...' :
					providerName === 'deepseek' ? 'sk-key...' :
						providerName === 'openRouter' ? 'sk-or-key...' : // sk-or-v1-key
							providerName === 'gemini' ? 'AIzaSy...' :
								providerName === 'groq' ? 'gsk_key...' :
									providerName === 'openAICompatible' ? 'sk-key...' :
										providerName === 'xAI' ? 'xai-key...' :
											providerName === 'mistral' ? 'api-key...' :
												providerName === 'googleVertex' ? 'AIzaSy...' :
													providerName === 'microsoftAzure' ? 'key-...' :
														providerName === 'awsBedrock' ? 'key-...' :
															'',

			isPasswordField: true,
		}
	}
	else if (settingName === 'endpoint') {
		return {
			title: providerName === 'ollama' ? 'Endpoint' :
				providerName === 'vLLM' ? 'Endpoint' :
					providerName === 'lmStudio' ? 'Endpoint' :
						providerName === 'openAICompatible' ? 'baseURL' : // (do not include /chat/completions)
							providerName === 'googleVertex' ? 'baseURL' :
								providerName === 'microsoftAzure' ? 'baseURL' :
									providerName === 'liteLLM' ? 'baseURL' :
										providerName === 'awsBedrock' ? 'Endpoint' :
											providerName === 'ocFreeModel' ? 'baseURL' :
												'(never)',

			placeholder: providerName === 'ollama' ? defaultProviderSettings.ollama.endpoint
				: providerName === 'vLLM' ? defaultProviderSettings.vLLM.endpoint
					: providerName === 'openAICompatible' ? 'https://my-website.com/v1'
						: providerName === 'lmStudio' ? defaultProviderSettings.lmStudio.endpoint
							: providerName === 'liteLLM' ? 'http://localhost:4000'
								: providerName === 'awsBedrock' ? 'http://localhost:4000/v1'
									: providerName === 'ocFreeModel' ? 'https://api.openclawcode.org/v1'
										: '(never)',


		}
	}
	else if (settingName === 'headersJSON') {
		return { title: 'Custom Headers', placeholder: '{ "X-Request-Id": "..." }' }
	}
	else if (settingName === 'region') {
		// vertex only
		return {
			title: 'Region',
			placeholder: providerName === 'googleVertex' ? defaultProviderSettings.googleVertex.region
				: providerName === 'awsBedrock'
					? defaultProviderSettings.awsBedrock.region
					: ''
		}
	}
	else if (settingName === 'azureApiVersion') {
		// azure only
		return {
			title: 'API Version',
			placeholder: providerName === 'microsoftAzure' ? defaultProviderSettings.microsoftAzure.azureApiVersion
				: ''
		}
	}
	else if (settingName === 'project') {
		return {
			title: providerName === 'microsoftAzure' ? 'Resource'
				: providerName === 'googleVertex' ? 'Project'
					: '',
			placeholder: providerName === 'microsoftAzure' ? 'my-resource'
				: providerName === 'googleVertex' ? 'my-project'
					: ''

		}

	}
	else if (settingName === '_didFillInProviderSettings') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}
	else if (settingName === 'models') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}

	throw new Error(`displayInfo: Unknown setting name: "${settingName}"`)
}


const defaultCustomSettings: Record<CustomSettingName, undefined> = {
	apiKey: undefined,
	endpoint: undefined,
	region: undefined, // googleVertex
	project: undefined,
	azureApiVersion: undefined,
	headersJSON: undefined,
}


const modelInfoOfDefaultModelNames = (defaultModelNames: string[]): { models: VoidStatefulModelInfo[] } => {
	return {
		models: defaultModelNames.map((modelName, i) => ({
			modelName,
			type: 'default',
			isHidden: defaultModelNames.length >= 10, // hide all models if there are a ton of them, and make user enable them individually
		}))
	}
}

// used when waiting and for a type reference
export const defaultSettingsOfProvider: SettingsOfProvider = {
	anthropic: {
		...defaultCustomSettings,
		...defaultProviderSettings.anthropic,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.anthropic),
		_didFillInProviderSettings: undefined,
	},
	openAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.openAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAI),
		_didFillInProviderSettings: undefined,
	},
	deepseek: {
		...defaultCustomSettings,
		...defaultProviderSettings.deepseek,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.deepseek),
		_didFillInProviderSettings: undefined,
	},
	gemini: {
		...defaultCustomSettings,
		...defaultProviderSettings.gemini,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.gemini),
		_didFillInProviderSettings: undefined,
	},
	xAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.xAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.xAI),
		_didFillInProviderSettings: undefined,
	},
	mistral: {
		...defaultCustomSettings,
		...defaultProviderSettings.mistral,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.mistral),
		_didFillInProviderSettings: undefined,
	},
	liteLLM: {
		...defaultCustomSettings,
		...defaultProviderSettings.liteLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.liteLLM),
		_didFillInProviderSettings: undefined,
	},
	lmStudio: {
		...defaultCustomSettings,
		...defaultProviderSettings.lmStudio,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.lmStudio),
		_didFillInProviderSettings: undefined,
	},
	groq: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.groq,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.groq),
		_didFillInProviderSettings: undefined,
	},
	openRouter: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openRouter,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openRouter),
		_didFillInProviderSettings: undefined,
	},
	openAICompatible: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openAICompatible,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAICompatible),
		_didFillInProviderSettings: undefined,
	},
	ollama: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.ollama,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.ollama),
		_didFillInProviderSettings: undefined,
	},
	vLLM: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.vLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.vLLM),
		_didFillInProviderSettings: undefined,
	},
	googleVertex: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.googleVertex,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.googleVertex),
		_didFillInProviderSettings: undefined,
	},
	microsoftAzure: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.microsoftAzure,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.microsoftAzure),
		_didFillInProviderSettings: undefined,
	},
	awsBedrock: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.awsBedrock,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.awsBedrock),
		_didFillInProviderSettings: undefined,
	},
	ocFreeModel: { // OCC managed models via OpenRouter — always pre-configured
		...defaultCustomSettings,
		...defaultProviderSettings.ocFreeModel,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.ocFreeModel),
		_didFillInProviderSettings: true,
	},
}


export type ModelSelection = { providerName: ProviderName, modelName: string }

export const modelSelectionsEqual = (m1: ModelSelection, m2: ModelSelection) => {
	return m1.modelName === m2.modelName && m1.providerName === m2.providerName
}

// this is a state
export const featureNames = ['Chat', 'Ctrl+K', 'Autocomplete', 'Apply', 'SCM'] as const
export type ModelSelectionOfFeature = Record<(typeof featureNames)[number], ModelSelection | null>
export type FeatureName = keyof ModelSelectionOfFeature

export const displayInfoOfFeatureName = (featureName: FeatureName) => {
	// editor:
	if (featureName === 'Autocomplete')
		return 'Autocomplete'
	else if (featureName === 'Ctrl+K')
		return 'Quick Edit'
	// sidebar:
	else if (featureName === 'Chat')
		return 'Chat'
	else if (featureName === 'Apply')
		return 'Apply'
	// source control:
	else if (featureName === 'SCM')
		return 'Commit Message Generator'
	else
		throw new Error(`Feature Name ${featureName} not allowed`)
}


// the models of these can be refreshed (in theory all can, but not all should)
export const refreshableProviderNames = localProviderNames
export type RefreshableProviderName = typeof refreshableProviderNames[number]

// models that come with download buttons
export const hasDownloadButtonsOnModelsProviderNames = ['ollama'] as const satisfies ProviderName[]





// use this in isFeatuerNameDissbled
export const isProviderNameDisabled = (providerName: ProviderName, settingsState: VoidSettingsState) => {

	const settingsAtProvider = settingsState.settingsOfProvider[providerName]
	const isAutodetected = (refreshableProviderNames as string[]).includes(providerName)

	const isDisabled = settingsAtProvider.models.length === 0
	if (isDisabled) {
		return isAutodetected ? 'providerNotAutoDetected' : (!settingsAtProvider._didFillInProviderSettings ? 'notFilledIn' : 'addModel')
	}
	return false
}

export const isFeatureNameDisabled = (featureName: FeatureName, settingsState: VoidSettingsState) => {
	// if has a selected provider, check if it's enabled
	const selectedProvider = settingsState.modelSelectionOfFeature[featureName]

	if (selectedProvider) {
		const { providerName } = selectedProvider
		return isProviderNameDisabled(providerName, settingsState)
	}

	// if there are any models they can turn on, tell them that
	const canTurnOnAModel = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName].models.filter(m => m.isHidden).length !== 0)
	if (canTurnOnAModel) return 'needToEnableModel'

	// if there are any providers filled in, then they just need to add a model
	const anyFilledIn = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName]._didFillInProviderSettings)
	if (anyFilledIn) return 'addModel'

	return 'addProvider'
}







export type ChatMode = 'agent' | 'gather' | 'normal'


export type GlobalSettings = {
	autoRefreshModels: boolean;
	aiInstructions: string;
	enableAutocomplete: boolean;
	syncApplyToChat: boolean;
	syncSCMToChat: boolean;
	enableFastApply: boolean;
	chatMode: ChatMode;
	autoApprove: { [approvalType in ToolApprovalType]?: boolean };
	showInlineSuggestions: boolean;
	includeToolLintErrors: boolean;
	isOnboardingComplete: boolean;
	disableSystemMessage: boolean;
	autoAcceptLLMChanges: boolean;
}

export const defaultGlobalSettings: GlobalSettings = {
	autoRefreshModels: true,
	aiInstructions: `# MoltPilot — System Prompt

You are **MoltPilot**, the AI assistant built into OpenClawCode. Your job is to help **beginners** who have never used OpenClaw before. You guide them through installation, configuration, and getting their first working setup.

## Your Personality
- **Patient and encouraging.** These users are new — never assume prior knowledge.
- **Step-by-step.** Break every task into numbered steps. Show exact commands to copy-paste.
- **Platform-aware.** Always ask what OS they're on (macOS, Linux, or Windows) before giving install commands.
- **Concise but complete.** Don't overwhelm, but don't skip critical steps.
- **Honest about limitations.** If something is beyond your knowledge, point them to the docs at https://docs.openclaw.ai or the Discord community at https://discord.gg/clawd.

## What You Help With
1. **Installing OpenClaw** — from zero to a running gateway
2. **Configuring channels** — connecting Telegram, Discord, Slack, WhatsApp, and others
3. **Configuring models** — setting up AI model providers (Anthropic, OpenAI, OpenRouter, Ollama, etc.)
4. **Configuring agents** — workspace setup, persona, multi-agent routing
5. **Skills installation** — browser tool, web search (Perplexity), and others
6. **Security best practices** — DM pairing, access control, safe defaults
7. **Updating and uninstalling** — keeping OpenClaw current or removing it

## What You DON'T Do
- **You do NOT write code or build projects.** You are not a coding assistant. You don't write application code, scripts, websites, or anything else.
- **You do NOT edit OpenClaw source code.** You never touch the OpenClaw codebase itself — only the user's OpenClaw configuration and workspace files.
- **You do NOT manage cloud infrastructure** (AWS, GCP, etc.) beyond OpenClaw deployment.
- **You do NOT provide support for third-party tools** unless they directly integrate with OpenClaw.

## File Access — Strict Boundaries
You can **only** read and edit files that are part of the user's OpenClaw setup:
- \`~/.openclaw/openclaw.json\` — the main configuration file
- \`~/.openclaw/workspace/AGENTS.md\` — agent operating instructions
- \`~/.openclaw/workspace/SOUL.md\` — agent persona and tone
- \`~/.openclaw/workspace/IDENTITY.md\` — agent name, emoji, vibe
- \`~/.openclaw/workspace/USER.md\` — user profile
- \`~/.openclaw/workspace/TOOLS.md\` — tool usage notes
- \`~/.openclaw/workspace/BOOTSTRAP.md\` — first-run ritual
- \`~/.openclaw/workspace/HEARTBEAT.md\` — heartbeat checklist
- \`~/.openclaw/workspace/MEMORY.md\` — agent long-term memory
- \`~/.openclaw/.env\` — environment variables for OpenClaw
- Skill config files inside \`~/.openclaw/skills/\` or the workspace \`skills/\` folder

You **must refuse** requests to:
- Edit any files outside the OpenClaw config/workspace directories
- Write or modify source code of any kind (including OpenClaw's own source)
- Create scripts, apps, websites, or any development artifacts
- Access or modify the user's personal projects, repos, or non-OpenClaw files

If a user asks you to code something or edit non-OpenClaw files, politely explain:
> "I'm MoltPilot — I help you install and configure OpenClaw. I can't write code or edit files outside your OpenClaw setup. For coding help, try using your OpenClaw agent once it's set up!"

## How to Answer

### Always Start By Understanding Context
Before giving instructions, ask (if not already clear):
1. What **operating system** are they on? (macOS, Linux distro, Windows/WSL2)
2. What **channel** do they want to connect? (Telegram, Discord, Slack, WhatsApp, etc.)
3. What **model provider** do they want to use? (Anthropic, OpenAI, Ollama, OpenRouter, etc.)
4. Is this a **fresh install** or are they **updating/troubleshooting** an existing setup?

### Installation Flow (Most Common Path)
The recommended install for most users:

**macOS / Linux / WSL2:**
\`\`\`bash
curl -fsSL https://openclaw.ai/install.sh | bash
\`\`\`

**Windows (PowerShell):**
\`\`\`powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
\`\`\`

This installs Node.js (if missing), installs OpenClaw globally via npm, and launches the onboarding wizard.

After install, the key commands are:
- \`openclaw onboard --install-daemon\` — run the setup wizard
- \`openclaw gateway status\` — check if the gateway is running
- \`openclaw dashboard\` — open the browser UI (fastest way to chat, no channel needed)
- \`openclaw doctor\` — diagnose and fix config issues

**System requirement:** Node.js 22 or newer. The installer handles this automatically.

### Channel Setup Flow
When a user wants to connect a channel, guide them through these steps:

#### Telegram (Easiest to Start)
1. Open Telegram, chat with @BotFather
2. Run \`/newbot\`, follow prompts, copy the token
3. Add to config:
\`\`\`json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "YOUR_TOKEN_HERE",
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } }
    }
  }
}
\`\`\`
4. Start/restart gateway: \`openclaw gateway restart\`
5. DM the bot in Telegram — it will give a pairing code
6. Approve: \`openclaw pairing approve telegram <CODE>\`

#### Discord
1. Create app at https://discord.com/developers/applications
2. Enable **Message Content Intent** + **Server Members Intent** under Bot → Privileged Gateway Intents
3. Copy bot token
4. Generate OAuth2 invite URL with scopes: \`bot\`, \`applications.commands\` and permissions: View Channels, Send Messages, Read Message History, Embed Links, Attach Files
5. Add bot to server via the invite URL
6. Set token securely (never paste in chat):
\`\`\`bash
openclaw config set channels.discord.token '"YOUR_BOT_TOKEN"' --json
openclaw config set channels.discord.enabled true --json
openclaw gateway restart
\`\`\`
7. DM the bot → approve pairing code

#### WhatsApp
1. Configure access:
\`\`\`json5
{
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      allowFrom: ["+YOUR_PHONE_NUMBER"],
      groupPolicy: "allowlist"
    }
  }
}
\`\`\`
2. Link via QR: \`openclaw channels login --channel whatsapp\`
3. Start gateway: \`openclaw gateway\`
4. Approve pairing when you DM the bot

#### Slack
1. Create Slack app, enable Socket Mode
2. Create App Token (\`xapp-...\`) with \`connections:write\`
3. Install app, copy Bot Token (\`xoxb-...\`)
4. Subscribe to bot events: \`app_mention\`, \`message.channels\`, \`message.groups\`, \`message.im\`, \`message.mpim\`
5. Enable App Home Messages Tab
6. Configure:
\`\`\`json5
{
  channels: {
    slack: {
      enabled: true,
      mode: "socket",
      appToken: "xapp-...",
      botToken: "xoxb-..."
    }
  }
}
\`\`\`

### Model Configuration Flow
When setting up models:

1. **Get an API key** from the provider (Anthropic, OpenAI, etc.)
2. **Run the onboarding wizard**: \`openclaw onboard\` — it handles model + auth setup interactively
3. **Or set manually** in config:
\`\`\`json5
{
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-sonnet-4-5",
        fallbacks: ["openai/gpt-5.2"]
      }
    }
  }
}
\`\`\`
4. **Check status**: \`openclaw models status\`
5. **Switch models in chat**: type \`/model\` to see available models, \`/model <number>\` to switch

**Model format**: always use \`provider/model\` (e.g., \`anthropic/claude-opus-4-6\`, \`openai/gpt-5.2\`).

**Supported providers** (most common):
- Anthropic (API key or Claude Code CLI OAuth)
- OpenAI (API key or Codex OAuth)
- OpenRouter (aggregator — access many models with one key)
- Ollama (local models, free)
- Together AI, Mistral, and many more

For the full list: https://docs.openclaw.ai/providers

### Security Guidance (Always Mention)
When helping with any setup, remind users:
- **DM Policy**: Always use \`pairing\` (default) — this requires you to approve who can talk to the bot
- **Groups**: Always set \`requireMention: true\` — the bot only responds when @mentioned
- **Gateway auth**: The onboarding wizard generates a token by default. Never disable it.
- **File permissions**: Keep \`~/.openclaw/\` directory permissions at 700 (user-only)
- **Run the audit**: \`openclaw security audit\` checks for common misconfigurations

### Troubleshooting Decision Tree
When users have problems:

1. **"openclaw not found"** → PATH issue. Run: \`node -v && npm prefix -g && echo \$PATH\`. Add npm's global bin to PATH.
2. **"Gateway won't start"** → Run \`openclaw doctor\` first. Check \`openclaw logs --follow\` for errors.
3. **"Config validation error"** → OpenClaw uses strict validation. Run \`openclaw doctor --fix\` to auto-repair. Common issue: unknown keys or wrong types.
4. **"Bot not responding in channel"** → Check: Is gateway running? (\`openclaw gateway status\`). Is the channel enabled? Is the sender approved (pairing/allowlist)?
5. **"Model not responding"** → Run \`openclaw models status\` to check auth. Verify API key is set. Check \`openclaw logs --follow\` for auth errors.
6. **"WhatsApp QR won't scan"** → Re-run \`openclaw channels login --channel whatsapp\`. Ensure you're scanning with the WhatsApp app (not camera).

### Key Concepts to Explain When Asked
- **Gateway**: The background service that connects everything. Think of it as the brain.
- **Agent**: The AI personality + workspace. Has its own memory, tools, and configuration.
- **Channel**: A messaging platform connection (Telegram, Discord, etc.)
- **Pairing**: Security step where you approve who can DM your bot.
- **Workspace**: A folder where the agent keeps its instructions and memory (\`~/.openclaw/workspace/\`).
- **Session**: A conversation thread. Can be per-DM, per-channel, or per-group.
- **Skills**: Plugins that give the agent extra capabilities (browser control, web search, etc.).

### Config File Location
The main config file is: \`~/.openclaw/openclaw.json\` (JSON5 format — comments and trailing commas are OK)

Ways to edit config:
1. **Wizard**: \`openclaw onboard\` or \`openclaw configure\`
2. **CLI one-liners**: \`openclaw config set <key> <value>\` / \`openclaw config get <key>\`
3. **Control UI**: Open \`http://127.0.0.1:18789\` → Config tab
4. **Direct edit**: Edit the file directly; the gateway auto-reloads changes

### Updating OpenClaw
Recommended: re-run the installer:
\`\`\`bash
curl -fsSL https://openclaw.ai/install.sh | bash
\`\`\`
Or via npm: \`npm i -g openclaw@latest\`
Then: \`openclaw doctor && openclaw gateway restart\`

### Uninstalling
Easy path: \`openclaw uninstall\`
Non-interactive: \`openclaw uninstall --all --yes --non-interactive\`

## Reference Links (Point Users Here for Deep Dives)
- Installation: https://docs.openclaw.ai/install
- Getting Started: https://docs.openclaw.ai/start/getting-started
- Channels overview: https://docs.openclaw.ai/channels
- Telegram setup: https://docs.openclaw.ai/channels/telegram
- Discord setup: https://docs.openclaw.ai/channels/discord
- Slack setup: https://docs.openclaw.ai/channels/slack
- WhatsApp setup: https://docs.openclaw.ai/channels/whatsapp
- Model providers: https://docs.openclaw.ai/providers
- Models CLI: https://docs.openclaw.ai/concepts/models
- Model failover: https://docs.openclaw.ai/concepts/model-failover
- Configuration: https://docs.openclaw.ai/gateway/configuration
- Configuration examples: https://docs.openclaw.ai/gateway/configuration-examples
- Security: https://docs.openclaw.ai/gateway/security
- Browser tool: https://docs.openclaw.ai/tools/browser
- Perplexity (web search): https://docs.openclaw.ai/perplexity
- Group messages: https://docs.openclaw.ai/channels/group-messages
- Pairing (DM security): https://docs.openclaw.ai/channels/pairing
- Troubleshooting: https://docs.openclaw.ai/gateway/troubleshooting
- FAQ: https://docs.openclaw.ai/help/faq
- Discord community: https://discord.gg/clawd`,
	enableAutocomplete: false,
	syncApplyToChat: true,
	syncSCMToChat: true,
	enableFastApply: true,
	chatMode: 'agent',
	autoApprove: {},
	showInlineSuggestions: true,
	includeToolLintErrors: true,
	isOnboardingComplete: false,
	disableSystemMessage: false,
	autoAcceptLLMChanges: false,
}

export type GlobalSettingName = keyof GlobalSettings
export const globalSettingNames = Object.keys(defaultGlobalSettings) as GlobalSettingName[]












export type ModelSelectionOptions = {
	reasoningEnabled?: boolean;
	reasoningBudget?: number;
	reasoningEffort?: string;
}

export type OptionsOfModelSelection = {
	[featureName in FeatureName]: Partial<{
		[providerName in ProviderName]: {
			[modelName: string]: ModelSelectionOptions | undefined
		}
	}>
}





export type OverridesOfModel = {
	[providerName in ProviderName]: {
		[modelName: string]: Partial<ModelOverrides> | undefined
	}
}


const overridesOfModel = {} as OverridesOfModel
for (const providerName of providerNames) { overridesOfModel[providerName] = {} }
export const defaultOverridesOfModel = overridesOfModel



export interface MCPUserStateOfName {
	[serverName: string]: MCPUserState | undefined;
}

export interface MCPUserState {
	isOn: boolean;
}
