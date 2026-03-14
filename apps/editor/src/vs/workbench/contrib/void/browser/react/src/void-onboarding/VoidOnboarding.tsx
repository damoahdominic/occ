/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { ChevronRight } from 'lucide-react';
import { ProviderName, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { SettingsForProvider, OllamaSetupInstructions, ModelDump } from '../void-settings-tsx/Settings.js';
import { providerIconAnthropicSrc, providerIconOpenAISrc, providerIconGeminiSrc } from '../util/providerIcons.js';
import { ColorScheme } from '../../../../../../../platform/theme/common/theme.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { isLinux } from '../../../../../../../base/common/platform.js';

const OVERRIDE_VALUE = false

export const VoidOnboarding = () => {

	const voidSettingsState = useSettingsState()
	const isOnboardingComplete = voidSettingsState.globalSettings.isOnboardingComplete || OVERRIDE_VALUE

	const isDark = useIsDark()

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div
				className={`
					bg-void-bg-3 fixed top-0 right-0 bottom-0 left-0 width-full z-[99999]
					transition-all duration-1000 ${isOnboardingComplete ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
				`}
				style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
			>
				<ErrorBoundary>
					<VoidOnboardingContent />
				</ErrorBoundary>
			</div>
		</div>
	)
}

const VoidIcon = () => {
	const accessor = useAccessor()
	const themeService = accessor.get('IThemeService')

	const divRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		// void icon style
		const updateTheme = () => {
			const theme = themeService.getColorTheme().type
			const isDark = theme === ColorScheme.DARK || theme === ColorScheme.HIGH_CONTRAST_DARK
			if (divRef.current) {
				divRef.current.style.maxWidth = '220px'
				divRef.current.style.opacity = '90%'
				divRef.current.style.filter = ''
				divRef.current.style.borderRadius = '28px'
			}
		}
		updateTheme()
		const d = themeService.onDidColorThemeChange(updateTheme)
		return () => d.dispose()
	}, [])

	return <div ref={divRef} className='@@void-void-icon' />
}

const OccIconSmall = () => {
	const divRef = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		if (divRef.current) {
			divRef.current.style.width = '40px'
			divRef.current.style.height = '40px'
			divRef.current.style.minWidth = '40px'
			divRef.current.style.borderRadius = '10px'
			divRef.current.style.opacity = '95%'
		}
	}, [])
	return <div ref={divRef} className='@@void-void-icon' />
}


const FADE_DURATION_MS = 2000

const FadeIn = ({ children, className, delayMs = 0, durationMs, ...props }: { children: React.ReactNode, delayMs?: number, durationMs?: number, className?: string } & React.HTMLAttributes<HTMLDivElement>) => {

	const [opacity, setOpacity] = useState(0)

	const effectiveDurationMs = durationMs ?? FADE_DURATION_MS

	useEffect(() => {

		const timeout = setTimeout(() => {
			setOpacity(1)
		}, delayMs)

		return () => clearTimeout(timeout)
	}, [setOpacity, delayMs])


	return (
		<div className={className} style={{ opacity, transition: `opacity ${effectiveDurationMs}ms ease-in-out` }} {...props}>
			{children}
		</div>
	)
}

// Onboarding

// =============================================
// 	OnboardingPage
// 		title:
// 			div
// 				"Welcome to Void"
// 			image
// 		content:<></>
// 		title
// 		content
// 		prev/next

// 	OnboardingPage
// 		title:
// 			div
// 				"How would you like to use Void?"
// 		content:
// 			ModelQuestionContent
// 				|
// 					div
// 						"I want to:"
// 					div
// 						"Use the smartest models"
// 						"Keep my data fully private"
// 						"Save money"
// 						"I don't know"
// 				| div
// 					| div
// 						"We recommend using "
// 						"Set API"
// 					| div
// 						""
// 					| div
//
// 		title
// 		content
// 		prev/next
//
// 	OnboardingPage
// 		title
// 		content
// 		prev/next

const NextButton = ({ onClick, ...props }: { onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {

	// Create a new props object without the disabled attribute
	const { disabled, ...buttonProps } = props;

	return (
		<button
			onClick={disabled ? undefined : onClick}
			onDoubleClick={onClick}
			className={`px-6 py-2 bg-zinc-100 ${disabled
				? 'bg-zinc-100/40 cursor-not-allowed'
				: 'hover:bg-zinc-100'
				} rounded text-black duration-600 transition-all
			`}
			{...disabled && {
				'data-tooltip-id': 'void-tooltip',
				"data-tooltip-content": 'Please enter all required fields or choose another provider', // (double-click to proceed anyway, can come back in Settings)
				"data-tooltip-place": 'top',
			}}
			{...buttonProps}
		>
			Next
		</button>
	)
}

const PreviousButton = ({ onClick, ...props }: { onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
	return (
		<button
			onClick={onClick}
			className="px-6 py-2 rounded text-void-fg-3 opacity-80 hover:brightness-115 duration-600 transition-all"
			{...props}
		>
			Back
		</button>
	)
}



const OnboardingPageShell = ({ top, bottom, content, hasMaxWidth = true, className = '', }: {
	top?: React.ReactNode,
	bottom?: React.ReactNode,
	content?: React.ReactNode,
	hasMaxWidth?: boolean,
	className?: string,
}) => {
	return (
		<div className={`h-[80vh] text-lg flex flex-col gap-4 w-full mx-auto ${hasMaxWidth ? 'max-w-[600px]' : ''} ${className}`}>
			{top && <FadeIn className='w-full mb-auto pt-16'>{top}</FadeIn>}
			{content && <FadeIn className='w-full my-auto'>{content}</FadeIn>}
			{bottom && <div className='w-full pb-8'>{bottom}</div>}
		</div>
	)
}



const PrimaryActionButton = ({ children, className, ringSize, ...props }: { children: React.ReactNode, ringSize?: undefined | 'xl' | 'screen' } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {


	return (
		<button
			type='button'
			className={`
				flex items-center justify-center

				text-white dark:text-black
				bg-black/90 dark:bg-white/90

				${ringSize === 'xl' ? `
					gap-2 px-16 py-8
					transition-all duration-300 ease-in-out
					`
					: ringSize === 'screen' ? `
					gap-2 px-16 py-8
					transition-all duration-1000 ease-in-out
					`: ringSize === undefined ? `
					gap-1 px-4 py-2
					transition-all duration-300 ease-in-out
				`: ''}

				rounded-lg
				group
				${className}
			`}
			{...props}
		>
			{children}
			<ChevronRight
				className={`
					transition-all duration-300 ease-in-out

					transform
					group-hover:translate-x-1
					group-active:translate-x-1
				`}
			/>
		</button>
	)
}


const VoidOnboardingContent = () => {

	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidMetricsService = accessor.get('IMetricsService')
	const commandService = accessor.get('ICommandService')

	const voidSettingsState = useSettingsState()

	const [pageIndex, setPageIndex] = useState(0)
	const [aiChoice, setAiChoice] = useState<'occlegacy' | 'byok' | null>(null)
	const byokProviders: ProviderName[] = ['anthropic', 'openAI', 'openRouter', 'gemini', 'ollama']
	const [selectedProvider, setSelectedProvider] = useState<ProviderName>('anthropic')

	// reset the page to page 0 if the user redos onboarding
	useEffect(() => {
		if (!voidSettingsState.globalSettings.isOnboardingComplete) {
			setPageIndex(0)
		}
	}, [setPageIndex, voidSettingsState.globalSettings.isOnboardingComplete])

	const completeOnboarding = () => {
		commandService.executeCommand('occ.onboarding.darkTheme')
		voidSettingsService.setGlobalSetting('isOnboardingComplete', true)
		voidMetricsService.capture('Completed Onboarding', { aiChoice })
	}

	// OCC Legacy deep-link: auto-complete via event subscription (primary path)
	const occLegacyJwt = voidSettingsState.globalSettings.occLegacyJwt
	useEffect(() => {
		if (occLegacyJwt && pageIndex === 2) {
			completeOnboarding()
		}
	}, [occLegacyJwt])

	// OCC Legacy deep-link: polling fallback — directly reads service state every 500ms
	// This fires even if the _onDidChangeState event chain is broken
	useEffect(() => {
		if (pageIndex !== 2) return
		const interval = setInterval(() => {
			const jwt = voidSettingsService.state.globalSettings.occLegacyJwt
			if (jwt) {
				clearInterval(interval)
				completeOnboarding()
			}
		}, 500)
		return () => clearInterval(interval)
	}, [pageIndex])

	const contentOfIdx: { [pageIndex: number]: React.ReactNode } = {
		// ── Page 0: Welcome ────────────────────────────────────────────────────
		0: <OnboardingPageShell
			content={
				<div className='flex flex-col items-center gap-8'>
					<div className="text-5xl font-light text-center">Welcome to OpenClaw Code</div>

					<div className='max-w-md w-full h-[30vh] mx-auto flex items-center justify-center'>
						{!isLinux && <VoidIcon />}
					</div>

					<FadeIn delayMs={1000}>
						<PrimaryActionButton onClick={() => setPageIndex(1)}>
							Get Started
						</PrimaryActionButton>
					</FadeIn>
				</div>
			}
		/>,

		// ── Page 1: Choose your AI ─────────────────────────────────────────────
		1: <OnboardingPageShell
			content={
				<div className='flex flex-col items-center gap-8 w-full'>
					<div className="text-5xl font-light text-center">Choose your AI</div>
					<p className="text-void-fg-3 text-sm text-center">How do you want to power your AI assistant?</p>

					<div className="flex flex-col gap-3 w-full max-w-md mt-2">
						{/* OCC Legacy — big primary card */}
						<button
							onClick={() => {
								setAiChoice('occlegacy')
								commandService.executeCommand('occ.onboarding.openSignupUrl')
								setPageIndex(2)
							}}
							className={`flex flex-col gap-3 p-6 rounded-xl border text-left transition-all duration-200
								${aiChoice === 'occlegacy'
									? 'border-emerald-500 bg-emerald-500/10'
									: 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/70 hover:bg-emerald-500/10'
								}`}
						>
							<div className="flex items-center justify-between">
								<OccIconSmall />
								<span className="text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">Recommended</span>
							</div>
							<div className="flex items-baseline gap-2">
								<div className="text-2xl font-bold">$5</div>
								<span className="text-sm font-normal text-void-fg-3">free to start</span>
							</div>
							<div className="text-base font-semibold">OCC Legacy</div>
							<div className="text-sm text-void-fg-3 leading-relaxed">Free inference for up to $5. Sign up at MBA.sh — no card needed.</div>
							<div className="mt-1 text-sm font-semibold text-emerald-400">Start Free →</div>
						</button>

						{/* BYOK — smaller secondary option */}
						<button
							onClick={() => {
								setAiChoice('byok')
								setPageIndex(3)
							}}
							className={`flex items-center justify-between px-5 py-3.5 rounded-xl border text-left transition-all duration-200
								${aiChoice === 'byok'
									? 'border-[#dc2828] bg-[#dc2828]/10'
									: 'border-void-border-2 bg-void-bg-2 hover:border-void-border-1'
								}`}
						>
							<div className="flex flex-col gap-1.5">
								<div className="text-sm font-semibold text-void-fg-2">Bring Your Own Key</div>
								<div className="flex items-center gap-1.5">
									<img src={providerIconOpenAISrc} title="OpenAI" alt="OpenAI" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
									<img src={providerIconAnthropicSrc} title="Anthropic" alt="Anthropic" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
									<img src={providerIconGeminiSrc} title="Google Gemini" alt="Gemini" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
									{/* OpenRouter */}
									<span title="OpenRouter" style={{display:'flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'#7c3aed',flexShrink:0}}>
										<svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M16.54 7.9l.04.08 2.88 6.48-.04-.08-2.88-6.48zm4.83 5.75L16.3 2.06A1.5 1.5 0 0014.94 1h-2.3L6.5 13.56a6.27 6.27 0 00-.38 1.15 3.83 3.83 0 003.14 4.57l.37.04H11v2.18A1.5 1.5 0 0012.5 23h5a1.5 1.5 0 001.5-1.5V19h.5a3.5 3.5 0 003.5-3.5 3.47 3.47 0 00-.63-2.01zM17.5 20h-4v-1.7h4V20zm1-3.2H9.63a1.33 1.33 0 01-.12-2.65l.12-.01h.72L14.48 4h.46l4.63 10.4a.5.5 0 01-.07.4z"/></svg>
									</span>
									{/* Ollama */}
									<span title="Ollama" style={{display:'flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'#525252',flexShrink:0}}>
										<svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.4a9.6 9.6 0 1 1 0 19.2A9.6 9.6 0 0 1 12 2.4zm-2.4 4.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zm4.8 0a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zm-2.4 5.76a5.76 5.76 0 0 0-5.76 5.76h11.52A5.76 5.76 0 0 0 12 12.96z"/></svg>
									</span>
								</div>
							</div>
							<span className="text-xs text-void-fg-3 ml-4 flex-shrink-0">→</span>
						</button>
					</div>
				</div>
			}
			bottom={
				<div className="max-w-[600px] w-full mx-auto flex justify-start">
					<PreviousButton onClick={() => setPageIndex(0)} />
				</div>
			}
		/>,

		// ── Page 2: OCC Legacy — opening browser, waiting for deep-link auth ──
		2: <OnboardingPageShell
				content={
					<div className='flex flex-col items-center gap-8 w-full max-w-md mx-auto text-center'>
						<div className="text-5xl font-light">Almost there</div>

						<div className="flex flex-col items-center gap-6">
							{/* Animated spinner ring */}
							<div className="relative w-16 h-16">
								<div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 absolute inset-0" />
								<div className="w-16 h-16 rounded-full border-4 border-transparent border-t-emerald-400 absolute inset-0 animate-spin" />
							</div>

							<div className="flex flex-col gap-2">
								<div className="text-lg font-medium">Waiting for sign-up…</div>
								<div className="text-sm text-void-fg-3 leading-relaxed max-w-xs">
									We opened{' '}
									<button
										onClick={() => commandService.executeCommand('occ.onboarding.openSignupUrl')}
										className="text-emerald-400 font-medium underline hover:text-emerald-300 transition-colors"
									>
										occ.mba.sh/signup
									</button>
									{' '}in your browser. Sign up to claim your $5 in free inference credits, then you'll be redirected back automatically.
								</div>
							</div>

							{/* Manual fallback (shown after 30 s in case deep link doesn't fire) */}
							<FadeIn delayMs={30000} className="text-xs text-void-fg-3">
								Taking longer than expected?{' '}
								<button
									onClick={completeOnboarding}
									className="underline hover:text-void-fg-1 transition-colors"
								>
									Continue manually
								</button>
							</FadeIn>
						</div>
					</div>
				}
				bottom={
					<div className="max-w-[600px] w-full mx-auto flex justify-start">
						<PreviousButton onClick={() => setPageIndex(1)} />
					</div>
				}
		/>,

		// ── Page 3: BYOK — pick provider + API key + model selection ─────────────
		3: (() => {
			const providerSettings = voidSettingsState.settingsOfProvider[selectedProvider]
			const keyFilled = providerSettings._didFillInProviderSettings
			const hasModels = providerSettings.models.filter(m => !m.isHidden).length > 0
			const canContinue = selectedProvider === 'ollama' ? hasModels : (keyFilled && hasModels)

			return <OnboardingPageShell
				hasMaxWidth={false}
				content={
					<div className='flex flex-col items-center gap-4 w-full max-w-3xl mx-auto'>
						<div className="text-5xl font-light text-center">Connect your API key</div>
						<p className="text-void-fg-3 text-sm text-center">Choose a provider, enter your API key, then enable the models you want to use.</p>

						<div className="flex gap-6 w-full mt-2">
							{/* Provider list */}
							<div className="flex flex-col gap-2 w-36 flex-shrink-0">
								{byokProviders.map(p => (
									<button
										key={p}
										onClick={() => setSelectedProvider(p)}
										className={`px-3 py-2 rounded-lg text-sm text-left transition-all duration-150
											${selectedProvider === p
												? 'bg-[#dc2828]/20 border border-[#dc2828]/60 text-void-fg-1 font-medium'
												: 'bg-void-bg-2 border border-void-border-2 text-void-fg-3 hover:border-void-border-1'
											}`}
									>
										{displayInfoOfProviderName(p).title}
									</button>
								))}
							</div>

							{/* Right column: API key + models */}
							<div className="flex-1 overflow-y-auto max-h-[50vh] flex flex-col gap-6">
								{/* API key */}
								<div>
									<SettingsForProvider providerName={selectedProvider} showProviderTitle={false} showProviderSuggestions={false} />
									{selectedProvider === 'ollama' && <OllamaSetupInstructions sayWeAutoDetect={true} />}
								</div>

								{/* Model selection */}
								<div>
									<div className="text-sm font-semibold mb-2 text-void-fg-1">
										Models
										{!keyFilled && selectedProvider !== 'ollama' && (
											<span className="ml-2 text-xs text-void-fg-3 font-normal">— enter your API key above to enable</span>
										)}
									</div>
									<div className={!keyFilled && selectedProvider !== 'ollama' ? 'opacity-40 pointer-events-none' : ''}>
										<ModelDump filteredProviders={[selectedProvider]} />
									</div>
								</div>
							</div>
						</div>
					</div>
				}
				bottom={
					<div className="max-w-[700px] w-full mx-auto flex items-center justify-between">
						<PreviousButton onClick={() => setPageIndex(1)} />
						<div className="flex flex-col items-end gap-1">
							{!canContinue && (
								<span className="text-xs text-void-fg-3">
									{selectedProvider === 'ollama'
										? 'Enable at least one Ollama model to continue'
										: !keyFilled
											? 'Enter your API key to continue'
											: 'Enable at least one model to continue'}
								</span>
							)}
							<PrimaryActionButton
								onClick={canContinue ? completeOnboarding : undefined}
								className={!canContinue ? 'opacity-40 cursor-not-allowed' : ''}
							>
								Enter OpenClaw Code
							</PrimaryActionButton>
						</div>
					</div>
				}
			/>
		})(),

	}

	return <div key={pageIndex} className="w-full h-[80vh] text-left mx-auto flex flex-col items-center justify-center">
		<ErrorBoundary>
			{contentOfIdx[pageIndex]}
		</ErrorBoundary>
	</div>

}
