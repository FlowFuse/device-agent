# FlowFuse Device Agent Installer

A Go-based installer for the FlowFuse Device Agent that automatically sets up Node.js, installs the device agent package, and configures it as a system service.

{{toc}}

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
| `--otc` | `-o` | *required* | FlowFuse one time code for authentication (required) |
| `--url` | `-u` | `https://app.flowfuse.com` | FlowFuse URL |
| `--nodejs-version` | `-n` | `20.19.1` | Node.js version to install (minimum) |
| `--agent-version` | `-a` | `latest` | Device agent version to install/update to |
| `--service-user` | `-s` | `flowfuse` | Username for the service account (linux/macos)|
| `--uninstall` | | `false` | Uninstall the device agent |
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
./flowfuse-device-agent-installer --otc ONE_TIME_CODE --url https://your-flowfuse-instance.com --node 18.20.0

# Enable debug logging
./flowfuse-device-agent-installer --otc ONE_TIME_CODE --debug

# Uninstall the device agent
./flowfuse-device-agent-installer --uninstall

# See help for all options
./flowfuse-device-agent-installer --help
```


### Troubleshooting

### Managing FlowFuse Device Agent service

#### Linux (systemd)

```bash
# Start the service
sudo systemctl start flowfuse-device-agent
# Stop the service
sudo systemctl stop flowfuse-device-agent
# Restart the service
sudo systemctl restart flowfuse-device-agent
# Check service status
sudo systemctl status flowfuse-device-agent
```

#### Linux (SysVinit)

```bash
# Start the service
sudo service flowfuse-device-agent start
# Stop the service
sudo service flowfuse-device-agent stop
# Restart the service
sudo service flowfuse-device-agent restart
# Check service status
sudo service flowfuse-device-agent status
```

#### Linux (OpenRC)

```bash
# Start the service 
sudo rc-service flowfuse-device-agent start
# Stop the service
sudo rc-service flowfuse-device-agent stop
# Restart the service
sudo rc-service flowfuse-device-agent restart
# Check service status
sudo rc-service flowfuse-device-agent status
```

#### macOS (launchd)

```bash
# Start the service
sudo launchctl start com.flowfuse.device-agent
# Stop the service
sudo launchctl stop com.flowfuse.device-agent
# Restart the service
sudo launchctl kickstart -k system/com.flowfuse.device-agent
# Check service status
sudo launchctl print system/com.flowfuse.device-agent
```

#### Windows (Service Control)

```bash
# Start the service
sc.exe start flowfuse-device-agent
# Stop the service
sc.exe stop flowfuse-device-agent
# Restart the service
sc.exe restart flowfuse-device-agent
# Check service status
sc.exe query flowfuse-device-agent
```

### Updating components

#### Node.js
To update Node.js, you can specify the `--update-nodejs` flag with the desired version:

```bash
./flowfuse-device-agent-installer --update-nodejs --nodejs-version 20.19.1
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
  - **Linux(systemd)**: `journalctl -u flowfuse-device-agent`
- **Windows**: `C:\opt\flowfuse-device\logs\flowfuse-device-agent.log`

## Development

### Prerequisites

- Go 1.21 or later ([Install Go](https://go.dev/doc/install))
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

This project uses [Conventional Commits](https://www.conventionalcommits.org/) 
with Angular preset for automated versioning and releases. 
**All commits that affect the installer must use the `installer` scope** to be included in releases.

#### Commit Message Structure

```
<type>(installer): <description>

[optional body]

[optional footer(s)]
```

#### Supported Types and Release Impact

| Type | Description | Release Impact |
|------|-------------|----------------|
| `feat(installer)` | New feature | Minor version bump |
| `fix(installer)` | Bug fix | Patch version bump |
| `perf(installer)` | Performance improvement | Patch version bump |
| `refactor(installer)` | Code refactoring | Patch version bump |
| `chore(installer)` | Maintenance tasks | Patch version bump |
| `docs(installer)` | Documentation changes | Patch version bump |
| `style(installer)` | Code style changes | Patch version bump |
| `test(installer)` | Test changes | Patch version bump |

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

**Important:** Commits without the `installer` scope will not trigger releases or appear in the changelog.

## Release Process

> [!IMPORTANT]
> A release of the Device Agent does not requre a release of the Device Agent Installer. 
> 
> The Device Agent Installer release is not coupled in any way with the Device Agent one.

To release a new version of the FlowFuse Device Agent Installer, follow these steps:
1. Ensure all changes are committed and follow the commit message format outlined above.
2. Manually trigger the [Installer Release](https://github.com/FlowFuse/device-agent/actions/workflows/installer-release.yaml) workflow 
3. The worflow will:
* Build the installer for all platforms
* Create a new release on GitHub with the changelog
* Upload the built binaries to the release assets
* Updates the `get.sh` and `get.ps1` scripts with the version tag
