# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [3.2.39](https://github.com/damoahdominic/occ/compare/v3.2.38...v3.2.39) (2026-03-31)

## [3.2.37](https://github.com/damoahdominic/occ/compare/v3.2.38...v3.2.37) (2026-03-31)

## [3.2.37](https://github.com/damoahdominic/occ/compare/v3.2.38...v3.2.37) (2026-03-31)

## [3.2.38](https://github.com/damoahdominic/occ/compare/v3.2.37...v3.2.38) (2026-03-30)

## [3.2.37](https://github.com/damoahdominic/occ/compare/v3.2.36...v3.2.37) (2026-03-30)

## [3.2.36](https://github.com/damoahdominic/occ/compare/v0.2.7-3.2.35-02.0...v3.2.36) (2026-03-30)

## [0.2.7-3.2.35-02.0](https://github.com/damoahdominic/occ/compare/v3.2.35...v0.2.7-3.2.35-02.0) (2026-03-30)


### Features

* **docker:** auto-configure occ-legacy on Docker install, skip API key prompt ([da98b4b](https://github.com/damoahdominic/occ/commit/da98b4b0aa5f029ef83bc36ad0570a83203b050a))
* **docker:** rewrite setup wizard to use official openclaw image ([fa5f149](https://github.com/damoahdominic/occ/commit/fa5f1492c41f9fe6917d41dcaf0e486692b55d3d))
* extract StatusPanelController + show full status panel in adapter tabs ([fa70f41](https://github.com/damoahdominic/occ/commit/fa70f41ef09f1bdf0d0ce3deeb67cccc156648a5))
* **multihost:** add shared host types + adapter extension scaffolds ([7ddd79b](https://github.com/damoahdominic/occ/commit/7ddd79ba2c6af0755ea62fa0d042b4a3206923a5))
* **multihost:** HostRegistry, HostManager, status bar, tree provider, API export ([b38bca4](https://github.com/damoahdominic/occ/commit/b38bca4a1710879eaeacc9f843348821e9874cc5))
* **multihost:** openclaw-docker extension + openclaw-ssh stub ([1f09951](https://github.com/damoahdominic/occ/commit/1f0995125bf7b287a2448966a758f54c2c0ef041))
* **multihost:** openclaw-local extension — LocalHostAdapter + LocalHostConnection ([e342e89](https://github.com/damoahdominic/occ/commit/e342e891bbf5a8f89c5eab81a4be25c8bdd147de))
* **multihost:** Phase 2b — home.ts surgical refactor to HostConnection ([399373c](https://github.com/damoahdominic/occ/commit/399373cbf051bbf00c1b963117a0b3ebb2422840))
* smart host routing + dual status panel titles + hosts overview ([1f370f2](https://github.com/damoahdominic/occ/commit/1f370f200a80438d5746b42ee3aaebbb8b4c9610))
* **ticket-021:** add docker compose full stack + fix launch-editor.sh for Linux ([8fb6fa7](https://github.com/damoahdominic/occ/commit/8fb6fa72472d8152fee264064e8626f0fb8b1855))
* **ticket-021:** co-locate .openclaw inside OCC install dir (~/Desktop/occ/.openclaw) ([4e17d95](https://github.com/damoahdominic/occ/commit/4e17d9535996ef41e9c619c7934e38ad7b4b9408))
* **ticket-021:** implement docker bootstrap wizard UI + engine in home.ts ([3d93fb3](https://github.com/damoahdominic/occ/commit/3d93fb3dfbf2302076a0a335c765e4a2c9c50871))
* **web:** replace download CTAs with early access signup form ([b9741fd](https://github.com/damoahdominic/occ/commit/b9741fd5ae11beb1955508fa8558362c25b85110))
* window-level host binding — one host per VS Code window ([c20d228](https://github.com/damoahdominic/occ/commit/c20d228095a0f74409fabcb2b4e29eccc4780fd4))


### Bug Fixes

* **docker:** show full status panel instead of install screen ([11e120e](https://github.com/damoahdominic/occ/commit/11e120e72f165d0713690ba803b288c5152fa718))
* fetch download URLs client-side to fix stale versions on static export ([f00e771](https://github.com/damoahdominic/occ/commit/f00e771333755fea50d9cc280f33f50b79cb9f3b))
* MultiHost Docker panel — eliminate setActiveHost race causing host-selector bounce ([26d6184](https://github.com/damoahdominic/occ/commit/26d6184b86732d1fce0d16ffe7aae43c26125556))
* **multihost:** correct adapter extension main paths after TS rootDir inference ([c5a28cd](https://github.com/damoahdominic/occ/commit/c5a28cde10a327b1f0ac9f5f9902a1bca7a44e4b))
* replace litellm/localhost:4000 references with occ.mba.sh ([6334c6d](https://github.com/damoahdominic/occ/commit/6334c6ddea72c4f38ecfdd91e5e7ba098ce04b93))
* shorten early access button text to prevent multi-line wrapping ([e1a3193](https://github.com/damoahdominic/occ/commit/e1a319359b8340cc3ec21b4b70f61825b9757bfa))
* skip npm postinstall scripts in container build ([aaf9988](https://github.com/damoahdominic/occ/commit/aaf9988c6e95b261b4e3c200e945a8acefc4e8ba))

## [3.2.35](https://github.com/damoahdominic/occ/compare/v3.2.34...v3.2.35) (2026-03-19)


### Bug Fixes

* eliminate \' escaping in template literal causing script parse error ([72a92f4](https://github.com/damoahdominic/occ/commit/72a92f4629e53a15fac7064d3b5026d64c13be64))

## [3.2.34](https://github.com/damoahdominic/occ/compare/v3.2.33...v3.2.34) (2026-03-19)


### Bug Fixes

* pass maintainer as separate string args to avoid JSON breaking onclick HTML attribute ([1455ced](https://github.com/damoahdominic/occ/commit/1455ced08bebfa4eeb8bff31c2bb02c275b6c309))

## [3.2.33](https://github.com/damoahdominic/occ/compare/v3.2.32...v3.2.33) (2026-03-19)


### Bug Fixes

* hide MoltPilot by default, remove "Open OpenClaw State Directory" button ([80a0472](https://github.com/damoahdominic/occ/commit/80a04724f00c4f03803d675427b242fcc35818fd))
* NemoClaw docs link → /nemoclaw ([13cceb1](https://github.com/damoahdominic/occ/commit/13cceb13688818657d48159533cadb5ff35c682c))
* remove hover flicker from command center grid ([a4b8ce4](https://github.com/damoahdominic/occ/commit/a4b8ce4ecb9474ec54b6915c803c18c943a49999))

## [3.2.32](https://github.com/damoahdominic/occ/compare/v3.2.31...v3.2.32) (2026-03-19)


### Features

* add Apps Ecosystem section — 9 purpose-built management apps ([66cd08c](https://github.com/damoahdominic/occ/commit/66cd08ce84a46edbd0d107832309884f583068d0))
* rename "AI Harness for OpenClaw" to "Cursor for OpenClaw" everywhere ([edd30a0](https://github.com/damoahdominic/occ/commit/edd30a02064c206eef2128c69bf36d0a062879d7))

## [3.2.31](https://github.com/damoahdominic/occ/compare/v3.2.30...v3.2.31) (2026-03-19)


### Features

* add named maintainers to app WIP modals ([2e287e9](https://github.com/damoahdominic/occ/commit/2e287e9b54e5fac637439b162b04d3add65e9928))
* update feature bentos — new copy + larger icons ([9aa6c10](https://github.com/damoahdominic/occ/commit/9aa6c10430b5c4522520ea80ceac9fb22eb20a60))

## [3.2.30](https://github.com/damoahdominic/occ/compare/v3.2.29...v3.2.30) (2026-03-19)


### Features

* rename "Configure OpenClaw" button to "Open Web Control" ([546ac75](https://github.com/damoahdominic/occ/commit/546ac75439a9866c1eb8ca0cfbc731a02c9e47c4))

## [3.2.29](https://github.com/damoahdominic/occ/compare/v3.2.28...v3.2.29) (2026-03-19)


### Bug Fixes

* auto-stamp voidVersion/date in CI, fix About text to v3.2.28 ([19423d3](https://github.com/damoahdominic/occ/commit/19423d3fb347eea2415dccde3b2b3ac7d6e170a8))

## [3.2.28](https://github.com/damoahdominic/occ/compare/v3.2.27...v3.2.28) (2026-03-19)


### Bug Fixes

* tidy About dialog — show v3.2.27, remove undefined fields, add community credit ([00ca304](https://github.com/damoahdominic/occ/commit/00ca304638efef2f49b5e1e67214c127daa1fe9c))

## [3.2.27](https://github.com/damoahdominic/occ/compare/v3.2.26...v3.2.27) (2026-03-19)


### Bug Fixes

* CTA section matches hero layout with GitHub button + responsive stacking ([b8881ba](https://github.com/damoahdominic/occ/commit/b8881ba4e290f9a5a8e397aa97dd5703200c1aa4))
* hero buttons stack vertically on mobile for responsive layout ([cfca9c1](https://github.com/damoahdominic/occ/commit/cfca9c12343b505fd87bc4fb4b9c5bb3d9a7042a))
* NemoClaw docs link points to docs.openclawcode.ai ([711c171](https://github.com/damoahdominic/occ/commit/711c171d3c38d2d03b44383b4f7875d2c59d3004))
* show friendly message instead of verbose 402 LiteLLM error in chat ([cfbc96a](https://github.com/damoahdominic/occ/commit/cfbc96a29eac3d9776edba1294f82607cb496808))

## [3.2.26](https://github.com/damoahdominic/occ/compare/v3.2.25...v3.2.26) (2026-03-19)


### Features

* auto-approve terminal runs by default for all users ([f0e6260](https://github.com/damoahdominic/occ/commit/f0e62607f913db4eb35fb9368aa621215b001964))

## [3.2.25](https://github.com/damoahdominic/occ/compare/v3.2.24...v3.2.25) (2026-03-18)


### Features

* open Configure OpenClaw in default browser instead of webview panel ([1f97375](https://github.com/damoahdominic/occ/commit/1f97375b138d4a8e1a65ef12693783ee5ab8ee1d))

## [3.2.24](https://github.com/damoahdominic/occ/compare/v3.2.23...v3.2.24) (2026-03-18)


### Features

* add back/forward nav, window.open bridge, live URL bar to config panel ([e189eb1](https://github.com/damoahdominic/occ/commit/e189eb1e34c5e2a523075691f1f1bcd654b98db1))

## [3.2.23](https://github.com/damoahdominic/occ/compare/v3.2.22...v3.2.23) (2026-03-18)


### Bug Fixes

* auto-install Node.js 22 via nvm when openclaw setup requires it ([f4cfb5f](https://github.com/damoahdominic/occ/commit/f4cfb5f68db20eb73fb259edd7981ae699a24d52))

## [3.2.22](https://github.com/damoahdominic/occ/compare/v3.2.21...v3.2.22) (2026-03-18)


### Bug Fixes

* **macos:** Xcode CLI screen, binary path storage, chown group error ([6cc6d9e](https://github.com/damoahdominic/occ/commit/6cc6d9e1735c6e85e6fb584edace19b089d2a05b))
* Windows app icons not showing correctly ([e6e185e](https://github.com/damoahdominic/occ/commit/e6e185ec30b00b9a7f725ef649f773de2a72c9e8)), closes [#1a1a1](https://github.com/damoahdominic/occ/issues/1a1a1)

## [3.2.21](https://github.com/damoahdominic/occ/compare/v3.2.20...v3.2.21) (2026-03-18)


### Bug Fixes

* bundle app tile emojis inside extension media folder ([d4f1f34](https://github.com/damoahdominic/occ/commit/d4f1f34e5506a7721cf32aa82ccfee60e5f442df))

## [3.2.20](https://github.com/damoahdominic/occ/compare/v3.2.19...v3.2.20) (2026-03-18)


### Bug Fixes

* close sidebar after gateway is running, not on setup start ([f57eeec](https://github.com/damoahdominic/occ/commit/f57eeec7af0450a8337ecce79ef667aef7cb4d4a))

## [3.2.19](https://github.com/damoahdominic/occ/compare/v3.2.18...v3.2.19) (2026-03-18)


### Features

* hide MoltPilot sidebar when onboarding setup starts ([3e8ce67](https://github.com/damoahdominic/occ/commit/3e8ce67cfd76eb826f637560e5048a225160a2be))

## [3.2.18](https://github.com/damoahdominic/occ/compare/v3.2.17...v3.2.18) (2026-03-18)


### Bug Fixes

* escape \n in proceedAutoSetup handler to prevent script parse failure ([34b9d2e](https://github.com/damoahdominic/occ/commit/34b9d2e11342429eac267a9b203ea7b3f782fdfd))

## [3.2.17](https://github.com/damoahdominic/occ/compare/v3.2.16...v3.2.17) (2026-03-18)

## [3.2.16](https://github.com/damoahdominic/occ/compare/v3.2.15...v3.2.16) (2026-03-18)

## [3.2.15](https://github.com/damoahdominic/occ/compare/v3.2.14...v3.2.15) (2026-03-18)


### Bug Fixes

* escape \x1b in template literal to prevent script parse failure ([7c571be](https://github.com/damoahdominic/occ/commit/7c571be57cad9af59a79988f18461668715886d9))

## [3.2.14](https://github.com/damoahdominic/occ/compare/v3.2.13...v3.2.14) (2026-03-18)


### Features

* Show Error Logs button on install failure + strip ANSI from logs ([4d93fad](https://github.com/damoahdominic/occ/commit/4d93fad73bbf976e3fe21232f0767b654d66c420))

## [3.2.13](https://github.com/damoahdominic/occ/compare/v3.2.12...v3.2.13) (2026-03-18)


### Features

* persistent diagnostics log + Open Logs in Search Actions ([55e27bc](https://github.com/damoahdominic/occ/commit/55e27bc3fa754d328ee51200881b10af982dc988))

## [3.2.12](https://github.com/damoahdominic/occ/compare/v3.2.11...v3.2.12) (2026-03-18)


### Features

* auto-install Node.js on Windows when missing (no UAC required) ([18e947e](https://github.com/damoahdominic/occ/commit/18e947e0735c9171f89153dbb9229c39937767fa))


### Bug Fixes

* proactive sudo, prerequisite checks, PATH detection, and post-install verification ([fbb8cf0](https://github.com/damoahdominic/occ/commit/fbb8cf034029ee931c96d381d7e5f09667b27775))
* Windows Node.js install robustness and cleaner install log UI ([5be13ee](https://github.com/damoahdominic/occ/commit/5be13ee52a81959c3759c202b775a69ebc12ed79))

## [3.2.11](https://github.com/damoahdominic/occ/compare/v3.2.9...v3.2.11) (2026-03-18)


### Features

* add Jensen Huang image to NemoClaw section with split layout ([38bec4a](https://github.com/damoahdominic/occ/commit/38bec4a83b66abe3e4d9f3ae2f1913b522ebf4e9))
* add OCC Legacy model constants and patch openclaw.json after setup ([99179a8](https://github.com/damoahdominic/occ/commit/99179a8cee5d02cbe02e23d3fef4818c1f6297ae))
* NemoClaw enterprise section, MoltPilot trim, nav/branding updates ([c59e8ee](https://github.com/damoahdominic/occ/commit/c59e8eea5c0af9e0ac02659a035320199fcc91b9))
* new Jensen claw image + card layout for NemoClaw section ([28a2967](https://github.com/damoahdominic/occ/commit/28a2967e3aa4de0ce446ead2e451519248b0cac9))
* NEW NemoClaw pill in hero section with anchor link ([d413992](https://github.com/damoahdominic/occ/commit/d41399290ebabcf3c1f6e5f99db6e4c779db5598))


### Bug Fixes

* prevent duplicate OCC Home tab on uninstall, add silent Node.js install for Unix ([5996893](https://github.com/damoahdominic/occ/commit/59968933bf86e33a88890b48c521e6b9bb92877b))
* replace Void cube with OCC lobster in Windows installer wizard image ([5c5db4b](https://github.com/damoahdominic/occ/commit/5c5db4b2d0ba8858cc526b78802368f45eeb3ac5))

## [3.2.9](https://github.com/damoahdominic/occ/compare/v3.2.10...v3.2.9) (2026-03-16)


### Features

* 4-step onboarding with theme picker and OpenClaw Light theme ([846893b](https://github.com/damoahdominic/occ/commit/846893bfc9c3a0e1785302d392260d1c3552cd4f)), closes [#D40000](https://github.com/damoahdominic/occ/issues/D40000)
* add app icon (lobster claw) for all platforms + splash screen ([fbfd5d4](https://github.com/damoahdominic/occ/commit/fbfd5d4a1bf70fe9773d2c58f99b6ce60f4d90e6))
* add manual close button to CASS overlay, auto-open AI chat on setup failure ([cfa2390](https://github.com/damoahdominic/occ/commit/cfa239091170b024db27b97aa9385950843c95b8))
* add OCCode landing page with download links and feature highlights ([0b3645d](https://github.com/damoahdominic/occ/commit/0b3645d6f662f505523e9c91e26847bd25918362))
* add release workflow — tag v* to build + publish all platform binaries ([f18519a](https://github.com/damoahdominic/occ/commit/f18519aa4e8318c886008092bfb02f9f72bb9cb6))
* add shared Control Center package + extension UI ([2c57bf9](https://github.com/damoahdominic/occ/commit/2c57bf96a7af3e2c51cf8c799ae29ff13345721c))
* add sponsors section with MoltPod as Diamond Sponsor ([9757426](https://github.com/damoahdominic/occ/commit/97574268afeb988c5add87cfd2651daacff99b34))
* add Star on GitHub button next to Download in hero section ([f77d730](https://github.com/damoahdominic/occ/commit/f77d730e9e75bb331cc6203a5fb9316720dcec4c))
* add sudo command tool, auto-update check, improve install/uninstall flows ([4ab3c1c](https://github.com/damoahdominic/occ/commit/4ab3c1c6ae9115c1b22ff0148796b153358f1525))
* add Void editor fork as new base (git submodule) ([9e700c0](https://github.com/damoahdominic/occ/commit/9e700c065f39abce9bb30506f78de6371ea5b27b))
* add web_search and read_url builtin agent tools ([43223bc](https://github.com/damoahdominic/occ/commit/43223bc4c32251d52a60b092e3ac6aeac87c1651))
* add Windows build job and bump version to 3.0.0 ([5993d1c](https://github.com/damoahdominic/occ/commit/5993d1c2a496138e2a26c63e9745159103a3d810))
* AI-driven install — chat handles installation and password ([ad287fc](https://github.com/damoahdominic/occ/commit/ad287fcfd4b2aae66207e3395830da5ca732fe1d))
* attach device ID to ocFreeModel requests for per-user budget tracking ([f93f251](https://github.com/damoahdominic/occ/commit/f93f251b08753961b6a3b92cf358ac17cbfea29d))
* clipboard bridge in config panel, gateway port detection, and misc fixes ([6d20a25](https://github.com/damoahdominic/occ/commit/6d20a259727a40eb118cf0200afa39f3db7286ff))
* deterministic cross-platform CASS setup (replaces AI delegation) ([7e9eacf](https://github.com/damoahdominic/occ/commit/7e9eacf464d9928ad18f98465d87678c6325bb43))
* event-driven install detection — no polling overhead ([2ff6b19](https://github.com/damoahdominic/occ/commit/2ff6b198b41ec4cdd6b639e5fff5f44de926cbe7))
* first-run onboarding as a separate panel, independent of OCC Home ([d949f6e](https://github.com/damoahdominic/occ/commit/d949f6e9a4f1a79278d128c55a014130fff1cb05))
* implement home screen with OpenClaw detection, install, and config flow ([86b68f8](https://github.com/damoahdominic/occ/commit/86b68f88050a75f73cfabd988a6d1638a5a60638))
* live install detection + co-pilot system prompt ([9b44189](https://github.com/damoahdominic/occ/commit/9b44189deface7296c58ceb9b489f5b9212c378b))
* MoltPilot improvements, QR display, OpenClaw status in system prompt ([7557d2a](https://github.com/damoahdominic/occ/commit/7557d2a7c4128942d150a2973c6da0303752d9f9))
* OCC Home improvements, auth provider, install UX hardening ([f3866c0](https://github.com/damoahdominic/occ/commit/f3866c0ffb390be16744046b58454618c94b81f8))
* OpenClaw home panel UX, MoltPilot AI state, hardened installer ([8c79388](https://github.com/damoahdominic/occ/commit/8c79388c20109b228f405e802fa47f02b5e7c606))
* **openclaw:** add anonymous install ping via Aptabase ([4132944](https://github.com/damoahdominic/occ/commit/4132944e419924a4543fc33a1a481e1c8e2bba3e))
* **openclaw:** add Configure (TUI) button that opens openclaw configure in editor terminal ([8445d05](https://github.com/damoahdominic/occ/commit/8445d05943354292aa6d976672b62152f05fb8a6))
* **openclaw:** add workspace file pills to home panel ([20c5933](https://github.com/damoahdominic/occ/commit/20c5933a978a3108583d5e98bca99646cf444944))
* polish icon + control center stability ([322d446](https://github.com/damoahdominic/occ/commit/322d44650debb3973f911458c27e682fd7c05436))
* polished terminal-free install console UI (v3.2.0) ([2e90af4](https://github.com/damoahdominic/occ/commit/2e90af4030cf523056b8fe38c5e9854123e6ed51)), closes [#0d1117](https://github.com/damoahdominic/occ/issues/0d1117) [#7ee787](https://github.com/damoahdominic/occ/issues/7ee787) [#ffa198](https://github.com/damoahdominic/occ/issues/ffa198)
* real-time credits, smoke test, MoltPilot fixes, .openclaw permissions ([f3f6eac](https://github.com/damoahdominic/occ/commit/f3f6eac7add1b835515454b50df03c440769c753))
* rebrand VSCodium with OCCode icon on all platforms ([9d56b38](https://github.com/damoahdominic/occ/commit/9d56b38b8c9a42b11f3570bcf146bb2063fe333b))
* replace all icons with new PNG mascot (transparent background) ([e3bca49](https://github.com/damoahdominic/occ/commit/e3bca49561f0554efa03e475e8aa419f5dcee2a0))
* replace app icon with new OpenClaw mascot across all platforms ([83f8005](https://github.com/damoahdominic/occ/commit/83f8005db7df6f6655c88a98962e12ec27be363a))
* route ocFreeModel through LiteLLM proxy at inference.mba.sh ([d5f1fad](https://github.com/damoahdominic/occ/commit/d5f1fad7789d8bd1cc7dd6e14481e7888ecdb8ac))
* scaffold Electron wrapper + VS Code extension (Milestones 2 & 3) ([0af420d](https://github.com/damoahdominic/occ/commit/0af420d2580a96bec0a79b9856bfa2b8bbe25194))
* set MoltPilot system prompt as default aiInstructions ([0e80e71](https://github.com/damoahdominic/occ/commit/0e80e71c2a7cefb5652f55e5e82dce4cb6cb7de7))
* unified setup view, smart uninstall, flexible MoltPilot, onboarding redesign ([8ec89a8](https://github.com/damoahdominic/occ/commit/8ec89a81c655293c2c3cf41049b4450a45c3ab6a))
* update all icons to final PNG with correct transparency ([8ece542](https://github.com/damoahdominic/occ/commit/8ece542ef4fa2ef049ca23a150c7a26e1eaed8b9))
* update editor submodule — macOS icon converted ([ddc3eee](https://github.com/damoahdominic/occ/commit/ddc3eeed2842680a0d3109cdbf3b81b35c98985c))
* update editor submodule — OCcode rebrand + OpenClaw extension integrated ([6c3022f](https://github.com/damoahdominic/occ/commit/6c3022f313fa8f3081a4457ed0a886b525cdd660))
* update editor submodule — remove AddProvidersPage from onboarding ([7ec874b](https://github.com/damoahdominic/occ/commit/7ec874b5d467133d8336f308e9e22538cb9fe7e6))
* update empty panel watermark and onboarding icon to new mascot ([6adf62a](https://github.com/damoahdominic/occ/commit/6adf62abca68b1cf18740ed4e21d80273d8011bb))
* update model lists to March 2026 latest ([90d0960](https://github.com/damoahdominic/occ/commit/90d0960dac8377cf5a8d95a8bdbe6bc8b937511f))
* VS Code walkthrough for first-run onboarding ([79f2da3](https://github.com/damoahdominic/occ/commit/79f2da3868570ec0264de7228b7ba01a0fa42c4e))
* **web:** add Community link to navbar, change Download to Sign In ([597952a](https://github.com/damoahdominic/occ/commit/597952a7733f21a2bd64f1226463a6a97a222f2e))
* **web:** add icons to top nav Docs and OpenClaw links ([7c4f74e](https://github.com/damoahdominic/occ/commit/7c4f74ed8c801957ce89e1e0365e3780916c97d4))
* **web:** fetch latest release assets and wire direct download links ([9dcc419](https://github.com/damoahdominic/occ/commit/9dcc41924247096b1d9eb138882904089f007017))
* **web:** rewrite copy as AI harness, add globe effects + install toasts ([29c2cdb](https://github.com/damoahdominic/occ/commit/29c2cdb4dc08bf90a51ca85dcfc09543f87dc0d2))
* **web:** single platform download button with alt link ([893f5fc](https://github.com/damoahdominic/occ/commit/893f5fc41b68278be06ec469421b512e444edd92))
* website download links auto-update from latest GitHub release ([b92dfed](https://github.com/damoahdominic/occ/commit/b92dfededb26cb1844f405605e07577a167020b5))
* **web:** switch to Space Grotesk font + add hero background videos ([4fa40c1](https://github.com/damoahdominic/occ/commit/4fa40c1c3a4059ee665c75c3302c32b0b3571f46))
* **web:** update hero screenshots with new OCC Home UI ([9780577](https://github.com/damoahdominic/occ/commit/97805778118aeee469dfe25eb1c4abf7451c53f4))
* **web:** update hero subtext copy ([362c678](https://github.com/damoahdominic/occ/commit/362c67870892d73c814dee4962bede5cc7accc0a))
* **web:** update site title to AI powered local harness for OpenClaw ([d4f90f8](https://github.com/damoahdominic/occ/commit/d4f90f88591bb6bff032d793ad0a1aecfbbd8300))
* **web:** wire v3.1.2 direct download links, remove sponsor pill ([f91bec6](https://github.com/damoahdominic/occ/commit/f91bec657d49d174098fb93a9c84d337ca2043bd))


### Bug Fixes

* add .vscodeignore and --allow-missing-repository for vsce in monorepo ([d127374](https://github.com/damoahdominic/occ/commit/d1273746402de8ee678f5e9a744ee53f50d6236c))
* add homepage, author, repository to wrapper package.json for electron-builder ([4896bdf](https://github.com/damoahdominic/occ/commit/4896bdfafb2552ec9b12f2cd89cc085221afc1a2))
* add repository field to extension package.json (fixes vsce packaging) ([e3e6516](https://github.com/damoahdominic/occ/commit/e3e6516d38b76bc646ed620d7a72b003bd1460cb))
* align ocFreeModel model name with LiteLLM config (moltpilot) ([057f924](https://github.com/damoahdominic/occ/commit/057f92436d049609065ec90757c00e5f4d4ce03e))
* bump activity bar hide key to V3 so SCM stays hidden on existing installs ([c50c8d8](https://github.com/damoahdominic/occ/commit/c50c8d81e072672f510575051679fe1230696ee4))
* bundle extension .vsix into wrapper before building (sequential CI) ([fd07dd3](https://github.com/damoahdominic/occ/commit/fd07dd3507dedb867e12a5c50af2162a2d207912))
* BYOK ollama support, deterministic uninstall, auto-close terminals ([8d87241](https://github.com/damoahdominic/occ/commit/8d87241a93391cfeaed526de8926690c08807346))
* bypass npm shim on Windows — resolve node.exe + invoke JS entry point directly ([425c22b](https://github.com/damoahdominic/occ/commit/425c22ba0f98f75757a5086a8d53da19b4923a5e))
* CASS setup downloads prebuilt Rust binary instead of pip install ([b49d7b8](https://github.com/damoahdominic/occ/commit/b49d7b8edf37c8f9acba37c6ebe567cb66e73aeb))
* CASS setup now shows progress overlay in home panel ([9a36836](https://github.com/damoahdominic/occ/commit/9a36836efe6687f1202cba9423f7dfe9eee23af2))
* **ci:** remove musl parcel watcher before deb packaging on Ubuntu ([0371768](https://github.com/damoahdominic/occ/commit/0371768154fbdcb3a111fbc867e78a289505cbe0))
* coerce array newContent to string in validateStr ([cc02e64](https://github.com/damoahdominic/occ/commit/cc02e642527d668a8815f4332c2b9042cca148de))
* compile OpenClaw extension TypeScript before packaging ([d0b123b](https://github.com/damoahdominic/occ/commit/d0b123b30472bce2ca3875d7d4aad6635e809dca))
* correct directory ownership and workspace open logic ([e6c1fc7](https://github.com/damoahdominic/occ/commit/e6c1fc7c5698e13d420fdd8a9fc67393c14626b6))
* correct model IDs verified by smoke tests ([c531697](https://github.com/damoahdominic/occ/commit/c5316976ad03647daff8020db8476a2a21e1e536))
* disable git built-in extensions to suppress activation errors ([d36f9ef](https://github.com/damoahdominic/occ/commit/d36f9efb6ad2e9a33241d0b95648c79b5591e29f))
* exclude vscodium from files to avoid electron-builder conflict ([2198057](https://github.com/damoahdominic/occ/commit/2198057726c272c3ef58c332834922be3d6fcee4))
* guard against empty dependenciesSrc in packageNativeLocalExtensionsStream ([565aee1](https://github.com/damoahdominic/occ/commit/565aee1833477efaa028f86b98d52a4db8980f47))
* guard webview access after panel disposal ([c0762bb](https://github.com/damoahdominic/occ/commit/c0762bbe6c9bebbe4fa185264ee62ad7a621abce))
* handle flat VSCodium extraction in rebrand (Linux/Windows) ([d646118](https://github.com/damoahdominic/occ/commit/d646118fabfcc4aa67acb3caae76916ebd25c327))
* include control-center data in VSIX ([b6030b3](https://github.com/damoahdominic/occ/commit/b6030b3987299668faa32f53228a7ab7dd84698b))
* macOS/Linux binary paths and splash icon loading (v0.2.6.1) ([eadd773](https://github.com/damoahdominic/occ/commit/eadd77399e30e2a0d2c31194f75cd3f725f32395))
* make aiInstructions override Void system identity (place last, strong label) ([9c13c42](https://github.com/damoahdominic/occ/commit/9c13c42d2c53a17b08088e77d359cf3b1b25db6e))
* mount control center webview reliably ([6b73713](https://github.com/damoahdominic/occ/commit/6b73713073b51cda10f9adeca45f7e445ce3ad3d))
* noErrorOnMissing: true for msal native files in Windows CI ([c21b754](https://github.com/damoahdominic/occ/commit/c21b754edfddb9ad5e61dc38edd15d698b9e381b))
* pre-release hardening for workshop ([155565c](https://github.com/damoahdominic/occ/commit/155565c15078ff6eb702999a4e3c19fbd9d0f461))
* prefer .cmd over .ps1 shims on Windows for reliable openclaw CLI execution ([1d5ded1](https://github.com/damoahdominic/occ/commit/1d5ded1c3322009b2ddfa2676cd1e98171831fc2))
* rebuild native modules for Electron 34 ABI before packaging ([18e0401](https://github.com/damoahdominic/occ/commit/18e040144904f42871ea90ae7367160f7d127518))
* remove duplicate assets entry from extraResources ([ad0220f](https://github.com/damoahdominic/occ/commit/ad0220f1d5aedadeda04e47a897c86628dfea54c))
* remove microsoft-authentication from nativeExtensions list ([f50b989](https://github.com/damoahdominic/occ/commit/f50b98931a5fd35c0197e3477e5644317ec54528))
* restore missing closing braces in webview message handler ([c3f899e](https://github.com/damoahdominic/occ/commit/c3f899eda3d5b3d464bea7738e0a7bcc90a1c0ed))
* route inference through OCC backend proxy instead of direct LiteLLM ([f6cac4a](https://github.com/damoahdominic/occ/commit/f6cac4ac92c11c7fe1abeeb32332a10c72207b8f))
* scroll jitter, new thread button, suppress more extension errors ([42e9280](https://github.com/damoahdominic/occ/commit/42e9280edbd2eecb1571bdb84d57f7d1c51721b1))
* silent-first install flow — no more runaway terminals ([cab8ac2](https://github.com/damoahdominic/occ/commit/cab8ac291a12c8b65db320c74a7a8f6dd69677ff))
* syntax error in wizardLog handler — extra brace + unescaped newline ([4561268](https://github.com/damoahdominic/occ/commit/4561268abe5404b72fc66a31585ad89e6cec45cf))
* test + fix wrapper and extension for Linux, add REPORTS.md ([b8ec0b5](https://github.com/damoahdominic/occ/commit/b8ec0b5d78f03d3e0e68f3e87ad089534b9c3143))
* update auto-update URLs to damoahdominic/occ repo, use occRelease for version checks ([2552b70](https://github.com/damoahdominic/occ/commit/2552b70a28285b6807e1018463f4692088d12fc8))
* update security report email to team@mba.sh ([af5e12e](https://github.com/damoahdominic/occ/commit/af5e12ec522a7b595c3576d1fdd8630283c8fbc8))
* use bash shell for VSIX verify step (Windows compat) ([ffab0f0](https://github.com/damoahdominic/occ/commit/ffab0f09113a4fb3574a0d270ace073261e48c78))
* use canonical Apache 2.0 LICENSE text + add license to package.json ([cea30ea](https://github.com/damoahdominic/occ/commit/cea30ea19a1df13bf1e5f6168da3793b60175387))
* use env var to check AZURE_CLIENT_ID in workflow if condition ([b8e3b2c](https://github.com/damoahdominic/occ/commit/b8e3b2c46596eb7b5cefc26b54628f6f11ce719f))
* use execSync with shell:true for extension install (codium is a shell script) ([7371f7e](https://github.com/damoahdominic/occ/commit/7371f7e26da4bc4d324627e3984cd2fd3665d495))
* use openclaw.json as the single install detection signal ([ed5a01d](https://github.com/damoahdominic/occ/commit/ed5a01d7e7a56a7cb166040a061e089b0b498361))
* version to 0.2.6 (semver compliant) ([d176697](https://github.com/damoahdominic/occ/commit/d176697f3ee47d5a0355293fda3d747cf14ef312))
* **web:** remove Skool community link from hero section ([e093024](https://github.com/damoahdominic/occ/commit/e093024346150dd5648bf19490625851289e5b62))
* **web:** sync website with dev branch design ([ad1a4f7](https://github.com/damoahdominic/occ/commit/ad1a4f70b9b491b291cff84ec909c3af059b6520))
* Windows installer branding + configureTUI PATH fix ([d8af3bb](https://github.com/damoahdominic/occ/commit/d8af3bb69489b839ea5768b96d3197cb2730c1c0))
