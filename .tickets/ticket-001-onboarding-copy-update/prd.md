# PRD: Ticket 001 - Onboarding Copy Update

## 1. Problem Statement

The OCCode onboarding flow currently contains outdated copy that references "MoltPilot" and "$1 free tier" instead of the new "OCC Credits" model with $5 free on sign-up at MBA.sh. Users need clear, accurate information about the billing model and onboarding steps.

## 2. Proposed Solution

Update the text content in the Home panel (`extensions/openclaw/src/panels/home.ts`) to reflect the new branding and pricing:

- **Free card:** Change "$1 to start" → "$5 free credits"
- **Free card subtitle:** Change "Lasts about a week. No card needed." → "Sign up at MBA.sh — $5 free on first account."
- **Free card CTA:** Change "Start Free →" → "Create Account →"
- **BYOK card:** Add "Always free. No account needed." as subtext
- **Bottom note:** Remove "Free credit tracked locally. No account needed." entirely
- **Step 3 (free setup log) header:** Update from MoltPilot copy to MBA.sh copy

## 3. Acceptance Criteria

- All UI text in the onboarding flow accurately describes the OCC Credits model
- The free tier clearly states "$5 free on sign-up at MBA.sh"
- The BYOK option clearly states "Always free. No account needed."
- CTA buttons use correct labels ("Create Account" for free, "Bring Your Own Key" for BYOK)
- No references to "MoltPilot" remain in user-facing copy
- The deep-link redirect URL uses `occ-editor://` scheme correctly

## 4. Technical Considerations

- Copy lives in React/TypeScript files in the extension
- No logic changes required, only string replacements
- Ensure i18n/l10n is considered if present (currently appears to be hardcoded English)

## 5. Dependencies

- None (standalone UI text update)

## 6. Subtask Checklist

- [ ] Task 1: Locate all user-facing strings in `home.ts`
  - **Problem:** Need to identify exact lines where copy appears
  - **Test:** Grep for "MoltPilot", "$1", "Start Free" in extension source
  - **Subtasks:**
    - [ ] Subtask 1.1: Search and document all occurrences
    - [ ] Subtask 1.2: Map each occurrence to its replacement

- [ ] Task 2: Apply string replacements
  - **Problem:** Update the text correctly
  - **Test:** Build extension and visually verify changes
  - **Subtasks:**
    - [ ] Subtask 2.1: Update free tier card (title, subtitle, CTA)
    - [ ] Subtask 2.2: Update BYOK card (add subtext)
    - [ ] Subtask 2.3: Remove bottom note about free credit tracking
    - [ ] Subtask 2.4: Update step 3 header to reference MBA.sh

- [ ] Task 3: Verify in running editor
  - **Problem:** Ensure copy renders correctly
  - **Test:** Launch OCCode, complete onboarding flow, read all text
  - **Subtasks:**
    - [ ] Subtask 3.1: Check free flow text
    - [ ] Subtask 3.2: Check BYOK flow text
    - [ ] Subtask 3.3: Check that no stale copy remains
