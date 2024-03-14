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
