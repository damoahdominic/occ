# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [3.5.3](https://github.com/asieduernest12/occ/compare/v3.5.2...v3.5.3) (2026-04-16)


### Bug Fixes

* **ci:** ensure .tmp dir exists before tee and unignore it ([75e5e5e](https://github.com/asieduernest12/occ/commit/75e5e5e79cc54e463d63f5507eb7f853c586a9c7))
* **make:** redundant build of linux docker image' ([a23fab2](https://github.com/asieduernest12/occ/commit/a23fab297c6d8f4e2ac3de280e2ed87721abb57d))

## [3.5.2](https://github.com/asieduernest12/occ/compare/v3.5.1...v3.5.2) (2026-04-15)


### Features

* add cdp Makefile target for Chrome DevTools Protocol ([27e20bf](https://github.com/asieduernest12/occ/commit/27e20bf75595cbad0256be011d7c3a12972a894f))
* add gateway.proxyUrl config support for custom gateway URLs ([6b31398](https://github.com/asieduernest12/occ/commit/6b313987a65fcd5d6f93beec9a65d282663cee32))
* add global teardown hook to close all browser tabs after tests ([e1cbc14](https://github.com/asieduernest12/occ/commit/e1cbc1436fc69aedf92c7484b0c80112d0f4c292))
* **billing:** implement OCC Credits card and balance display components ([7c5d75a](https://github.com/asieduernest12/occ/commit/7c5d75ac5934d3706af8d25c865a2c351341498b))
* **docker-setup:** implement input validation and error reporting ([6171f5f](https://github.com/asieduernest12/occ/commit/6171f5f2d549c08fccf0ea1c2ee1be7701e9b5e0))
* **docker-setup:** migrate from docker run to docker-compose ([50e29cc](https://github.com/asieduernest12/occ/commit/50e29ccfac6da67accc23269e4695540d8356b04))
* **gateway-info:** add gateway status display component with collapsed UI ([18f3670](https://github.com/asieduernest12/occ/commit/18f367015c668b67c7e2d8d62f90337c51539454))
* **gateway-info:** add retry logic and transient error handling ([8b0c9a1](https://github.com/asieduernest12/occ/commit/8b0c9a1c8ba7390753cdead76c8ed955a4c2cd3a))
* **openclaw-docker:** embed compose file, restore on first run if missing ([baca31d](https://github.com/asieduernest12/occ/commit/baca31d789d843c7e1201ebe6fac34e8a26cbf37))
* **openclaw:** open web panel with token instead of external browser ([145634c](https://github.com/asieduernest12/occ/commit/145634cb6d27389385e3e0955bd4d3337b4d086c))
* **ticket-047:** implement startup flow BDD spec and E2E test ([0e142a3](https://github.com/asieduernest12/occ/commit/0e142a30a65de984f6903d962aa72a5f840e26a0))
* **ticket-047:** strengthen E2E tests and integrate proxyUrl validation ([e210158](https://github.com/asieduernest12/occ/commit/e21015877bb27ec6cae805c35528b2c7e1bd0ffa))


### Bug Fixes

* **build:** add codeWeb entry point to web bundle task ([75707a8](https://github.com/asieduernest12/occ/commit/75707a88321396e689c12c06bcd8e99d5e55b438))
* deprecate docker run, enforce docker-compose.openclaw.yml as single source of truth ([709dcb9](https://github.com/asieduernest12/occ/commit/709dcb9933856bde2713c68593102fab3231d57b))
* **docker-compose:** migrate all docker run commands to docker-compose ([663aa29](https://github.com/asieduernest12/occ/commit/663aa296a469af98deec5a69e3b8e57109ef580d))
* **docker-setup:** fix missing/broken buttons in provisioning error view ([0391814](https://github.com/asieduernest12/occ/commit/03918142bcd45d30b67a2098ebb17031d990af2f))
* **docker-setup:** make image field optional, fall back to default ([263ddb1](https://github.com/asieduernest12/occ/commit/263ddb11cd3ce1a41e8d5b094b01db354f354773))
* **docker-setup:** prevent reload loop on gateway auto-detection ([751f403](https://github.com/asieduernest12/occ/commit/751f403349583188827add642831d335bfe8cfb6))
* **docker-setup:** restore routing to DockerSetupPanel on docker card click ([c1ec97c](https://github.com/asieduernest12/occ/commit/c1ec97c861421f4b5b247568863ebfa35ac4a192))
* **docker:** migrate setup panel from docker-compose V1 to docker compose V2 and use canonical compose file ([e7569f5](https://github.com/asieduernest12/occ/commit/e7569f553849d4395e9435e1b1f4c936c5fc2460))
* explicitly close CDP sessions and pages after each test ([4ee74a2](https://github.com/asieduernest12/occ/commit/4ee74a274b2cc0333ac13bc01b35c76a8c84f6e4))
* **home:** skip host-picker on first load if gateway or Docker detected ([4fc413a](https://github.com/asieduernest12/occ/commit/4fc413ab84c284d8373c7e8742e424db65ad52e5))
* increase E2E test timeouts and improve page navigation reliability ([66bfc3a](https://github.com/asieduernest12/occ/commit/66bfc3ae8af16f320e883681b7ab7e596c130d4e))
* **install:** parallelize postinstall and cascade from root npm install ([e412fc9](https://github.com/asieduernest12/occ/commit/e412fc91705d87329fd88adc8a1bb8ca6270e20b))
* only close CDP sessions that the test created ([f224949](https://github.com/asieduernest12/occ/commit/f2249491085dac1f68b9ccb2c89f58d127283b29))
* **openclaw-docker:** resolve EACCES in docker-in-docker gateway setup ([bc6ac80](https://github.com/asieduernest12/occ/commit/bc6ac805d31247f16bc2c3bd1e37a5f2767edbd2))
* **openclaw:** stop setup panel from mounting gateway data dir as root ([12a2301](https://github.com/asieduernest12/occ/commit/12a230148a5ba64ad8ebe7add917b3f9b6e90413))
* resolve E2E test fixture URL handling in CDP mode ([ed99fe0](https://github.com/asieduernest12/occ/commit/ed99fe05124467d9b682670de9bd4f91954c76a8))
* skip node install if higher version already available ([5febd12](https://github.com/asieduernest12/occ/commit/5febd12be82870026a932d1ee88befbcc26ebd3e))
* **ui:** add missing webview message handler for 'Open Web Control' button ([3c8c1a5](https://github.com/asieduernest12/occ/commit/3c8c1a55207ab351bbcbdc8272777a258ae28613))
* use configured host port when opening docker dashboard ([f9f38a4](https://github.com/asieduernest12/occ/commit/f9f38a4166a3e7281c5f535dd9fc6cd480521554))

## [3.5.2](https://github.com/asieduernest12/occ/compare/v3.5.1...v3.5.2) (2026-04-15)


### Features

* add cdp Makefile target for Chrome DevTools Protocol ([27e20bf](https://github.com/asieduernest12/occ/commit/27e20bf75595cbad0256be011d7c3a12972a894f))
* add gateway.proxyUrl config support for custom gateway URLs ([6b31398](https://github.com/asieduernest12/occ/commit/6b313987a65fcd5d6f93beec9a65d282663cee32))
* add global teardown hook to close all browser tabs after tests ([e1cbc14](https://github.com/asieduernest12/occ/commit/e1cbc1436fc69aedf92c7484b0c80112d0f4c292))
* **billing:** implement OCC Credits card and balance display components ([7c5d75a](https://github.com/asieduernest12/occ/commit/7c5d75ac5934d3706af8d25c865a2c351341498b))
* **docker-setup:** implement input validation and error reporting ([6171f5f](https://github.com/asieduernest12/occ/commit/6171f5f2d549c08fccf0ea1c2ee1be7701e9b5e0))
* **docker-setup:** migrate from docker run to docker-compose ([50e29cc](https://github.com/asieduernest12/occ/commit/50e29ccfac6da67accc23269e4695540d8356b04))
* **gateway-info:** add gateway status display component with collapsed UI ([18f3670](https://github.com/asieduernest12/occ/commit/18f367015c668b67c7e2d8d62f90337c51539454))
* **gateway-info:** add retry logic and transient error handling ([8b0c9a1](https://github.com/asieduernest12/occ/commit/8b0c9a1c8ba7390753cdead76c8ed955a4c2cd3a))
* **openclaw-docker:** embed compose file, restore on first run if missing ([baca31d](https://github.com/asieduernest12/occ/commit/baca31d789d843c7e1201ebe6fac34e8a26cbf37))
* **openclaw:** open web panel with token instead of external browser ([145634c](https://github.com/asieduernest12/occ/commit/145634cb6d27389385e3e0955bd4d3337b4d086c))
* **ticket-047:** implement startup flow BDD spec and E2E test ([0e142a3](https://github.com/asieduernest12/occ/commit/0e142a30a65de984f6903d962aa72a5f840e26a0))
* **ticket-047:** strengthen E2E tests and integrate proxyUrl validation ([e210158](https://github.com/asieduernest12/occ/commit/e21015877bb27ec6cae805c35528b2c7e1bd0ffa))


### Bug Fixes

* **build:** add codeWeb entry point to web bundle task ([75707a8](https://github.com/asieduernest12/occ/commit/75707a88321396e689c12c06bcd8e99d5e55b438))
* deprecate docker run, enforce docker-compose.openclaw.yml as single source of truth ([709dcb9](https://github.com/asieduernest12/occ/commit/709dcb9933856bde2713c68593102fab3231d57b))
* **docker-compose:** migrate all docker run commands to docker-compose ([663aa29](https://github.com/asieduernest12/occ/commit/663aa296a469af98deec5a69e3b8e57109ef580d))
* **docker-setup:** fix missing/broken buttons in provisioning error view ([0391814](https://github.com/asieduernest12/occ/commit/03918142bcd45d30b67a2098ebb17031d990af2f))
* **docker-setup:** make image field optional, fall back to default ([263ddb1](https://github.com/asieduernest12/occ/commit/263ddb11cd3ce1a41e8d5b094b01db354f354773))
* **docker-setup:** prevent reload loop on gateway auto-detection ([751f403](https://github.com/asieduernest12/occ/commit/751f403349583188827add642831d335bfe8cfb6))
* **docker-setup:** restore routing to DockerSetupPanel on docker card click ([c1ec97c](https://github.com/asieduernest12/occ/commit/c1ec97c861421f4b5b247568863ebfa35ac4a192))
* **docker:** migrate setup panel from docker-compose V1 to docker compose V2 and use canonical compose file ([e7569f5](https://github.com/asieduernest12/occ/commit/e7569f553849d4395e9435e1b1f4c936c5fc2460))
* explicitly close CDP sessions and pages after each test ([4ee74a2](https://github.com/asieduernest12/occ/commit/4ee74a274b2cc0333ac13bc01b35c76a8c84f6e4))
* **home:** skip host-picker on first load if gateway or Docker detected ([4fc413a](https://github.com/asieduernest12/occ/commit/4fc413ab84c284d8373c7e8742e424db65ad52e5))
* increase E2E test timeouts and improve page navigation reliability ([66bfc3a](https://github.com/asieduernest12/occ/commit/66bfc3ae8af16f320e883681b7ab7e596c130d4e))
* **install:** parallelize postinstall and cascade from root npm install ([e412fc9](https://github.com/asieduernest12/occ/commit/e412fc91705d87329fd88adc8a1bb8ca6270e20b))
* only close CDP sessions that the test created ([f224949](https://github.com/asieduernest12/occ/commit/f2249491085dac1f68b9ccb2c89f58d127283b29))
* **openclaw-docker:** resolve EACCES in docker-in-docker gateway setup ([bc6ac80](https://github.com/asieduernest12/occ/commit/bc6ac805d31247f16bc2c3bd1e37a5f2767edbd2))
* **openclaw:** stop setup panel from mounting gateway data dir as root ([12a2301](https://github.com/asieduernest12/occ/commit/12a230148a5ba64ad8ebe7add917b3f9b6e90413))
* resolve E2E test fixture URL handling in CDP mode ([ed99fe0](https://github.com/asieduernest12/occ/commit/ed99fe05124467d9b682670de9bd4f91954c76a8))
* skip node install if higher version already available ([5febd12](https://github.com/asieduernest12/occ/commit/5febd12be82870026a932d1ee88befbcc26ebd3e))
* **ui:** add missing webview message handler for 'Open Web Control' button ([3c8c1a5](https://github.com/asieduernest12/occ/commit/3c8c1a55207ab351bbcbdc8272777a258ae28613))
* use configured host port when opening docker dashboard ([f9f38a4](https://github.com/asieduernest12/occ/commit/f9f38a4166a3e7281c5f535dd9fc6cd480521554))

## [3.5.0](https://github.com/asieduernest12/occ/compare/v3.2.35...v3.5.0) (2026-04-10)


### Features

* add application icon files for branding ([69e61c7](https://github.com/asieduernest12/occ/commit/69e61c7d760461788802e9baced41d79dc0c6580))
* add commit and bump npm script' ([cf887bc](https://github.com/asieduernest12/occ/commit/cf887bc07ec3d1f7fe115ac01b9947964f5474d4))
* add dev:editor script; serve editor via code-server on port 9888 ([1f22d3c](https://github.com/asieduernest12/occ/commit/1f22d3ce8d3f751a2a2bf2258048dd468e8f0b03))
* Add error code definitions and error modal component ([b747fc3](https://github.com/asieduernest12/occ/commit/b747fc3862728704a741081f917f704f1f4a409d))
* Add error message display to Docker setup wizard ([7e87022](https://github.com/asieduernest12/occ/commit/7e870221d71fbb75a4b0539689b534d50056bcbe))
* Display product version from version.txt in OCC Home panel ([d46cffc](https://github.com/asieduernest12/occ/commit/d46cffc3f0fa2ca46ba437b4787ad99a8eea878b))
* **docker:** add bind host config, switch to host networking ([68b8288](https://github.com/asieduernest12/occ/commit/68b8288c4c7a8f430e14db4441965e8396f14251))
* **docker:** auto-configure occ-legacy on Docker install, skip API key prompt ([6fcbae0](https://github.com/asieduernest12/occ/commit/6fcbae00cebb19c4906eb7aafbfb8e09c1cfd826))
* **docker:** rewrite setup wizard to use official openclaw image ([97a5aed](https://github.com/asieduernest12/occ/commit/97a5aed4c648a2f24ad5de81982380da52a58c15))
* extract StatusPanelController + show full status panel in adapter tabs ([0aa329b](https://github.com/asieduernest12/occ/commit/0aa329bb168a2f2547d910e1340a0f0babb2d104))
* **home:** add bind host config to Docker 3-step flow ([bd6c4af](https://github.com/asieduernest12/occ/commit/bd6c4afb67d62735592e6a4f40ba2a41c869d4fe))
* Implement error collection and reporting system ([712ed27](https://github.com/asieduernest12/occ/commit/712ed27d6852b25b7ccb99426f73a3bdba447804))
* **multihost:** add shared host types + adapter extension scaffolds ([2db4263](https://github.com/asieduernest12/occ/commit/2db42635216d5cef16a821c3c3b8412b7d27eb32))
* **multihost:** HostRegistry, HostManager, status bar, tree provider, API export ([2cdcfc2](https://github.com/asieduernest12/occ/commit/2cdcfc28e3d71e3365d14c7c4cf91c2b64345b9f))
* **multihost:** openclaw-docker extension + openclaw-ssh stub ([fa90261](https://github.com/asieduernest12/occ/commit/fa90261fa2811961024a136bbf22d21d7a9355e2))
* **multihost:** openclaw-local extension — LocalHostAdapter + LocalHostConnection ([03a88b8](https://github.com/asieduernest12/occ/commit/03a88b87736aa65a127c799c84ab4c9f3950e69d))
* **multihost:** Phase 2b — home.ts surgical refactor to HostConnection ([5409dfe](https://github.com/asieduernest12/occ/commit/5409dfe29df5811e871feb925b311ca4e295029a))
* show extension version below OCC logo on all welcome panels ([b874210](https://github.com/asieduernest12/occ/commit/b874210084217d9aacd5a4851a06385bbba3df16))
* smart host routing + dual status panel titles + hosts overview ([854153f](https://github.com/asieduernest12/occ/commit/854153f7633fe509fc29b0ea18c32134b1034132))
* **ticket-021:** add docker compose full stack + fix launch-editor.sh for Linux ([0dfd354](https://github.com/asieduernest12/occ/commit/0dfd354e949a2207a5542d3809a39b2aff6e9d2d))
* **ticket-021:** co-locate .openclaw inside OCC install dir (~/Desktop/occ/.openclaw) ([a158e82](https://github.com/asieduernest12/occ/commit/a158e82293e8a307dfe093c6109d5fc5a866116a))
* **ticket-021:** complete Docker bootstrap setup and local option ([32b49c4](https://github.com/asieduernest12/occ/commit/32b49c457336a81e65da03600cf54c62bbd5aba2))
* **ticket-021:** implement docker bootstrap wizard UI + engine in home.ts ([c405dc6](https://github.com/asieduernest12/occ/commit/c405dc6eabe3af2a2a678b5980682b1bd1ffa3b5))
* **ticket-022:** add Playwright e2e smoke tests + workbench browser fixes ([99eeb49](https://github.com/asieduernest12/occ/commit/99eeb49b892b9d7609ded640cdc7763c6244073c))
* **ticket-022:** implement Docker compose validation workflow ([e75719a](https://github.com/asieduernest12/occ/commit/e75719a2ab1552341dc061a241ddce7e157a0e27))
* **ticket-026:** dev scheme ownership for occode:// on all platforms ([e56ac73](https://github.com/asieduernest12/occ/commit/e56ac73a5a8b582e0aa0216e9cf8390d6dbcadeb))
* **ticket-028:** add ticket for editor web server mode and Playwright e2e ([b91a2aa](https://github.com/asieduernest12/occ/commit/b91a2aa85ff8d851fbf99573c3f4182f0e05b59a))
* **ticket-029:** add Playwright smoke test ticket ([9f40c12](https://github.com/asieduernest12/occ/commit/9f40c1273fd844983edfdeb7a271b563438edfa3))
* **ticket-030:** add Dockerfile.openclaw, rename compose file, update all references ([784e149](https://github.com/asieduernest12/occ/commit/784e149e648ae05212fe9e364ae7ce393befed69))
* **ticket-038:** add configurable gateway port and env file ([e249013](https://github.com/asieduernest12/occ/commit/e2490131e313caa998d2722d694287da4aad3b03))
* **ticket-038:** add docker setup UI with port config ([15078e9](https://github.com/asieduernest12/occ/commit/15078e97cb346f464c9bf9623fd6679e2c5dd3c1))
* **ticket-038:** add gatewayReboot to host adapters ([7f23672](https://github.com/asieduernest12/occ/commit/7f23672b2aaaaffd3829f886b1a088b99585e3b8))
* **ticket-040:** add 3-step Docker config modal to Home panel ([4c058ec](https://github.com/asieduernest12/occ/commit/4c058ecba5b9129232536a5af14cff87a0061d28))
* **ticket-040:** replace modal docker config with full-page step views ([9b728c1](https://github.com/asieduernest12/occ/commit/9b728c127fea1c2df15b42d6f9a2cdd50b4b06f3))
* **ticket-045:** add error reporting for Docker provisioning failures ([90f3d8c](https://github.com/asieduernest12/occ/commit/90f3d8c1169f72f7689b4e9eeb6f9f09462d437e))
* **tickets-031-035:** implement post-provision flow — AI config, auto-open, dashboard unify, IDE transition, reset command ([16d791a](https://github.com/asieduernest12/occ/commit/16d791ab33d8e0f4895d71d4c97e6dbbe3518aa6))
* **web:** replace download CTAs with early access signup form ([df886de](https://github.com/asieduernest12/occ/commit/df886de17afd600ab7186d0a79ceb13d72045934))
* window-level host binding — one host per VS Code window ([22648fb](https://github.com/asieduernest12/occ/commit/22648fb41c37699c97ebd9893f55356cee2c4216))


### Bug Fixes

* Add comprehensive debugging for Docker config flow ([a1691d0](https://github.com/asieduernest12/occ/commit/a1691d08b6076009caa6e681df5caafa23b7adad))
* auto-register occode:// protocol handler on Linux, add to Windows installer ([59d84f5](https://github.com/asieduernest12/occ/commit/59d84f5293229bcb16b28ad168ee6a4547b55579))
* **build:** use explicit path for rcedit to avoid npx resolution issues on Windows ([ef2a095](https://github.com/asieduernest12/occ/commit/ef2a09549c4b958d2f0c5c7f5731debce722f6ab))
* **ci:** give each matrix leg a unique artifact name to prevent overwrites ([83f9996](https://github.com/asieduernest12/occ/commit/83f999627a13b20fe6fea99f8d3aeb613a175004))
* **docker:** bind server to 0.0.0.0, use curl for healthcheck, skip postinstall in dev ([b87c8cc](https://github.com/asieduernest12/occ/commit/b87c8cc7618eb80d200058d7cb8ab609d13079d1))
* **docker:** show full status panel instead of install screen ([62dd967](https://github.com/asieduernest12/occ/commit/62dd967a5eba099b53610c7058eab0befaeb4d80))
* enable Chromium sandbox and resolve blank window on virtual GPUs ([3568ed9](https://github.com/asieduernest12/occ/commit/3568ed918db2ca2456b6179557d9d225d5c81d94))
* fetch download URLs client-side to fix stale versions on static export ([9430363](https://github.com/asieduernest12/occ/commit/9430363731550adce94e4f144c643072ee4ee8f3))
* Improve data directory display and debugging on Docker setup ([ceb0813](https://github.com/asieduernest12/occ/commit/ceb081300b2616ca567364dbdcdbc0555d8824b3))
* MultiHost Docker panel — eliminate setActiveHost race causing host-selector bounce ([0dc263f](https://github.com/asieduernest12/occ/commit/0dc263f8ae90c5448229aea1574de86aa1f9b4c2))
* **multihost:** correct adapter extension main paths after TS rootDir inference ([c388acc](https://github.com/asieduernest12/occ/commit/c388acc77b18e8831b4ae41b1866c7c308af2603))
* parametrisize docker mem limit ([a4fc0b2](https://github.com/asieduernest12/occ/commit/a4fc0b29e84f139954f226ea2246fd87667f5dba))
* register missing openclaw.host.setup.{local,docker,ssh} commands ([dbda104](https://github.com/asieduernest12/occ/commit/dbda104c07fdec945af14d7745c2d717af5ea240))
* replace litellm/localhost:4000 references with occ.mba.sh ([6334c6d](https://github.com/asieduernest12/occ/commit/6334c6ddea72c4f38ecfdd91e5e7ba098ce04b93))
* replace npx rcedit with gulp task for win32 icon stamping ([e8d5521](https://github.com/asieduernest12/occ/commit/e8d5521dd1bea070e79a2c4747b7f55f5c3ed756))
* Resolve npm ENOENT and EACCES errors in multi-user Docker environment ([d983ef6](https://github.com/asieduernest12/occ/commit/d983ef68781c1d46f6c6778b8a32b3f8c48ef36f))
* Resolve npm lookup failures in multi-user environments ([521fd42](https://github.com/asieduernest12/occ/commit/521fd423e3175724164899903c8352682d01fdc8))
* restore npx rcedit in build-windows (not a local dep) ([1187860](https://github.com/asieduernest12/occ/commit/11878603752ba53b1a2f1b08eab2b89fc2088c25))
* run npm i before concurrently in dev:editor script ([96d7957](https://github.com/asieduernest12/occ/commit/96d795734508944d2075c1424ec07755ef556295))
* shorten early access button text to prevent multi-line wrapping ([086a144](https://github.com/asieduernest12/occ/commit/086a14426ec83064d1d1c4cf70fe09ae01581e5d))
* skip npm postinstall scripts in container build ([376eabc](https://github.com/asieduernest12/occ/commit/376eabce3b1dd4bb5abfd7797a785b50a995a328))
* **ssh:** verify install script integrity before execution ([9f17fc3](https://github.com/asieduernest12/occ/commit/9f17fc3f85877dedabcba99949f4f6bc2d58374c))
* **ticket-001:** update onboarding copy — remove MoltPilot references, rename Start Free to Create Account ([cb5e86c](https://github.com/asieduernest12/occ/commit/cb5e86c37c7de08a504ab5c7093984961478994a))
* **ticket-027:** correct compose file path in _handleResetSetup and validate-docker ([58a220f](https://github.com/asieduernest12/occ/commit/58a220f1cda550d71405e027b9d8808ced159d29))
* **ticket-030:** align compose volume mount with Dockerfile root user ([2970963](https://github.com/asieduernest12/occ/commit/2970963e1005748e1798900496fe1278593f9ddf))
* **ticket-030:** correct docker card flow and amend PRD ([79f7c07](https://github.com/asieduernest12/occ/commit/79f7c07ffbee17deca40b0164178a24321467aca))
* **ticket-030:** direct docker card flow — auto-provision on click ([b66ba4a](https://github.com/asieduernest12/occ/commit/b66ba4ac8e7f573aa174cc740b48f8877956e635))
* **ticket-030:** replace docker compose pull with build for gateway image ([c65b213](https://github.com/asieduernest12/occ/commit/c65b2130e1b0832748b9be63f329f06d148010a0))
* **ticket-030:** rewrite Dockerfile.openclaw using oven/bun:1.3.10-slim template ([b592a1e](https://github.com/asieduernest12/occ/commit/b592a1e1cf7988d8bec9f3704268128391d5d4c4))
* **ticket-030:** rewrite Dockerfile.openclaw with oven/bun base, fnm, node 24, openclaw cli ([ec9ded2](https://github.com/asieduernest12/occ/commit/ec9ded26c8dbc8df43c2acef2c49a699a1e8d576))
* **ticket-036:** remove host port bindings for postgres and redis ([72082c1](https://github.com/asieduernest12/occ/commit/72082c10e5b917c3158bdfee57ca8addc0ae6144))
* **ticket-036:** run docker compose down before provision to ensure clean state ([aa628d4](https://github.com/asieduernest12/occ/commit/aa628d43cfe2d8c08a221bc7e7e639a12894b163))
* **ticket-037:** MoltPilot Open Chat button fails with image input error ([9ae951c](https://github.com/asieduernest12/occ/commit/9ae951c66e18fc4db98c87b147e7f4af23f19380))
* **ticket-039:** resolve Windows app icon showing blue box ([6d75543](https://github.com/asieduernest12/occ/commit/6d7554385eda03afe93473fb81d95ad2d37d6c78))
* **ticket-040:** wire Docker card to 3-step config modal ([278c8ee](https://github.com/asieduernest12/occ/commit/278c8ee82dbe539f77eaeb1a6af2efe4384710ee))
* **ticket-040:** wire Docker card to config modal ([8bb1258](https://github.com/asieduernest12/occ/commit/8bb125822189f325238dd5a6a8af5796fb2539c5))
* **tickets-032,034:** fix failing acceptance criteria from audit ([8971082](https://github.com/asieduernest12/occ/commit/89710829dd5bbe4bad52b51380c5c35599de87d9))
* **tickets-034,035:** fix remaining failing acceptance criteria from audit ([80b1faf](https://github.com/asieduernest12/occ/commit/80b1faf1d0cf4074dd06e5bb5913bc543b357f51))

## [3.4.3](https://github.com/damoahdominic/occ/compare/v3.4.2...v3.4.3) (2026-04-04)

## [3.4.2](https://github.com/damoahdominic/occ/compare/v3.3.0...v3.4.2) (2026-04-04)


### Features

* add commit and bump npm script' ([8add84d](https://github.com/damoahdominic/occ/commit/8add84de7dd7e85bf8c5b0511b51a741afcab9e4))
* add dev:editor script; serve editor via code-server on port 9888 ([9546e30](https://github.com/damoahdominic/occ/commit/9546e30eeb6096c5c8865b9cce9e7c6393c76fd7))
* **ticket-021:** complete Docker bootstrap setup and local option ([e066210](https://github.com/damoahdominic/occ/commit/e0662101b149d7b6c519404fe242572e8e5bf847))
* **ticket-022:** add Playwright e2e smoke tests + workbench browser fixes ([55f282a](https://github.com/damoahdominic/occ/commit/55f282a5a650e96efcf87dc4e9cfcd5c784999b1))
* **ticket-022:** implement Docker compose validation workflow ([73213c5](https://github.com/damoahdominic/occ/commit/73213c5909252b2760e33142f9fa4ec809b74c9e))
* **ticket-026:** dev scheme ownership for occode:// on all platforms ([29e1aa1](https://github.com/damoahdominic/occ/commit/29e1aa1d8caa9f1fbdd180770e11cbd113456ec3))
* **ticket-028:** add ticket for editor web server mode and Playwright e2e ([b39b2ab](https://github.com/damoahdominic/occ/commit/b39b2abc7f357dd5cf178027aba225118ecabde9))
* **ticket-029:** add Playwright smoke test ticket ([6de0911](https://github.com/damoahdominic/occ/commit/6de091143eaa53daf90e5115c3bb1dd283bdf531))
* **ticket-030:** add Dockerfile.openclaw, rename compose file, update all references ([bc8f716](https://github.com/damoahdominic/occ/commit/bc8f716222bd8e9d131318a17daa5939ea865e70))
* **ticket-038:** add configurable gateway port and env file ([3531db2](https://github.com/damoahdominic/occ/commit/3531db2c784a404b9a3276cb283661717c268cf7))
* **ticket-038:** add docker setup UI with port config ([0c3d919](https://github.com/damoahdominic/occ/commit/0c3d9197c6347e35d7855ca17cdbaabe938a6a98))
* **ticket-038:** add gatewayReboot to host adapters ([09b5443](https://github.com/damoahdominic/occ/commit/09b5443ff27e1e6ade95bfef6ca29ab7c6e6c680))
* **tickets-031-035:** implement post-provision flow — AI config, auto-open, dashboard unify, IDE transition, reset command ([5698a69](https://github.com/damoahdominic/occ/commit/5698a69ece13607c4b856bc506a3518b4a302d3b))


### Bug Fixes

* deeplinking working and showing setup cards after signup. hurray ([39feb63](https://github.com/damoahdominic/occ/commit/39feb632a9289632659030e7c88f84add4265805))
* **docker:** bind server to 0.0.0.0, use curl for healthcheck, skip postinstall in dev ([22b3e96](https://github.com/damoahdominic/occ/commit/22b3e96a98cc077bf5718ca3a601b407ad8bb52d))
* parametrisize docker mem limit ([8500346](https://github.com/damoahdominic/occ/commit/85003467eadcccadcb782a91f0ec015d9dd580f7))
* run npm i before concurrently in dev:editor script ([72c418d](https://github.com/damoahdominic/occ/commit/72c418dd664ccc939f09c7b57787d1c91308495d))
* **ticket-001:** update onboarding copy — remove MoltPilot references, rename Start Free to Create Account ([8ce7309](https://github.com/damoahdominic/occ/commit/8ce730907908f11937d51be1f1c866ca207484d5))
* **ticket-027:** correct compose file path in _handleResetSetup and validate-docker ([7423f7a](https://github.com/damoahdominic/occ/commit/7423f7a9f63ad4a14a44f7659ed7f3bea67d2b55))
* **ticket-030:** align compose volume mount with Dockerfile root user ([8381e21](https://github.com/damoahdominic/occ/commit/8381e21517b34afd050d1b891400ac5c1b2731fd))
* **ticket-030:** correct docker card flow and amend PRD ([3d8f751](https://github.com/damoahdominic/occ/commit/3d8f751ebe35653b4d7b91ba103d62dfc69f1fa3))
* **ticket-030:** direct docker card flow — auto-provision on click ([6742fd5](https://github.com/damoahdominic/occ/commit/6742fd5fd532f45e6367616eb4a045ee63c05e1a))
* **ticket-030:** replace docker compose pull with build for gateway image ([65f30ce](https://github.com/damoahdominic/occ/commit/65f30cec3e1e54908647a3dd014493d7090f5cd5))
* **ticket-030:** rewrite Dockerfile.openclaw using oven/bun:1.3.10-slim template ([1d04873](https://github.com/damoahdominic/occ/commit/1d04873a27ff239de3982e0df4b7367fc6286c96))
* **ticket-030:** rewrite Dockerfile.openclaw with oven/bun base, fnm, node 24, openclaw cli ([461d205](https://github.com/damoahdominic/occ/commit/461d205010b1a48cc1fb9f17cec59b676cfb6ff0))
* **ticket-036:** remove host port bindings for postgres and redis ([5bb86c7](https://github.com/damoahdominic/occ/commit/5bb86c76feee903b51d7610251f7bd8fca1116bb))
* **ticket-036:** run docker compose down before provision to ensure clean state ([a79556b](https://github.com/damoahdominic/occ/commit/a79556b8f9cf7be738843e8129054cc26099cf6e))
* **ticket-037:** MoltPilot Open Chat button fails with image input error ([e12c447](https://github.com/damoahdominic/occ/commit/e12c4475bda94d714a239ca582d221fe0746e58c))
* **ticket-039:** resolve Windows app icon showing blue box ([1672dfe](https://github.com/damoahdominic/occ/commit/1672dfe23e9a8e0036644a054e97e6e65cd1e517))
* **tickets-032,034:** fix failing acceptance criteria from audit ([ba3f07e](https://github.com/damoahdominic/occ/commit/ba3f07e503e3fb53badc94df01c2143fb014c30b))
* **tickets-034,035:** fix remaining failing acceptance criteria from audit ([3327174](https://github.com/damoahdominic/occ/commit/3327174fb6d86fbcaf5d7f33c4e88e16edfba088))

## [3.3.0](https://github.com/damoahdominic/occ/compare/v3.2.47...v3.3.0) (2026-04-01)


### Features

* show extension version below OCC logo on all welcome panels ([f892a5c](https://github.com/damoahdominic/occ/commit/f892a5c444812da28a4ff8f1314795c7df722290))


### Bug Fixes

* enable Chromium sandbox and resolve blank window on virtual GPUs ([9204d2b](https://github.com/damoahdominic/occ/commit/9204d2b82cc3565de4d8ecb2b3269c35cb125c4d))

## [3.2.47](https://github.com/damoahdominic/occ/compare/v3.2.46...v3.2.47) (2026-04-01)


### Bug Fixes

* auto-register occode:// protocol handler on Linux, add to Windows installer ([a5523cd](https://github.com/damoahdominic/occ/commit/a5523cd1d9d51b49dde53f8d516333f21d4aed03))
* register missing openclaw.host.setup.{local,docker,ssh} commands ([bfe334e](https://github.com/damoahdominic/occ/commit/bfe334e1abf87fb98853d513eb03c3698f439d5f))

## [3.2.46](https://github.com/damoahdominic/occ/compare/v3.2.45...v3.2.46) (2026-03-31)


### Bug Fixes

* replace npx rcedit with gulp task for win32 icon stamping ([e65037f](https://github.com/damoahdominic/occ/commit/e65037fe79b6d2dce5a6254c922219818b573566))
* restore npx rcedit in build-windows (not a local dep) ([15146f9](https://github.com/damoahdominic/occ/commit/15146f9d887d3fb7dad1fbd70027fcddf2ffb3b1))

## [3.2.45](https://github.com/damoahdominic/occ/compare/v3.2.42...v3.2.45) (2026-03-31)


### Bug Fixes

* **build:** use explicit path for rcedit to avoid npx resolution issues on Windows ([c21662e](https://github.com/damoahdominic/occ/commit/c21662e8a3c2fcd83f1c8454cba92d25db473c23))
* **ci:** give each matrix leg a unique artifact name to prevent overwrites ([bd91981](https://github.com/damoahdominic/occ/commit/bd9198163f497dd4fdc17a2aaa85c2743b51bd20))

## [3.2.44](https://github.com/damoahdominic/occ/compare/v3.2.42...v3.2.44) (2026-03-31)


### Bug Fixes

* **build:** use explicit path for rcedit to avoid npx resolution issues on Windows ([c21662e](https://github.com/damoahdominic/occ/commit/c21662e8a3c2fcd83f1c8454cba92d25db473c23))
* **ci:** give each matrix leg a unique artifact name to prevent overwrites ([bd91981](https://github.com/damoahdominic/occ/commit/bd9198163f497dd4fdc17a2aaa85c2743b51bd20))

## [3.2.43](https://github.com/damoahdominic/occ/compare/v3.2.42...v3.2.43) (2026-03-31)


### Bug Fixes

* **build:** use explicit path for rcedit to avoid npx resolution issues on Windows ([f8c1fc3](https://github.com/damoahdominic/occ/commit/f8c1fc3b67bf000a9ea9c04bd913b2fc1c4a8419))
* **ci:** give each matrix leg a unique artifact name to prevent overwrites ([09886c8](https://github.com/damoahdominic/occ/commit/09886c8f127ecd152843c0ac2b5826d3f6e45457))

## [3.2.42](https://github.com/damoahdominic/occ/compare/v3.2.40...v3.2.42) (2026-03-31)

## [3.2.41](https://github.com/damoahdominic/occ/compare/v3.2.40...v3.2.41) (2026-03-31)

## [3.2.40](https://github.com/damoahdominic/occ/compare/v3.2.39...v3.2.40) (2026-03-31)

## [3.2.38](https://github.com/damoahdominic/occ/compare/v3.2.39...v3.2.38) (2026-03-31)

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
