# FlowFuse Device Agent Installer

This directory contains the Go-based installer for the FlowFuse Device Agent.

## Building

To build the installer locally:

```bash
# Navigate to the installer directory
cd installer/go

# Execute build script
./build.sh
```

This will create a set of binaries for each supported operating system and architecture, and store them in the `build` directory.

## Usage

For usage instructions, run:

```bash
./flowfuse-device-installer --help
```

> [!TIP]
> Ensure the binary is executable. 
> Give it a proper permissions by running `chmod +x flowfuse-device-installer`.

## Development
To develop the installer, you will need to have Go installed on your system. You can find instructions for installing Go on the [official Go website](https://golang.org/doc/install).
To run the installer locally:

```bash
go run main.go
```

## Uninstalling
To uninstall the FlowFuse Device Agent, you can use the `uninstall` flag:

```bash
go run main.go --uninstall
```
This will result in removing the Flowfuse Device Agent and all related files from your system.
