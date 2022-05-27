# FlowForge Edge Device Agent

An agent to pull Project Snapshots from a FlowForge Deployment and start a Node-RED Instance to run that Snapshot

## Install

```
npm install -g @flowforge/flowforge-edge-agent
```

## Running

```
flowforge-edge-agent -c device.yml -u /var/project
```

Where `-c device.yml` is a file with the following stucture

```yaml
token: ffd_gVza18zyXayiZv4M7bH4S6mwwuqwyTPad9gr4ATOcXY
deviceId: E1xp0zLgy4
credentialSecret: 54ba15afe43da81c463b88b12ab029090d1da593b33726a4a0b581395c26a1ad
forgeURL: http://localhost:3000
period: 60
```

- `deviceId` Identifies the device to the FlowForge Platform
- `token` Token to authenticate with FlowForge
- `credentialSecret` Used to decrypt credentials included in Project Snapshot
- `forgeURL` Where to find the FlowForge Platform

These 4 items are provided when the Device is registered in FlowForge and included in the credentials file 
that can be downloaded at this time.

Optional extra parameters

- `period` Check in interval in seconds. Defaults to 60 if not set


`-u var/project` is the userDir to use to host the project (default is `var/project`)