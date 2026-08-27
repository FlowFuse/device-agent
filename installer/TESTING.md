# FlowFuse Device Agent Installer — Standardized Testing Scenarios

This document defines consistent, end-to-end scenarios for validating the installer. It covers the happy path (OTC only) and additional flows across Linux, macOS, and Windows.

Conventions
- Binary: `./flowfuse-device-agent-installer` (Linux/macOS) or `flowfuse-device-agent-installer.exe` (Windows)
- Placeholders: `<OTC>`, `<dir>`, `<port>`, `<nodeVer>`, `<agentVer>`

Artifacts to collect (per scenario)
- Installer logs (use `--debug` when helpful)
- Generated service files (systemd unit, SysV/OpenRC script, launchd plist, or NSSM params)
- Service status output and logs
- `installer.conf`

## A. Happy path – OTC only (defaults)
Steps
1) Run: `--otc <OTC>`
2) Wait for installation and configuration to complete

Expect
- Working directory created at default path
- `installer.conf` persisted (includes agent/node versions and default port)
- Service installed and running
- Logs available in `<dir>/logs`

## B. Interactive install – no OTC
Steps
1) Run with no flags, answer the installation directory question (see M)
2) Accept installation in interactive prompt
3) Choose to provide config now (manual) or skip (install-only)

Expect
- Manual path: prompts for YAML; saved as `<dir>/device.yml`; service installed and running
- Install-only: agent installed; service set up per mode; clear next steps printed

## C. Custom installation directory
Steps
1) Run: `--otc <OTC> --dir <dir>`

Expect
- All files created under `<dir>`
- Service runtime includes `--dir <dir>`

## D. Custom port (per-port services)
Steps
1) Run: `--otc <OTC> --port <port>`

Expect
- `installer.conf` contains `"port": <port>`
- Service name suffixed with `<port>` (e.g., `flowfuse-device-agent-1880`)
- Runtime command includes `--port <port>` and agent listens on `<port>`

## E. Multiple instances (optional)
Steps
1) Install two instances with distinct `--dir` and `--port` (e.g., 1880 and 1881)

Expect
- Both services exist and run concurrently without conflicts

## F. Idempotent reinstall
Steps
1) Run installer again with same `--dir` and (optionally) same `--port`

Expect
- Previous service replaced cleanly; ends in running state

## G. Update – Device Agent only
Prereq: Service installed and running
Steps
1) Run: `--update-agent [--agent-version <agentVer>] --dir <dir>`

Expect
- Correct service is stopped/started
- `installer.conf` agentVersion updated (or resolved latest recorded)

## H. Update – Node.js only
Steps
1) Run: `--update-nodejs --nodejs-version <nodeVer> --dir <dir>`

Expect
- Correct service is stopped/started
- Node.js updated and agent remains functional

## I. Update – both
Steps
1) Run: `--update-agent --update-nodejs --agent-version <agentVer> --nodejs-version <nodeVer> --dir <dir>`

Expect
- Both components updated; single stop/start cycle preferred

## J. Uninstall
Steps
1) Run: `--uninstall --dir <dir>` and confirm prompt

Expect
- Service removed (per-port if present; legacy name otherwise)
- Working directory cleaned up
- Service account removal logged (may no-op on some OSes)

## K. Legacy fallback
Scenario
- A legacy service named `flowfuse-device-agent` exists with no port suffix

1) Upgrade
  Steps:
  1) Install `flowfuse-device-agent` previous to latest version using the installer `v1.1.0`
  2) Use the latest installer version to upgrade the `flowfuse-device-agent` to the latest version

  Expect
  - Update process should complete without errors, `flowfuse-device-agent` should be upgraded to the latest version

2) Uninstall
  Steps:
  1) Install `flowfuse-device-agent` using the installer `v1.1.0`
  2) Use the latest installer version to uninstall the `flowfuse-device-agent`

  Expect
  - `flowfuse-device-agent` installation should be completely removed

## L. Help and version output
Steps
1) Run: `--help`
2) Run: `--version`

Expect
- `--port` shown and notes explain per-port service names
- Installer version printed

## M. Installation directory prompt
Prereq: No installation present at the default directory

Steps
1) Run with no flags at all
2) At `Where should the FlowFuse Device Agent be installed?`, press Enter
3) Repeat, answering `some/relative/dir`, then `<dir>`
4) Run: `--otc <OTC>`
5) Run: `--dir <dir>` (no `--otc`)

Expect
- The question appears after the welcome banner and after the permission check (sudo prompt first)
- Step 2 installs into the default directory
- Step 3 rejects the relative path with `Path must be absolute, for example ...`, re-asks, then installs into `<dir>`
- Steps 4 and 5 show no directory question

## N. Installation directory for uninstall and update
Prereq for 1): An installation in the default directory
Prereq for 2): An installation in `<dir>` only, nothing at the default directory

1) Default directory present
  Steps:
  1) Run: `--uninstall` (no `--dir`)
  2) Answer `y` to `Found a FlowFuse Device Agent installation in <default>. Do you want to use it?`
  3) Repeat with `--update-agent` instead of `--uninstall`

  Expect
  - The default directory is used without typing a path
  - Answering `n` instead asks for a path

2) Custom directory only
  Steps:
  1) Run: `--uninstall` (no `--dir`) and answer `<dir>` at the prompt

  Expect
  - No "Found a … installation" question (nothing at the default directory)
  - `<dir>` is uninstalled, same result as `--uninstall --dir <dir>`

## O. System service question
Steps
1) Run with no flags; at the end answer `y` to `Install the system service so the Device Agent starts on system boot?`
2) Repeat a fresh install answering `n`
3) Run: `--otc <OTC>`

Expect
- The question is asked after the installation and device registration complete, not before
- Step 1: service created, started and enabled; summary reports start on system boot and prints the "Further reading" service links; `installer.conf` has `"serviceInstalled": true` and the per-port `serviceName`
- Step 2: no service created (no unit file, plist or NSSM entry); summary states no service was created; the manual start command is printed with the correct `--dir` and `--port`; the service links are not printed; `installer.conf` has `"serviceInstalled": false` and an empty `serviceName`
- Step 2: running the printed command starts the agent in the foreground and it connects to the platform
- Step 2: Node-RED dependency installation succeeds - the agent's `npm install` uses the service account's cache (`~flowfuse/.npm`), not the invoking user's, and resolves to the bundled npm
- Step 3: no question asked, service installed as before

## P. Update and uninstall without a service
Prereq: An installation created by answering `n` in scenario O

Steps
1) Run: `--update-agent --dir <dir>`
2) Run: `--update-nodejs --dir <dir>`
3) Run: `--uninstall --dir <dir>`

Expect
- Steps 1 and 2: log reports the installation has no system service; the package is updated; no service stop or start is attempted; no error about the agent not being installed
- Step 3: uninstall completes and skips service removal
- A legacy `installer.conf` with no `serviceInstalled` key still behaves as before: the service is checked, stopped and restarted


## O. Uninstall with a manually started agent
Prereq: An installation created by answering `n` in scenario M, started with the printed manual command and left running

Steps
1) Run: `--uninstall --dir <dir>` and confirm the removal
2) At the running-agent prompt, stop the agent in another shell, then press Enter
3) Repeat 1), and this time answer `s` at the prompt
4) Repeat 1) with a second agent of another installation also running under the same service account

Expect
- Step 1: the agent is listed with its PID and command before anything is removed; the working directory is still intact at that point
- Step 2: the check clears, the uninstall proceeds, and the service account prompt appears as usual
- Step 3: the uninstall completes, the service account is kept, and the reason is reported; exit status is 0 and no `userdel`/`sysadminctl` error appears
- Step 4: only processes running from `<dir>` are listed; the other installation's agent is not
- No process is ever stopped by the installer itself
- Processes that merely mention `<dir>` (an editor, `tail -f` on a log, the installer's own `--dir` argument) are not reported as a running agent

---

## OS-specific verification

Linux — systemd
- Unit at `/etc/systemd/system/flowfuse-device-agent-<port>.service`
- `ExecStart` contains `--dir <dir>` and `--port <port>`; `Restart=on-failure`
- Commands:
```bash
sudo systemctl status flowfuse-device-agent-<port>
sudo systemctl restart flowfuse-device-agent-<port>
sudo journalctl -u flowfuse-device-agent-<port> -e
```

Linux — SysVinit
- Script at `/etc/init.d/flowfuse-device-agent-<port>` with `DAEMON_ARGS="--dir <dir> --port <port>"`
```bash
sudo service flowfuse-device-agent-<port> status
```

Linux — OpenRC
- Script at `/etc/init.d/flowfuse-device-agent-<port>`; `command` includes `--dir` and `--port`
```bash
sudo rc-service flowfuse-device-agent-<port> status
```

macOS — launchd
- Plist at `/Library/LaunchDaemons/com.flowfuse.device-agent-<port>.plist`
- ProgramArguments include `--dir` and `--port`; `KeepAlive` true
```bash
sudo launchctl print system/com.flowfuse.device-agent-<port>
sudo launchctl kickstart -k system/com.flowfuse.device-agent-<port>
```

Windows — NSSM
- Service `flowfuse-device-agent-<port>`
- `AppParameters` shows `--dir <dir> --port <port>`; DisplayName `FlowFuse Device Agent (<port>)`
```powershell
sc.exe query flowfuse-device-agent-<port>
nssm get flowfuse-device-agent-<port> AppParameters
```

---

## Listening port verification
- Linux: `sudo ss -lntp | grep :<port>` or `sudo lsof -iTCP -sTCP:LISTEN | grep <port>`
- macOS: `sudo lsof -iTCP -sTCP:LISTEN | grep <port>`
- Windows (PowerShell): `Get-NetTCPConnection -LocalPort <port> -State Listen`

## Clean-up checklist
- Stop/uninstall services created during tests
- Remove test directories under `--dir`
- Restore environment where needed
