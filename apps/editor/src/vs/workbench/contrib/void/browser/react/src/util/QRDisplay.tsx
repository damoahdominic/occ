/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

// ── Block character constants ─────────────────────────────────────────────────
const FULL_BLOCK = '\u2588' // █
const UPPER_HALF = '\u2580' // ▀
const LOWER_HALF = '\u2584' // ▄
const BLOCK_CHARS_RE = /[\u2588\u2580\u2584\u2592\u2591\u2593\u258c\u2590]/

// ── Detection ─────────────────────────────────────────────────────────────────

function lineBlockDensity(line: string): number {
	const chars = [...line]
	if (chars.length === 0) return 0
	const blocks = chars.filter(c => BLOCK_CHARS_RE.test(c)).length
	return blocks / chars.length
}

/**
 * Returns true if `line` looks like a row of QR code block art.
 * Requires at least 6 chars and > 20 % block chars.
 */
function isQRLine(line: string): boolean {
	return line.length >= 6 && lineBlockDensity(line) > 0.2
}

/**
 * Splits `text` into segments — each segment is either a QR block (8+
 * consecutive QR lines) or regular prose.  Ignores empty lines between QR
 * rows so we don't break multi-section QR art.
 */
export function splitOutQRBlocks(text: string): Array<{ isQR: boolean; text: string }> {
	const lines = text.split('\n')
	const segments: Array<{ isQR: boolean; text: string }> = []

	let i = 0
	while (i < lines.length) {
		if (isQRLine(lines[i])) {
			// Collect all lines that are QR rows (allow up to 1 blank gap)
			const qrLines: string[] = [lines[i]]
			let j = i + 1
			while (j < lines.length) {
				if (isQRLine(lines[j])) {
					qrLines.push(lines[j])
					j++
				} else if (lines[j].trim() === '' && j + 1 < lines.length && isQRLine(lines[j + 1])) {
					// single blank line gap — allow it
					qrLines.push(lines[j])
					j++
				} else {
					break
				}
			}
			// Only treat as a QR block if we have enough rows
			if (qrLines.length >= 8) {
				segments.push({ isQR: true, text: qrLines.join('\n') })
				i = j
				continue
			}
		}
		// Accumulate regular prose
		const start = i
		while (i < lines.length && !isQRLine(lines[i])) i++
		segments.push({ isQR: false, text: lines.slice(start, i).join('\n') })
	}

	return segments.filter(s => s.text.trim().length > 0)
}

/** Returns true if `text` contains a QR block. */
export function hasBlockQR(text: string): boolean {
	return splitOutQRBlocks(text).some(s => s.isQR)
}

/** Extracts the first http/https URL from text (trailing punctuation stripped). */
export function extractURL(text: string): string | null {
	const m = text.match(/https?:\/\/[^\s"'<>\])+]+/)
	return m ? m[0].replace(/[.,;!?]+$/, '') : null
}

// ── Canvas renderer (Option C) ────────────────────────────────────────────────

function renderBlockQRToCanvas(canvas: HTMLCanvasElement, qrText: string, scale = 6): void {
	const lines = qrText.split('\n').filter(l => [...l].some(c => c !== ' '))
	const usesHalfBlocks = qrText.includes(UPPER_HALF) || qrText.includes(LOWER_HALF)
	const rowsPerLine = usesHalfBlocks ? 2 : 1

	// Detect inverted palette: > 60% of non-space chars are full blocks → white-on-black
	const allNonSpace = [...qrText].filter(c => c !== ' ' && c !== '\n')
	const fullBlocks  = allNonSpace.filter(c => c === FULL_BLOCK).length
	const inverted    = allNonSpace.length > 0 && fullBlocks / allNonSpace.length > 0.6

	const colCount = Math.max(...lines.map(l => [...l].length))
	const rowCount = lines.length * rowsPerLine

	canvas.width  = colCount * scale
	canvas.height = rowCount * scale

	const ctx = canvas.getContext('2d')!
	ctx.fillStyle = inverted ? '#000000' : '#ffffff'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.fillStyle = inverted ? '#ffffff' : '#000000'

	lines.forEach((line, rowIdx) => {
		const chars = [...line]
		chars.forEach((char, colIdx) => {
			const x = colIdx * scale
			const y = rowIdx * rowsPerLine * scale

			let topDark: boolean
			let botDark: boolean
			if (usesHalfBlocks) {
				topDark = char === FULL_BLOCK || char === UPPER_HALF
				botDark = char === FULL_BLOCK || char === LOWER_HALF
			} else {
				topDark = botDark = char === FULL_BLOCK
			}
			if (inverted) { topDark = !topDark; botDark = !botDark }

			if (topDark) ctx.fillRect(x, y, scale, scale)
			if (usesHalfBlocks && botDark) ctx.fillRect(x, y + scale, scale, scale)
		})
	})
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface QRModalProps {
	qrText: string
	url: string | null
	onClose: () => void
}

function QRModal({ qrText, url, onClose }: QRModalProps) {
	const canvasRef  = useRef<HTMLCanvasElement>(null)
	const [cleanQR, setCleanQR] = useState<string | null>(null)

	// Option C — render block chars to canvas
	useEffect(() => {
		if (!canvasRef.current) return
		renderBlockQRToCanvas(canvasRef.current, qrText)
	}, [qrText])

	// Option D — generate clean QR from URL
	useEffect(() => {
		if (!url) return
		QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
			.then(setCleanQR)
			.catch(() => {})
	}, [url])

	const modal = (
		<div
			style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
			onClick={onClose}
		>
			<div
				style={{ background: '#1e1e1e', borderRadius: '12px', padding: '24px', maxWidth: '420px', width: '90vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', border: '1px solid #333' }}
				onClick={e => e.stopPropagation()}
			>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
					<span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '15px' }}>📷 Scan QR Code</span>
					<button
						onClick={onClose}
						style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}
					>×</button>
				</div>

				{/* Option C — canvas from block chars */}
				<div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px' }}>
					<canvas
						ref={canvasRef}
						style={{ imageRendering: 'pixelated', display: 'block', maxWidth: '320px', width: '100%', height: 'auto' }}
					/>
				</div>

				{/* Option D — clean QR from URL (shown if available) */}
				{cleanQR && url && (
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
						<span style={{ color: '#888', fontSize: '11px' }}>— clean regenerated version —</span>
						<div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px' }}>
							<img src={cleanQR} alt='QR code' width={320} height={320} style={{ imageRendering: 'pixelated', display: 'block' }} />
						</div>
						<span style={{ color: '#666', fontSize: '11px', wordBreak: 'break-all', textAlign: 'center', maxWidth: '320px' }}>{url}</span>
					</div>
				)}

				<span style={{ color: '#666', fontSize: '11px' }}>Click outside to close</span>
			</div>
		</div>
	)

	return createPortal(modal, document.body)
}

// ── Public component ──────────────────────────────────────────────────────────

interface QRDisplayProps {
	/** The QR block art text (already extracted from the full message). */
	qrText: string
	/** Optional URL to also regenerate as a clean QR (Option D). */
	url?: string | null
}

/**
 * Shows a "Scan QR Code" button.  Clicking opens a modal that renders the
 * QR correctly — Option C paints block chars to canvas, Option D generates
 * a clean image from a URL if one is present.
 */
export function QRDisplay({ qrText, url = null }: QRDisplayProps) {
	const [open, setOpen] = useState(false)

	return (
		<>
			<button
				onClick={() => setOpen(true)}
				style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#2d5a8e', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', margin: '4px 0' }}
				onMouseOver={e => (e.currentTarget.style.background = '#3a72b5')}
				onMouseOut={e => (e.currentTarget.style.background = '#2d5a8e')}
			>
				📷 Scan QR Code
			</button>
			{open && <QRModal qrText={qrText} url={url} onClose={() => setOpen(false)} />}
		</>
	)
}
