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
1) Run with no flags and accept installation in interactive prompt
2) Choose to provide config now (manual) or skip (install-only)

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
