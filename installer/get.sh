#!/usr/bin/env bash

# FlowFuse Device Agent Installer Script
# This script detects the OS and architecture, then downloads the appropriate binary
# from the FlowFuse Device Agent releases page on GitHub.

set -e

# GitHub repository information
REPO_OWNER="FlowFuse"
REPO_NAME="device-agent"
RELEASE="0.1.0"
RELEASE_TAG="installer-v0.1.0"
BINARY_PREFIX="flowfuse-device-installer"

# Function to detect operating system
detect_os() {
    local os
    case "$(uname -s)" in
        Linux*)
            os="linux"
            ;;
        Darwin*)
            os="darwin"
            ;;
        *)
            echo "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
    echo "$os"
}

# Function to detect CPU architecture
detect_arch() {
    local arch
    case "$(uname -m)" in
        x86_64 | amd64)
            arch="amd64"
            ;;
        aarch64 | arm64)
            arch="arm64"
            ;;
        armv7l | armv6l | arm)
            arch="arm"
            ;;
        *)
            echo "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac
    echo "$arch"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to download file
download_file() {
    local url="$1"
    local output="$2"
    
    if command_exists curl; then
        curl -L -o "$output" "$url"
    elif command_exists wget; then
        wget -O "$output" "$url"
    else
        exit 1
    fi
}

# Function to get the download URL for the binary
get_download_url() {
    local os="$1"
    local arch="$2"
    local binary_name="${BINARY_PREFIX}-${RELEASE}-${os}-${arch}"
    
    echo "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${RELEASE_TAG}/${binary_name}"
}

# Main installation function
main() {
    # Detect operating system and architecture
    local os
    local arch
    local binary_name
    local download_url
    local install_dir
    local temp_file
    
    os=$(detect_os)
    arch=$(detect_arch)
    
    # Construct binary name and download URL
    binary_name="${BINARY_PREFIX}-${RELEASE}-${os}-${arch}"
    download_url=$(get_download_url "$os" "$arch")
    
    # Create temporary file for download
    temp_file=$(mktemp)
    trap 'rm -f "$temp_file"' EXIT
    
    # Download the binary
    if ! download_file "$download_url" "$temp_file"; then
        echo "Failed to download $binary_name from $download_url"
        exit 1
    fi
    
    # Verify the download
    if [ ! -s "$temp_file" ]; then
        exit 1
    fi
    
    # Determine installation directory - use current directory
    install_dir="$(pwd)"
    
    # Install the binary
    local final_binary_name="flowfuse-device-agent-installer-${RELEASE}"
    local final_path="$install_dir/$final_binary_name"
    
    # Copy and set permissions
    if ! cp "$temp_file" "$final_path"; then
        echo "Failed to copy $temp_file to $final_path"
        exit 1
    fi
    
    # Set executable permissions
    chmod +x "$final_path"
}

# Run main function
main