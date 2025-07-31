#### 3.5.0 Release

 - fix(installer): Silent misleading device agent output (#451)
 - fix(installer): link to README.md in the summary (#449)
 - Bump cycjimmy/semantic-release-action from 4.2.1 to 4.2.2 (#447)
 - ci: Introduce `Publish Installer Scripts to GitHub Pages` workflow (#461) @ppawlowski
 - Add FF Tables support (#460) @hardillb
 - Bump on-headers and express-session (#454) @app/dependabot
 - Disable npm audit when installing modules (#456) @knolleary
 - ci: Update installer's "get" scripts on a release (#452) @ppawlowski
 - Clear blueprint cache before repopulating (#453) @knolleary
 - docs: Describe the Installer release process (#445) @ppawlowski

#### 3.4.0 Release

 - Bump actions/upload-artifact from 4.4.3 to 4.6.2 (#436)
 - Bump actions/setup-node from 4.0.4 to 4.4.0 (#437)
 - Bump cycjimmy/semantic-release-action from 4.1.0 to 4.2.1 (#438)
 - Bump actions/download-artifact from 4.1.8 to 4.3.0 (#439)
 - Bump docker/setup-buildx-action from 3.11.0 to 3.11.1 (#424)
 - Bump docker/setup-buildx-action from 3.10.0 to 3.11.0 (#422)
 - Enable telemetry by default (#443) @knolleary
 - ci: Rename `macos` to `darwin` in the DAI binary naming scheme (#431) @ppawlowski
 - ci: Simplify go dependency cache management in DAI related workflows (#430) @ppawlowski
 - ci: Skip "Default Build & Test" workflow on installer changes (#428) @ppawlowski
 - ci: Fix installer version set during a release build (#429) @ppawlowski
 - Add blueprint library plugin and rename team library plugin (#426) @knolleary
 - Simplified flow file import browsing in terminal (#419) @Steve-Mcl
 - feat: Introduce `installer-mode` CLI flag (#409) @ppawlowski

#### 3.3.2 Release

 - Bump docker/build-push-action from 6.17.0 to 6.18.0 (#410)
 - Bump docker/build-push-action from 6.16.0 to 6.17.0 (#403)
 - misc: Rename FlowForge to FlowFuse (#412) @ZJvandeWeg
 - Only use local HOME env var if not passed from settings (#402) @hardillb

#### 3.3.1: Release

 - Fix ffVersion parsing to handle version suffixes properly (#398) @knolleary

#### 3.3.0: Release

 - Import snapshot during otc setup (#390) @Steve-Mcl
 - Ask to start if quick config used (#381) @hardillb
 - Update README.md to mention /device-editor (#374) @hardillb
 - Bump @babel/runtime from 7.25.9 to 7.26.10 (#367) @app/dependabot
 - Bump peter-evans/dockerhub-description from 4.0.0 to 4.0.1 (#373) @app/dependabot
 - Bump docker/build-push-action from 6.15.0 to 6.16.0 (#389)
 - Bump actions/setup-node from 4.3.0 to 4.4.0 (#380)

#### 3.2.0: Release

 - Implement Local Login support (#371) @Steve-Mcl
 - chore: Pin external actions to commit hash (#369) @ppawlowski

#### 3.1.3: Release

 - Do not copy theme into project node_modules (#358) @knolleary
 - Add user role in auth object (#363) @knolleary
 - Bump docker/build-push-action from 6.13.0 to 6.14.0 (#355) @app/dependabot

#### 3.1.2: Release

 - Remove custom callback resolve function (#353) @knolleary
 - Bump serialize-javascript and mocha (#352) @app/dependabot

#### 3.1.1: Release

 - Add openssl to the docker dependencies (#350) @hardillb
 - Docker as none root user (#349) @hardillb

#### 3.1.0: Release

 - Reload device settings when restarting in dev mode (#348) @knolleary
 - Add support for httpNodeAuth (#341) @knolleary
 - Bump docker/build-push-action from 6.12.0 to 6.13.0 (#340) @app/dependabot
 - Bump docker/build-push-action from 6.11.0 to 6.12.0 (#339) @app/dependabot
 - Better error logging when provisioning devices with token (#338) @hardillb
 - Bump docker/build-push-action from 6.10.0 to 6.11.0 (#335) @app/dependabot
 - Bump docker/setup-qemu-action from 3.2.0 to 3.3.0 (#336) @app/dependabot
 - Correction to httpNodeAuth config example (#334) @Steve-Mcl

#### 3.0.2: Release

 - Apply custom message in login dialog on direct access (#332) @knolleary
 - Bump docker/setup-buildx-action from 3.7.1 to 3.8.0 (#331) @app/dependabot
 - Send nr version (#327) @hardillb
 - Bump docker/build-push-action from 6.9.0 to 6.10.0 (#330) @app/dependabot

#### 3.0.1: Release

 - Pass through teamBroker feature flag to project nodes (#328) @knolleary
 - Log reason Provisioning failed (#325) @hardillb

#### 3.0.0: Release

IMPORTANT NOTES:
 - This release drops support for NodeJS versions below 18.
 - If you need NodeJS v14 or v16 support, use the latest v2.x version of Device Agent.

UPDATES:
 - Update mqttjs to latest (#322) @Steve-Mcl
 - Add support for picking up `httpNodeAuth` from device yaml (#320) @Steve-Mcl
 - Bump docker/setup-buildx-action from 3.6.1 to 3.7.1 (#319) @dependabot
 - Bump docker/build-push-action from 6.7.0 to 6.9.0 (#318) @dependabot
 - Upgrade to latest MQTT.js (#306) @hardillb
 - Bump minimum nodejs version (#316) @hardillb
 - Randomise reconnect timing (#315) @Steve-Mcl
 - Use port from config file (#313) @hardillb
 - Bump docker/build-push-action from 4.0.0 to 6.7.0 (#307) @dependabot
 - Bump docker/setup-buildx-action from 2.6.0 to 3.6.1 (#301) @dependabot
 - Bump docker/login-action from 3.2.0 to 3.3.0 (#297) @dependabot
 - Bump docker/setup-qemu-action from 3.1.0 to 3.2.0 (#295) @dependabot

#### 2.8.0: Release

 - Audit log crashes (#310) @Steve-Mcl
 - Ensure NODE_EXTRA_CA_CERTS is passed to NR (#308) @hardillb
 - Update flowfuse-device.service with Example for port (#304) @gdziuba
 - Allow arguments to device agent (#303) @hardillb

#### 2.7.0: Release

 - Add HOME env var to passed through list (#299) @hardillb
 - Add heartbeat to Editor WebSocket Tunnel (#293) @hardillb
 - Bump docker/setup-qemu-action from 3.0.0 to 3.1.0 (#292) @dependabot

#### 2.6.0: Release

 - Bump docker/setup-qemu-action from 2.2.0 to 3.0.0 (#264) @app/dependabot
 - Bump docker/metadata-action from 3 to 5 (#259) @app/dependabot
 - Bump docker/login-action from 2.2.0 to 3.2.0 (#269) @app/dependabot
 - Bump ws from 7.5.9 to 8.18.0 (#287) @app/dependabot
 - Bump ws from 8.13.0 to 8.17.1 (#279) @app/dependabot
 - Support for nr-assistant (#285) @Steve-Mcl
 - Update release-publish to NodeJS 18 (#286) @hardillb
 - Bump JS-DevTools/npm-publish from 2.2.0 to 3.1.1 (#258) @app/dependabot
 - Bump docker base to Node 18 (#282) @knolleary
 - Bump braces from 3.0.2 to 3.0.3 (#276) @app/dependabot

#### 2.5.0: Release

 - Proxy support (#272) @Steve-Mcl
 - Bump actions/setup-node from 3 to 4 (#261) @dependabot
 - Bump actions/checkout from 3 to 4 (#260) @dependabot
 - Bump peter-evans/dockerhub-description from 3 to 4 (#262) @dependabot
 - Enable dependabot for github actions (#257) @ppawlowski

#### 2.4.1: Release

 - Ensure local ws connections are closed on disconnect (#255) @knolleary
 - Update `package.json` with user defined node-red version (#254) @Steve-Mcl
 - If NR process has exited, dont send or wait for sigxxx (#252) @Steve-Mcl

#### 2.4.0: Release

 - Add catalogue and npmrc to App bound instances (#246) @hardillb

#### 2.3.2: Release

 - Remove Object.hasOwn (#248) @knolleary
 - Add nodejs 18 & 20 to test runners (#247) @hardillb
 - Respect shared-library and projectComms feature flags (#244) @Steve-Mcl

#### 2.3.1: Release

 - Fix CORS handling (#242) @hardillb

#### 2.3.0: Release

 - Add support for device actions (#239) @Steve-Mcl
 - Save affinity cookie locally so it can be reused between restarts (#238) @knolleary

#### 2.2.0: Release

 - Wire up Node-RED instance audit events to FF (#232) @Steve-Mcl
 - Implement deferred stop like nr-launcher (#236) @Steve-Mcl
 - Fix theme following org name change (#235) @Steve-Mcl
 
#### 2.1.0: Release

 - Implement quick connect in device agent (#226) @Steve-Mcl
 - Fix affinity cookie parsing (#225) @knolleary
 
#### 2.0.0: Release

 - Enable WebSocket Affinity in the device agent (#213) @hardillb
 - Fix WS readystate crash (#221) @Steve-Mcl
 - Permit Device Agent to automatically re-establish Editor Tunnel after a restart (#220) @Steve-Mcl
 - Fix console.log(JSON) (#219) @hardillb

#### 1.15.0: Release

 - Fix Docker path to the config file (#215) @robmarcer
 - Protect against unhandled exceptions (#212) @Steve-Mcl

#### 1.14.0: Release

 - Move to @flowfuse/nr-theme (#210) @knolleary
 - Revert "Include project nodes for app assigned devices" (#208) @Steve-Mcl
 - Include project nodes for app assigned devices (#205) @Steve-Mcl

#### 1.13.3: Release

 - Fix references in workflow (#202) @knolleary

#### 1.13.2: Release

 - Update logo to fuse branding (#199) @knolleary
 - Rebranding in the service file and installer (#198) @knolleary
 - Move npm org (#197) @knolleary
 - Update setup-node action (#196) @hardillb
 
#### 1.13.1: Release

 - Ensure that tunneled payloads are parsed (#189) @hardillb
 - bug: Use $USER instead of undefined variable (#193) @ZJvandeWeg

#### 1.13.0: Release

 - Update a bunch of branding issues (#190) @knolleary
 - Ensure PATH is always passed to NR (#186) @hardillb
 - Create raspbian install script (#171) @MarianRaphael
 - Update ff references in package.json (#181) @knolleary
 - Change repo references after github org rename (#172) @ppawlowski
 
#### 1.12.0: Release

 - Support custom npm catalogues (#177) @hardillb

#### 1.11.2: Release

 - Support Node-RED 3.1 - due to changed internal dependency (#174 #175) @hardillb
 
#### 1.11.1: Release

 - Device Node-RED app environment variables: allow controllable propagation of env set to process to Node-RED app (#146) @elenaviter
 - Do not attempt editor reconnect if platform tells us No Tunnel (#169) @knolleary
 - Snapshot download retry (#167) @Steve-Mcl

#### 1.11.0: Release

  - Allow a device to be assigned to application (#161) @Steve-Mcl

#### 1.10.1: Release

 - Increase snapshot download timeout (#163) @hardillb
 - Bump word-wrap from 1.2.3 to 1.2.5 (#160) @app/dependabot
 - Fix device running or reporting old snapshot id/name (#157) @Steve-Mcl

#### 1.10.0: Release

 - Use local TZ env var else use timeZone from settings (#155) @hardillb
 - Adds FF library plugin (#141) @Steve-Mcl

#### 1.9.6: Release

 - Allow use of private CA for HTTPS certs (#150) @hardillb

#### 1.9.5: Release
 
 - Modify editor tunnel to reconnect to platform if connection drops (#144) @knolleary

#### 1.9.4: Release

 - Ensure agent handles first run without currentMode set (#137) @knolleary
 - Fix nr-theme source path (#136) @hardillb

#### 1.9.3: Release

 - Ensure device gets FF theming (#107) @Steve-Mcl
 - Improve logs around Developer mode and pull snapshot if local device has changed (#128) @Steve-Mcl
 - Fix starting agent in dev mode without existing snapshot locally (#131) @knolleary
 - Add build tools to build npm deps (#122) @hardillb
 - Ensure agent runs on Node 14 (#130) @knolleary
 - Ensure buffered agent messages have the properly formatted ts prop (#129) @knolleary
 - doc fix: s/yaml/yml/ (#127) @ZJvandeWeg
 - Update device agent docs around windows support (#119) @Steve-Mcl
 - Add package-lock.json (#121) @Pezmc
 - Build for all platforms (#118) @hardillb

#### 1.9.2: Release

 - Fix broken build script @hardillb

#### 1.9.0: Release

Note: the version number jump to 1.9.0 has been done to bring the numbering
into line with the FlowForge platform and the tags applied to the Device Agent
docker container.

 - Support httpStatic via device.yml file (#112) @knolleary
 - Support https configuration from device.yml (#111) @knolleary
 - Move building the docker container to this repo (#106) @hardillb
 - Ensure device settings are updated (#104) @Steve-Mcl
 - Add log entries for new config applied by UI (#105) @Steve-Mcl

#### 0.9.0: Release

 - Update version to 0.9.0
 - Device Agent UI (#92) @Steve-Mcl
 - Pull latest snapshot in dev mode if started without any project config (#98) @knolleary
 - Warn if NR is not running when trying to start editor (#96) @hardillb
 
#### 0.8.0: Release

 - Set editor header.title to device name if not otherwise set (#88) @knolleary
 - Add verbose logging of proxy requests and shift to 127.0.0.1 (#87) @knolleary
 - Increase the timeout to create WS connection to Forge (#86) @hardillb
 - Bump to 0.8.0 (#85) @knolleary
 - Remote device access, editing and snapshotting with Auth enabled (#77) @Steve-Mcl
 - Ensure log body is a string (#80) @hardillb

#### 0.7.0: Release

 - Do not setup checkin timeout if an update has already arrived (#70) @knolleary
 - Device Remote logging (#66) @hardillb

#### 0.6.2: Release

 - Ensure cli usage errors are reported properly (#67) @knolleary
 - Remove/recreate symlink to module_cache if exists (#63) @hardillb
 - Ensure settings are pulled for first snapshot (#65) @hardillb
 - Allow the agent to start if initial checkin fails (#64) @knolleary

#### 0.6.1: Release

 - Docs: update 'project' terminology to 'instances' (#59) @knolleary

#### 0.6.0: Release

 - Auto Device Provisioning (#56) @Steve-Mcl
 - Move nodejs version check (#55) @hardillb

#### 0.5.0: Release
 
 - Add Project name, version to package.json (#49) @hardillb
 - Ensure ws URLs with ipv6 address can connect MQTT (#51) @Steve-Mcl
 - Support running on offline devices (#47) @hardillb

#### 0.4.0: Release

 - Add "memory" and "persistent" as context stores (#44) @Steve-Mcl

#### 0.3.0: Release

 - Device does not exit cleanly following new jitter timing (#41) @Steve-Mcl
 - add jitter to mqtt and http checkin (#35) @Steve-Mcl
 - Add NodeJS version test at startup (#39) @hardillb
 - Update eslint and include build GH action (#38) @knolleary
 - Align cli comment with args.js (#36) @Steve-Mcl

#### 0.2.2: Maintanence Release

 - Bump to v0.2.2 (#33) @hardillb
 - Fix lint error 
 - change log format (#31) @sammachin

#### 0.2.1: Maintanence Release

 - Clean up .config.nodes.json (#28) @hardillb
 - Add support for relative paths (#26) @hardillb

#### 0.2.0: Release

  - Add project-node support (#24) @knolleary
  - Add MQTT connectivity support (#22) @knolleary

#### 0.1.0: Release

 - First pass Device Environment Vars (#16) @hardillb
 - Fix typo in settings.js template (#18) @hardillb
 - Fix engines dependency (#13) @flecoufle
 - logging: Poll messages moved from info to debug (#11) @ZJvandeWeg
 - Let Agent NR listen on all interfaces (#8) @hardillb
 - Increase call-home timeout and avoid overlapping requests (#6) @knolleary

#### 0.0.1: Release

Initial alpha release of the Device Agent
