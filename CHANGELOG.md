# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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

## [0.2.7-0](https://github.com/damoahdominic/occ/compare/v3.2.35...v0.2.7-0) (2026-03-30)


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

## [0.2.7-0](https://github.com/damoahdominic/occ/compare/v3.2.35...v0.2.7-0) (2026-03-30)


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
