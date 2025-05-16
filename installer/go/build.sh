#!/usr/bin/env bash

# Script to build the FlowFuse Device Agent Installer for different platforms

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Create output directories
mkdir -p build/{linux,macos,windows}

# Get the version from package.json using grep and sed instead of node
VERSION=$(grep -o '"version": "[^"]*"' ../../package.json | sed 's/"version": "//;s/"//')
echo "Building installers for FlowFuse Device Agent v$VERSION"

# Build Linux (amd64)
echo "Building Linux (amd64) installer..."
GOOS=linux GOARCH=amd64 go build -ldflags "-X main.version=$VERSION" -o build/linux/flowfuse-device-installer-linux-amd64 main.go

# Build Linux (arm64)
echo "Building Linux (arm64) installer..."
GOOS=linux GOARCH=arm64 go build -ldflags "-X main.version=$VERSION" -o build/linux/flowfuse-device-installer-linux-arm64 main.go

# Build Linux (arm) - for Raspberry Pi
echo "Building Linux (arm) installer..."
GOOS=linux GOARCH=arm go build -ldflags "-X main.version=$VERSION" -o build/linux/flowfuse-device-installer-linux-arm main.go

# Build Windows (amd64)
echo "Building Windows (amd64) installer..."
GOOS=windows GOARCH=amd64 go build -ldflags "-X main.version=$VERSION" -o build/windows/flowfuse-device-installer-windows-amd64.exe main.go

echo "All builds completed!"
echo "Installers available in the build/ directory"
