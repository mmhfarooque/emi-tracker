# Project log

## 2026-10-30

- Created EMI Tracker using TypeScript, React, Node.js, npm, Express and SQLite.
- Built accounts, loan schedules, full-instalment payment records and undo, calculator, dashboard and CSV export.
- Prioritised mobile with bottom navigation, payment cards, safe-area spacing, bottom-sheet forms, 44px touch targets and amount fitting.
- Capitalised EMI in the shared branding.
- Added optional Google OAuth login and explicit linking for password accounts. State, nonce, PKCE, single-use attempts, verified identity and ownership checks protect the flow. Google credentials are external configuration; real-provider validation remains pending until credentials are supplied.
- Added production build, Docker and reverse-proxy deployment preparation. VPSDime is the intended host; local review comes before deployment.
- Verification covers financial edge cases, account isolation, persistence, Google protocol/account lifecycle and browser flows at seven viewport widths from 320 to 1440 pixels.
- Public source excludes credentials, databases, generated builds, dependencies, private operational notes and machine-specific instructions.

## Current limits

Manual full-instalment records only. Bank syncing, partial payments, email reminders, password recovery and subscription billing are not implemented. Physical iOS/Android checks and VPS deployment validation remain pending.
