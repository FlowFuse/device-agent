# FlowFuse Device Agent Installer

A Go-based installer for the FlowFuse Device Agent that automatically sets up Node.js, installs the device agent package, and configures it as a system service.

## Getting Started

### Requirements

- Linux, macOS, or Windows
- Internet connection for downloading dependencies
- Administrator/root privileges for system service installation

### Installation

Download the installer binary for your platform and run:

```bash
# Make the binary executable (Linux/macOS)
chmod +x flowfuse-device-agent-installer

# Install with one-time code from FlowFuse
./flowfuse-device-agent-installer --otc YOUR_ONE_TIME_CODE
```

### Available Options

| Flag | Short | Default | Description |
|------|--------|---------|-------------|
| `--otc` | `-o` | *required* | FlowFuse one-time code for authentication |
| `--url` | `-u` | `https://app.flowfuse.com` | FlowFuse instance URL |
| `--node` | `-n` | `20.19.1` | Node.js version to install |
| `--agent` | `-a` | `latest` | Device agent version to install |
| `--service-user` | `-s` | `flowfuse` | Username for the service account (linux/macos)|
| `--debug` | | `false` | Enable debug logging |
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

```
# Start the service
sc.exe start flowfuse-device-agent
# Stop the service
sc.exe stop flowfuse-device-agent
# Restart the service
sc.exe restart flowfuse-device-agent
# Check service status
sc.exe query flowfuse-device-agent
```


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
# Clone and navigate to the installer directory
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

# Or build manually for current platform
go build -o flowfuse-device-agent-installer main.go
```

Binaries will be created in the `out/` directory for Linux (amd64, arm64, arm), macOS, and Windows.

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
