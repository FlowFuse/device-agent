# FlowFuse Device Agent Installer Script for Windows
# This script downloads the appropriate binary
# from the FlowFuse Device Agent releases page on GitHub.

# Set error action preference to stop on errors
$ErrorActionPreference = "Stop"

# Set installation directory to current working directory
$InstallDir = (Get-Location).Path

# GitHub repository information
$REPO_OWNER = "FlowFuse"
$REPO_NAME = "device-agent"
$RELEASE = "0.1.0"
$RELEASE_TAG = "installer-v0.1.0"
$BINARY_PREFIX = "flowfuse-device-installer"

# Function to detect CPU architecture
function Get-WindowsArchitecture {
    $arch = $env:PROCESSOR_ARCHITECTURE
    
    if ($arch -ne "AMD64") {
        Write-Error "Unsupported architecture: $arch. This installer only supports AMD64 (x64) architecture."
        exit 1
    }
    
    return "amd64"
}

# Function to get the download URL for the binary
function Get-DownloadUrl {
    param(
        [string]$Architecture
    )
    
    $binaryName = "${BINARY_PREFIX}-${RELEASE}-windows-${Architecture}.exe"
    return "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${RELEASE_TAG}/${binaryName}"
}

# Function to download file
function Download-File {
    param(
        [string]$Url,
        [string]$OutputPath
    )
    
    try {
        # Use Invoke-WebRequest with progress indicator
        $ProgressPreference = 'Continue'
        Invoke-WebRequest -Uri $Url -OutFile $OutputPath -UseBasicParsing
        
        return $true
    }
    catch {
        Write-Error "Failed to download file: $_.Exception.Message"
        return $false
    }
}

# Main function
function Download-Installer {
    # Detect CPU architecture
    $architecture = Get-WindowsArchitecture
    
    # Construct binary name and download URL
    $binaryName = "${BINARY_PREFIX}-${RELEASE}-windows-${architecture}.exe"
    $downloadUrl = Get-DownloadUrl -Architecture $architecture
    
    # Create temporary file for download
    $tempFile = [System.IO.Path]::GetTempFileName()
    $tempFileWithExt = "${tempFile}.exe"
    
    try {
        # Download the binary
        if (-not (Download-File -Url $downloadUrl -OutputPath $tempFileWithExt)) {
            Write-Error "Failed to download $binaryName from $downloadUrl"
            exit 1
        }
        
        # Determine installation directory
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        
        # Install the binary
        $finalBinaryName = "flowfuse-device-agent-installer.exe"
        $finalPath = Join-Path -Path $InstallDir -ChildPath $finalBinaryName
        
        Copy-Item -Path $tempFileWithExt -Destination $finalPath -Force
        
    }
    catch {
        Write-Error "Download failed: $_.Exception.Message"
        exit 1
    }
    finally {
        # Cleanup temporary files
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $tempFileWithExt) {
            Remove-Item $tempFileWithExt -Force -ErrorAction SilentlyContinue
        }
    }
}

# Run the main function
try {
    Download-Installer
}
catch {
    Write-Error "Script execution failed: $_.Exception.Message"
    exit 1
}
