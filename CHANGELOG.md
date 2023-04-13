#### 0.7.0: Release

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
