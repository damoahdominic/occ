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
import { lobsterSvgSrc } from '../util/lobsterSvg.js';
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


// Provider icon SVGs for BYOK card
const ChatGPTIcon = () => (
	<svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
		<g clipPath="url(#cgpt)">
			<path d="M18.7699 8.50813C19.2473 7.15438 19.1172 5.66 18.4133 4.40878C17.3553 2.49002 15.179 1.47439 13.0288 1.89692C12.0945 0.806703 10.736 0.172272 9.30047 0.155965C7.11089 0.112745 5.14345 1.48862 4.43343 3.56029C3.02175 3.82382 1.79219 4.68312 1.05989 5.91865C-0.072393 7.79418 0.136504 10.1869 1.57667 11.8373C1.09922 13.1911 1.22941 14.6854 1.93331 15.9367C2.99123 17.8554 5.16759 18.8711 7.31779 18.4485C8.2514 19.5387 9.61054 20.1732 11.0461 20.1889C13.2369 20.2327 15.205 18.8556 15.9151 16.7821C17.3267 16.5185 18.5563 15.6592 19.2886 14.4237C20.4196 12.5482 20.2101 10.1573 18.7705 8.50689L18.7699 8.50813ZM11.0702 18.8822C10.1934 18.8682 9.34951 18.5465 8.6863 17.973C8.7172 17.9573 8.77083 17.9288 8.80557 17.9082L12.8276 15.678C13.0333 15.566 13.1621 15.3513 13.1649 15.1169L13.2629 9.50342L14.9288 10.5045C14.9468 10.5136 14.9584 10.5313 14.9605 10.5513L14.8794 15.2C14.8408 17.2671 13.1374 18.9139 11.0702 18.8822ZM3.07892 15.3028C2.65285 14.5365 2.51027 13.6445 2.67594 12.7842C2.705 12.8022 2.75631 12.8349 2.79281 12.8568L6.73457 15.226C6.93435 15.3476 7.18431 15.352 7.38884 15.2374L12.299 12.5152L12.2651 14.4586C12.266 14.4787 12.2562 14.4979 12.2404 14.5101L8.17482 16.7639C6.36395 17.7649 4.08501 17.1113 3.07954 15.3028L3.07892 15.3028ZM2.18267 6.59272C2.63337 5.84048 3.33403 5.27137 4.16167 4.98389C4.16107 5.01826 4.15814 5.07885 4.1574 5.12134L4.07711 9.72126C4.07178 9.95496 4.19297 10.174 4.39405 10.2931L9.2062 13.1844L7.50637 14.1268C7.4893 14.1377 7.46802 14.1392 7.44941 14.1308L3.46438 11.7346C1.69336 10.6673 1.11966 8.36757 2.18203 6.59334L2.18267 6.59272ZM15.9531 10.0517L11.141 7.15978L12.8408 6.21805C12.8579 6.2071 12.8792 6.2056 12.8978 6.21405L16.8829 8.60833C18.657 9.67509 19.2313 11.9786 18.1645 13.7527C17.7132 14.5037 17.0132 15.0728 16.1862 15.361L16.2688 10.6236C16.2748 10.3899 16.1542 10.1715 15.9538 10.0517L15.9531 10.0517ZM17.6719 7.56007C17.6428 7.54144 17.5915 7.50929 17.555 7.4874L13.6133 5.11824C13.4135 4.99661 13.1635 4.99225 12.959 5.10682L8.04886 7.82904L8.08278 5.88559C8.08188 5.86557 8.09159 5.84636 8.10744 5.83413L12.173 3.58224C13.9839 2.57932 16.2653 3.23486 17.2676 5.04638C17.6912 5.81139 17.8338 6.70089 17.6706 7.56005L17.6719 7.56007ZM7.08116 10.8401L5.41463 9.839C5.39666 9.82993 5.38509 9.81223 5.38294 9.79219L5.46409 5.14352C5.50146 3.07386 7.20986 1.42592 9.27952 1.4633C10.155 1.47858 10.997 1.80082 11.6603 2.37249C11.6294 2.3882 11.5764 2.41665 11.541 2.43729L7.51896 4.66744C7.31322 4.77949 7.18447 4.99352 7.18162 5.22789L7.08118 10.8389L7.08116 10.8401ZM8.0298 8.88512L10.2169 7.67248L12.3604 8.96009L12.3168 11.4603L10.1297 12.6723L7.98617 11.3847L8.0298 8.88512Z" fill="white" fillOpacity="0.6"/>
		</g>
		<defs><clipPath id="cgpt"><rect width="20" height="20" fill="white" transform="translate(0.349609) rotate(1)"/></clipPath></defs>
	</svg>
)

const AnthropicIcon = () => (
	<svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
		<g clipPath="url(#anth)">
			<path fillRule="evenodd" clipRule="evenodd" d="M12.0986 3H15.2513L21 17.42H17.8474L12.0986 3ZM5.74787 3H9.044L14.7928 17.42H11.578L10.4029 14.3916H4.38988L3.21388 17.4191H0L5.74875 3.00175L5.74787 3ZM9.36338 11.7141L7.39638 6.64612L5.42937 11.715H9.3625L9.36338 11.7141Z" fill="white" fillOpacity="0.6"/>
		</g>
		<defs><clipPath id="anth"><rect width="21" height="21" fill="white"/></clipPath></defs>
	</svg>
)

const AIStudioIcon = () => (
	<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<g clipPath="url(#aist)">
			<path fillRule="evenodd" clipRule="evenodd" d="M9.921 4.19627H6.328C5.61076 4.19627 4.92289 4.48112 4.41563 4.98819C3.90837 5.49526 3.62327 6.18303 3.623 6.90027V18.2623C3.623 18.9797 3.90799 19.6677 4.41528 20.175C4.92256 20.6823 5.61059 20.9673 6.328 20.9673H17.691C18.4084 20.9673 19.0964 20.6823 19.6037 20.175C20.111 19.6677 20.396 18.9797 20.396 18.2623V13.5063L22.019 12.3933V18.2633C22.0187 19.411 21.5627 20.5117 20.7511 21.3233C19.9395 22.1349 18.8388 22.591 17.691 22.5913H6.328C5.18022 22.591 4.07953 22.1349 3.26793 21.3233C2.45633 20.5117 2.00027 19.411 2 18.2633V6.90127C1.99987 6.33282 2.11172 5.76992 2.32916 5.2447C2.54661 4.71949 2.86538 4.24226 3.26729 3.84026C3.66919 3.43826 4.14635 3.11938 4.67151 2.90181C5.19668 2.68425 5.75955 2.57227 6.328 2.57227H10.873L9.921 4.19627Z" fill="white" fillOpacity="0.6"/>
			<path fillRule="evenodd" clipRule="evenodd" d="M17.8207 0C17.9657 0 18.0887 0.104 18.1197 0.246C18.4036 1.5663 19.0635 2.77626 20.0197 3.73C20.9735 4.68669 22.1839 5.34691 23.5047 5.631C23.6467 5.662 23.7507 5.785 23.7507 5.931C23.7498 6.00129 23.725 6.06917 23.6802 6.12338C23.6355 6.17758 23.5735 6.21486 23.5047 6.229C22.1842 6.51327 20.9743 7.17348 20.0207 8.13C19.0515 9.09611 18.3868 10.3251 18.1087 11.665C18.0952 11.7316 18.0592 11.7916 18.0068 11.835C17.9543 11.8783 17.8887 11.9023 17.8207 11.903C17.7527 11.9023 17.687 11.8783 17.6345 11.835C17.5821 11.7916 17.5462 11.7316 17.5327 11.665C17.2546 10.3251 16.5898 9.09611 15.6207 8.13C14.6545 7.16083 13.4255 6.4961 12.0857 6.218C12.019 6.2045 11.959 6.16853 11.9157 6.11611C11.8724 6.06369 11.8484 5.998 11.8477 5.93C11.8477 5.79 11.9477 5.67 12.0857 5.642C13.4255 5.3639 14.6545 4.69917 15.6207 3.73C16.5771 2.77635 17.2373 1.56639 17.5217 0.246C17.5358 0.17698 17.5733 0.114909 17.6277 0.0701419C17.6821 0.0253744 17.7502 0.000617143 17.8207 0Z" fill="white" fillOpacity="0.6"/>
		</g>
		<defs><clipPath id="aist"><rect width="24" height="24" fill="white"/></clipPath></defs>
	</svg>
)

const OllamaIcon = () => (
	<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path fillRule="evenodd" clipRule="evenodd" d="M7.90516 1.09021C8.12116 1.17521 8.31616 1.31521 8.49316 1.50021C8.78816 1.80621 9.03716 2.24421 9.22716 2.76321C9.41816 3.28521 9.54216 3.86321 9.58916 4.44321C10.2188 4.08702 10.9175 3.87013 11.6382 3.80721L11.6892 3.80321C12.5592 3.73321 13.4192 3.89021 14.1692 4.27721C14.2702 4.33021 14.3692 4.38721 14.4662 4.44721C14.5162 3.87821 14.6382 3.31321 14.8262 2.80321C15.0162 2.28321 15.2652 1.84621 15.5592 1.53921C15.7235 1.36148 15.9244 1.22158 16.1482 1.12921C16.4052 1.02921 16.6782 1.01121 16.9442 1.08721C17.3452 1.20121 17.6892 1.45521 17.9602 1.82421C18.2082 2.16121 18.3942 2.59321 18.5212 3.11121C18.7512 4.04521 18.7912 5.27421 18.6362 6.75621L18.6892 6.79621L18.7152 6.81521C19.4722 7.39121 19.9992 8.21221 20.2782 9.16521C20.7132 10.6522 20.4942 12.3202 19.7442 13.2532L19.7262 13.2742L19.7282 13.2772C20.1452 14.0392 20.3982 14.8442 20.4522 15.6772L20.4542 15.7072C20.5182 16.7722 20.2542 17.8442 19.6402 18.8972L19.6332 18.9072L19.6432 18.9312C20.1152 20.0882 20.2632 21.2532 20.0812 22.4172L20.0752 22.4562C20.047 22.6262 19.9525 22.7781 19.8125 22.8786C19.6724 22.9791 19.4983 23.02 19.3282 22.9922C19.1439 22.9791 18.9784 22.8952 18.8606 22.7592C18.7427 22.6233 18.6826 22.4464 18.6882 22.2502C18.8552 21.2172 18.7982 20.1812 18.3082 19.1272C18.2182 18.9272 18.2482 18.6892 18.3482 18.5102C18.9562 17.5802 19.2062 16.6742 19.1522 15.7842C19.1062 15.0052 18.8272 14.2402 18.3522 13.5112C18.1682 13.2352 18.2182 12.8662 18.5322 12.6252C18.7842 12.4602 19.0082 12.0542 19.1212 11.4992C19.2458 10.8429 19.2133 10.1665 19.0262 9.52521C18.8212 8.82521 18.4462 8.24121 17.9212 7.84221C17.3262 7.38821 16.5382 7.16921 15.5412 7.23221C15.2552 7.24921 14.9842 7.07421 14.9092 6.86121C14.5952 6.19621 14.1372 5.72021 13.5662 5.42521C13.018 5.15161 12.4042 5.03662 11.7942 5.09321C10.5492 5.19221 9.45116 5.89421 9.12416 6.77921C9.02916 7.03421 8.78116 7.20421 8.51416 7.20421C7.44716 7.20621 6.62116 7.45621 6.01716 7.90721C5.49516 8.29721 5.13916 8.84221 4.95116 9.49521C4.78104 10.1099 4.75774 10.7559 4.88316 11.3812C4.99516 11.9392 5.21416 12.4012 5.46516 12.6502C5.68516 12.8642 5.73016 13.1872 5.58216 13.4422C5.22216 14.0642 4.95316 14.9912 4.90916 15.8822C4.85916 16.9002 5.09516 17.7842 5.62816 18.4182C5.73616 18.5502 5.76816 18.7272 5.73916 18.9272C5.16316 20.3632 4.98616 21.3792 5.17716 22.1792C5.21149 22.3456 5.17955 22.5188 5.08813 22.6619C4.99671 22.8051 4.85303 22.9069 4.68767 22.9457C4.52231 22.9846 4.34832 22.9573 4.20274 22.8698C4.05715 22.7823 3.95146 22.6415 3.90816 22.4772C3.66516 21.4592 3.83016 20.2932 4.38116 18.9792L4.39516 18.9442L4.38716 18.9322C3.63316 17.8922 3.20316 16.6342 3.60716 15.8192C3.65116 14.9092 3.88516 13.9772 4.22916 13.2292C3.94616 12.7832 3.72916 12.2482 3.60916 11.6562C3.43882 10.8065 3.47069 9.95334 3.69716 9.14221C3.95916 8.22721 4.47416 7.44121 5.23316 6.87321C5.29316 6.82821 5.35616 6.78321 5.41916 6.74121C5.26016 5.24821 5.30016 4.01121 5.53116 3.07121C5.65816 2.55321 5.84516 2.12121 6.09316 1.78421C6.36316 1.41621 6.70716 1.16221 7.10816 1.04721C7.37416 0.971214 7.64816 0.988214 7.90516 1.08921V1.09021ZM12.0212 10.1802C12.9572 10.1802 13.8212 10.4932 14.4672 11.0352C15.0972 11.5622 15.4722 12.2702 15.4722 12.9752C15.4722 13.8632 15.0662 14.5552 14.3392 14.9972C13.7192 15.3722 12.8882 15.5542 11.9362 15.5542C10.9272 15.5542 10.0652 15.2952 9.44316 14.8202C8.82616 14.3502 8.48016 13.6902 8.48016 12.9752C8.48016 12.2682 8.87816 11.5582 9.53616 11.0292C10.2042 10.4922 11.0862 10.1802 12.0212 10.1802Z" fill="white" fillOpacity="0.6"/>
	</svg>
)

const XAIIcon = () => (
	<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path fillRule="evenodd" clipRule="evenodd" d="M6.469 8.776L16.512 23H12.048L2.005 8.776H6.469ZM6.465 16.676L8.698 19.84L6.467 23H2L6.465 16.676ZM22 2.582V23H18.341V7.764L22 2.582ZM22 1L12.048 15.095L9.815 11.932L17.533 1H22Z" fill="white" fillOpacity="0.6"/>
	</svg>
)

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
			hasMaxWidth={false}
			content={
				<div className='flex flex-col items-center gap-6 w-full'>
					<div className="text-5xl font-light text-center">Choose your AI</div>
					<p className="text-void-fg-3 text-sm text-center">How do you want to power your AI assistant?</p>

					<div className="flex flex-col gap-3 w-full max-w-2xl mt-2">
						{/* OCC Legacy — big hero card */}
						<button
							onClick={() => {
								setAiChoice('occlegacy')
								commandService.executeCommand('occ.onboarding.openSignupUrl')
								setPageIndex(2)
							}}
							style={{
								background: 'linear-gradient(135deg, #1a0505 0%, #1f0808 50%, #2a0a0a 100%)',
								border: aiChoice === 'occlegacy' ? '1px solid rgba(220,40,40,0.6)' : '1px solid rgba(220,40,40,0.25)',
								position: 'relative',
								overflow: 'hidden',
							}}
							className="flex flex-col px-6 py-5 rounded-2xl text-left transition-all duration-200 hover:border-[rgba(220,40,40,0.5)]"
						>
							{/* Red radial glow top-right */}
							<div style={{
								position: 'absolute', top: 0, right: 0, width: '55%', height: '100%',
								background: 'radial-gradient(ellipse at 90% 10%, rgba(180,20,20,0.35) 0%, transparent 65%)',
								pointerEvents: 'none',
							}} />

							{/* Lobster silhouette */}
							<img
								src={lobsterSvgSrc}
								alt=""
								style={{
									position: 'absolute', right: '-10px', bottom: '-8px',
									width: '200px', opacity: 0.18,
									pointerEvents: 'none', userSelect: 'none',
									filter: 'brightness(0) invert(1)',
								}}
							/>

							{/* Top row: OCC icon + Recommended badge */}
							<div className="flex items-center justify-between w-full mb-4" style={{position:'relative',zIndex:1}}>
								<OccIconSmall />
								<span style={{
									fontSize: '11px', fontWeight: 600,
									background: 'rgba(20,8,8,0.75)', border: '1px solid rgba(220,40,40,0.3)',
									color: 'rgba(255,255,255,0.75)',
									padding: '3px 10px', borderRadius: 999,
									backdropFilter: 'blur(4px)',
								}}>Recommended</span>
							</div>

							{/* Title + subtitle */}
							<div style={{position:'relative',zIndex:1}}>
								<div className="text-xl font-bold text-white">OCC Legacy</div>
								<div className="text-xs mt-1" style={{color:'rgba(255,255,255,0.45)'}}>
									Free to start &nbsp;·&nbsp; credits included &nbsp;·&nbsp; no card needed
								</div>
							</div>
						</button>

						{/* BYOK — compact secondary option */}
						<button
							onClick={() => {
								setAiChoice('byok')
								setPageIndex(3)
							}}
							style={{
								border: aiChoice === 'byok' ? '1px solid rgba(220,40,40,0.5)' : undefined,
							}}
							className={`flex items-center justify-between px-5 py-4 rounded-xl text-left transition-all duration-200
								${aiChoice === 'byok'
									? 'bg-[#dc2828]/10'
									: 'border border-void-border-2 bg-void-bg-2 hover:border-void-border-1'
								}`}
						>
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-2">
									<ChatGPTIcon />
									<AnthropicIcon />
									<AIStudioIcon />
									<OllamaIcon />
									<XAIIcon />
								</div>
								<div>
									<div className="text-sm font-semibold text-void-fg-2">Bring Your Own Key</div>
									<div className="text-xs text-void-fg-3">Use your own API keys</div>
								</div>
							</div>
							<ChevronRight className="text-void-fg-3 flex-shrink-0" size={16} />
						</button>
					</div>
				</div>
			}
			bottom={
				<div className="max-w-2xl w-full mx-auto flex justify-start">
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
