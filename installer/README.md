# FlowFuse Device Agent Installer

A Go-based installer for the FlowFuse Device Agent that automatically sets up Node.js, installs the device agent package, and configures it as a system service.

## Getting Started

### Requirements

- Linux, macOS, or Windows
- Internet connection for downloading dependencies
- Administrator/root privileges for system service installation

### Installation

Download the installer binary for your platform and run:

Linux/MacOS:
```bash
# Make the binary executable (Linux/macOS)
chmod +x flowfuse-device-agent-installer

# Install with one-time code from FlowFuse
./flowfuse-device-agent-installer --otc YOUR_ONE_TIME_CODE
```

Windows (elevated command prompt):
```shell
# Unblock the downloaded file if needed
powershell -c Unblock-File -Path .\flowfuse-device-agent-installer.exe

# Run the installer in PowerShell
.\flowfuse-device-agent-installer.exe --otc YOUR_ONE_TIME_CODE
```

### Available Options

| Flag | Short | Default | Description |
|------|--------|---------|-------------|
| `--otc` | `-o` | *optional* | FlowFuse one time code for authentication (optional for interactive installation) |
| `--url` | `-u` | `https://app.flowfuse.com` | FlowFuse URL |
| `--nodejs-version` | `-n` | `22.23.0` | Node.js version to install (minimum) |
| `--agent-version` | `-a` | `latest` | Device agent version to install/update to |
| `--service-user` | `-s` | `flowfuse` | Username for the service account (linux/macos)|
| `--dir` | `-d` | `/opt/flowfuse-device` (Linux/macOS) or `C:\opt\flowfuse-device` (Windows) | Installation directory for the device agent |
| `--port` | `-p` | `1880` | TCP port for the device agent (1025–65535). Service name is suffixed with the port, e.g., `flowfuse-device-agent-1880`. |
| `--uninstall` | | `false` | Uninstall the device agent |
| `--ca-cert` | | *optional* | Path to a CA certificate bundle (PEM) the Device Agent should trust. Applies to installation phase only. |
| `--update-nodejs` | | `false` | Update bundled Node.js to specified version |
| `--update-agent` | | `false` | Update the Device Agent package to specified version |
| `--debug` | | `false` | Enable debug logging |
| `--version` | `-v` | | Display the installer version |
| `--help` | `-h` | | Display help information |

### Management Commands

```bash
# Minimal usage
./flowfuse-device-agent-installer --otc ONE_TIME_CODE

# Install with custom settings
./flowfuse-device-agent-installer --otc ONE_TIME_CODE --url https://your-flowfuse-instance.com --nodejs-version 22.23.0

# Install in non-default directory and port
./flowfuse-device-agent-installer --otc ONE_TIME_CODE --dir /custom/dir --port 1882

# Enable debug logging
./flowfuse-device-agent-installer --otc ONE_TIME_CODE --debug

# Install with a custom CA certificate bundle
./flowfuse-device-agent-installer --otc ONE_TIME_CODE --ca-cert /path/to/ca-bundle.pem

# Uninstall the device agent
./flowfuse-device-agent-installer --uninstall

# See help for all options
./flowfuse-device-agent-installer --help
```


### Troubleshooting

### Managing FlowFuse Device Agent service

Services are named per-port, e.g., `flowfuse-device-agent-1880`. On macOS, the launchd label is `com.flowfuse.device-agent-1880`.

#### Linux (systemd)

```bash
# Replace <port> with your configured port (default 1880)
sudo systemctl start flowfuse-device-agent-<port>
sudo systemctl stop flowfuse-device-agent-<port>
sudo systemctl restart flowfuse-device-agent-<port>
sudo systemctl status flowfuse-device-agent-<port>
```

#### Linux (SysVinit)

```bash
sudo service flowfuse-device-agent-<port> start
sudo service flowfuse-device-agent-<port> stop
sudo service flowfuse-device-agent-<port> restart
sudo service flowfuse-device-agent-<port> status
```

#### Linux (OpenRC)

```bash
sudo rc-service flowfuse-device-agent-<port> start
sudo rc-service flowfuse-device-agent-<port> stop
sudo rc-service flowfuse-device-agent-<port> restart
sudo rc-service flowfuse-device-agent-<port> status
```

#### macOS (launchd)

```bash
# Replace <port> with your configured port (default 1880)
sudo launchctl start com.flowfuse.device-agent-<port>
sudo launchctl stop com.flowfuse.device-agent-<port>
sudo launchctl kickstart -k system/com.flowfuse.device-agent-<port>
sudo launchctl print system/com.flowfuse.device-agent-<port>
```

#### Windows (Service Control)

```bash
# Replace <port> with your configured port (default 1880)
sc.exe start flowfuse-device-agent-<port>
sc.exe stop flowfuse-device-agent-<port>
sc.exe query flowfuse-device-agent-<port>
```

### Updating components

#### Node.js
To update Node.js, you can specify the `--update-nodejs` flag with the desired version:

```bash
./flowfuse-device-agent-installer --update-nodejs --nodejs-version 22.23.0
```

Specifying `--update-nodejs` flag without a version will pick the default version defined in the installer.

#### Device Agent
To update the Device Agent package, use the `--update-agent` flag, optionally specifying the version:
```bash
./flowfuse-device-agent-installer --update-agent --agent-version 3.3.2
```

Specifying `--update-agent` without a version will update to the latest available version.


### Log Files
- **Linux/macOS**: `/opt/flowfuse-device/logs/flowfuse-device-agent.log`
- **Linux(systemd)**: `journalctl -u 'flowfuse-device-agent-*'`
- **Windows**: `C:\opt\flowfuse-device\logs\flowfuse-device-agent.log`

## Development

### Prerequisites

- Go 1.24 or later ([Install Go](https://go.dev/doc/install))
- Make (optional, for using Makefile commands)

Windows users can install `make` and `sed` (used in Makefile) via [WinGet](https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget):
```
winget install --id=GnuWin32.Make  -e
winget install --id=mbuilov.sed  -e
```

### Development Setup

```bash
# Clone this repo and navigate to the installer directory
git clone git@github.com:FlowFuse/device-agent.git
cd installer/go

# Install dependencies
go mod download

# Run locally
go run main.go --help
```

### Building

```bash
# Build for all platforms
make build
```

Binaries will be created in the `out/` directory for Linux, macOS, and Windows.

### Code Quality

```bash
# Run all quality checks
make check-quality

# Individual commands
make lint    # Run linter
make fmt     # Format code
make vet     # Run go vet
```

### Project Structure

```
├── main.go              # Application entry point
├── cmd/
│   └── install.go       # Installation commands
└── pkg/
    ├── config/          # Configuration file handling
    ├── logger/          # Logging functions
    ├── nodejs/          # Node.js related functions
    ├── service/         # System service functions
    ├── utils/           # Miscellaneous functions
    └── validate/        # Environment validation functions
```

### Cleaning Up

To clean up build artifacts and temporary files, run:

```bash
make clean
```

## Contributing

### Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated
versioning and releases, driven by [Release Please](https://github.com/googleapis/release-please).

The installer is configured as a separate Release Please package rooted at `installer/`, so
**changes are assigned to the installer release by the paths they touch, not by the commit scope**.
Any commit that modifies files under `installer/` is picked up for the installer release; commits
touching other paths are excluded from it and feed the Device Agent release instead.

#### Commit Message Structure

```
<type>[(<scope>)]: <description>

[optional body]

[optional footer(s)]
```

The scope is optional and does not influence the release. Using `installer` as the scope is still
encouraged, as it makes the changelog entries easier to read.

#### Supported Types and Release Impact

| Type | Description | Release Impact |
|------|-------------|----------------|
| `feat` | New feature | Minor version bump |
| `fix` | Bug fix | Patch version bump |
| `perf` | Performance improvement | Patch version bump |
| `deps` | Dependency update | Patch version bump |
| `refactor` | Code refactoring | No release |
| `docs` | Documentation changes | No release |
| `chore` | Maintenance tasks | No release |
| `style` | Code style changes | No release |
| `test` | Test changes | No release |

Types marked as "No release" do not trigger a version bump on their own and are hidden from the
changelog. They are still released along with any `feat`/`fix`/`perf` change present in the same
release.

#### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the commit footer or use `!` after the type/scope:

```
feat(installer)!: remove support for Node.js v16

BREAKING CHANGE: Node.js v16 is no longer supported, minimum version is now v18
```

This will trigger a major version bump.

#### Examples

```bash
# Feature addition (minor release)
feat(installer): add support for custom installation directory

# Bug fix (patch release)
fix(installer): resolve service startup issue on Ubuntu 22.04

# Breaking change (major release)
feat(installer)!: change default service user from root to flowfuse

BREAKING CHANGE: The default service user has changed from root to flowfuse for improved security
```

## Release Process

> [!IMPORTANT]
> A release of the Device Agent does not require a release of the Device Agent Installer.
> 
> The Device Agent Installer release is not coupled in any way with the Device Agent one.

The installer is released by [Release Please](https://github.com/googleapis/release-please), the
same tool used for the Device Agent package. Both are declared in
[`.github/release-please-config.json`](../.github/release-please-config.json) as separate packages
with separate versions, changelogs and release pull requests, tracked in
[`.github/.release-please-manifest.json`](../.github/.release-please-manifest.json).

Installer releases are tagged `installer-v<version>` (e.g. `installer-v1.7.0`), while Device Agent
releases use a plain `v<version>` tag.

### Releasing a new version

1. Merge changes under `installer/` into `main`, using the commit message format described above.
2. The `Prepare release` workflow ([`release-please.yaml`](../.github/workflows/release-please.yaml))
   runs on every push to `main` and opens (or updates) a `chore: Release Installer <version>`
   pull request containing the version bump, the updated `installer/CHANGELOG.md` and the version
   references in `get.sh` and `get.ps1`.
3. Review and merge that pull request when you want to cut the release. Release Please then creates
   the `installer-v<version>` tag and the corresponding GitHub release with the changelog.
4. The tag triggers the `Installer Release` workflow
   ([`release-installer.yaml`](../.github/workflows/release-installer.yaml)), which:
    * builds the installer binaries for all supported platforms and architectures,
    * uploads them as assets of the release created by Release Please,
    * publishes the `get.sh` and `get.ps1` scripts to GitHub Pages.

No manual workflow trigger is required. Merging the release pull request is the only step that
starts a release.
