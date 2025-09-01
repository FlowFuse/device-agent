package nodejs

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/config"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// NodeDir is the directory where Node.js files will be stored
const NodeDir = "node"

var nodeBaseDir string
var nodeBinPath string
var npmBinPath string

// EnsureNodeJs validates and ensures that the specified Node.js version is installed.
// It checks if the version string is in a valid semver format and whether the specified
// Node.js version is already installed. If not, it installs the required version.
//
// Parameters:
//   - versionStr: The Node.js version to ensure (in semver format, e.g., "20.19.0")
//   - baseDir: The base directory where Node.js should be installed or located
//
// Returns:
//   - error: nil if Node.js is already installed or successfully installed, otherwise an error
func EnsureNodeJs(versionStr, baseDir string, update bool) error {
	// Validate that the version string is in semver format (x.y.z)
	parts := strings.Split(versionStr, ".")
	if len(parts) < 1 {
		logger.Error("Invalid Node.js version format: %s", versionStr)
		return fmt.Errorf("invalid Node.js version format: %s, expected semver format like 20.19.0", versionStr)
	}

	setNodeDirectories(baseDir)

	if isNodeInstalled(versionStr, baseDir) {
		logger.Info("Node.js version %s found.", versionStr)
		return nil
	}

	return installNodeJs(versionStr, update)
}

// isNodeInstalled checks if Node.js is installed with a specific version.
// It verifies if the node binary exists at the expected path and compares
// the installed version with the specified version string.
//
// Parameters:
//   - versionStr: The version string to compare against (format: "x.y.z").
//
// Returns:
//   - bool: true if Node.js is installed and the installed version matches
//     or is compatible with the specified version, false otherwise.
func isNodeInstalled(versionStr, baseDir string) bool {
	logger.LogFunctionEntry("isNodeInstalled", map[string]interface{}{
		"versionStr": versionStr,
	})

	if output, err := getInstalledNodeVersion(baseDir); err != nil {
		logger.Debug("Failed to get installed Node.js version: %v", err)
	} else {
		installedVersionStr := strings.TrimSpace(string(output))
		if len(installedVersionStr) > 1 {
			if installedVersionStr == versionStr {
				logger.LogFunctionExit("isNodeInstalled", "installed", nil)
				return true
			} else {
				logger.Debug("Installed Node.js version %s does not match required version %s", installedVersionStr, versionStr)
			}
		}
	}
	logger.LogFunctionExit("isNodeInstalled", "not_installed", nil)
	return false
}

// setNodeDirectories configures the Node.js and NPM executable paths based on the provided base directory.
// It sets global path variables for the Node.js installation directory, the Node.js executable,
// and the NPM executable, with appropriate file extensions based on the operating system.
// It also logs the configured paths at debug level.
//
// Parameters:
//   - basedir: The base directory where Node.js is or will be installed.
func setNodeDirectories(basedir string) {
	logger.LogFunctionEntry("setNodeDirectories", map[string]interface{}{
		"basedir": basedir,
	})
	
	nodeBaseDir = filepath.Join(basedir, NodeDir)
	if runtime.GOOS == "windows" {
		nodeBinPath = filepath.Join(nodeBaseDir, "node.exe")
		npmBinPath = filepath.Join(nodeBaseDir, "npm.cmd")
	} else {
		nodeBinPath = filepath.Join(nodeBaseDir, "bin", "node")
		npmBinPath = filepath.Join(nodeBaseDir, "bin", "npm")
	}
	logger.LogFunctionExit("setNodeDirectories", map[string]interface{}{
		"node.js base dir": nodeBaseDir,
		"Node.js path": nodeBinPath,
		"NPM path": npmBinPath,
	}, nil)
}

// GetNodePath returns the path to the Node.js binary.
// The path is stored in the global variable nodeBinPath, which is set during initialization.
// This function is used to access the Node.js binary location across the application.
func GetNodePath() string {
	return nodeBinPath
}

// GetNpmPath returns the path to the npm binary.
// The path is determined during initialization and stored in npmBinPath.
func GetNpmPath() string {
	return npmBinPath
}

// GetNodeBinDir returns the path to the Node.js binary directory.
// This is calculated by joining the Node.js base directory with "bin".
func GetNodeBinDir() string {
	if runtime.GOOS == "windows" {
		return nodeBaseDir
	} else {
		return filepath.Join(nodeBaseDir, "bin")
	}
}

// GetInstalledNodeVersion retrieves the currently installed Node.js version
// from the installer configuration file
//
// Returns:
//   - string: The installed Node.js version (without 'v' prefix)
//   - error: An error if Node.js is not found or version cannot be determined
func getInstalledNodeVersion(baseDir string) (string, error) {
	logger.Debug("Loading configuration...")
	savedNodejsVersion := ""
	cfg, err := config.LoadConfig(baseDir)
	if err != nil {
		logger.Error("Could not load configuration: %v", err)
		return "", fmt.Errorf("could not load configuration: %w", err)
	} else {
		savedNodejsVersion = cfg.NodeVersion
		logger.Debug("Node.js version retrieved from config: %s", savedNodejsVersion)
	}

	return savedNodejsVersion, nil
}

// installNodeJs installs the specified version of Node.js.
// It creates the necessary installation directory with appropriate permissions,
// downloads the Node.js binary from the official source, and extracts it.
// On Linux and MacOS, it uses sudo to create the installation directory and set permissions.
//
// Parameters:
//   - version: The Node.js version to install (e.g., "16.14.2")
//
// Returns:
//   - error: An error if any step of the installation process fails
func installNodeJs(version string, update bool) error {
	if update {
		logger.Info("Updating Node.js to version %s...", version)
	} else {
		logger.Info("Installing Node.js %s...", version)
	}

	// Create the installation directory
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		logger.Debug("Creating directory %s (requires sudo)...", nodeBaseDir)
		mkdirCmd := exec.Command("sudo", "mkdir", "-p", nodeBaseDir)
		if output, err := mkdirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to create Node.js installation directory: %w\nOutput: %s", err, output)
		}

		chmodCmd := exec.Command("sudo", "chmod", "755", nodeBaseDir)
		if output, err := chmodCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory permissions: %w\nOutput: %s", err, output)
		}

		chownCmd := exec.Command("sudo", "chown", utils.ServiceUsername, nodeBaseDir)
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}
	} else {
		if err := os.MkdirAll(nodeBaseDir, 0755); err != nil {
			return fmt.Errorf("failed to create Node.js installation directory: %w", err)
		}
	}

	downloadURL, err := getNodeDownloadURL(version)
	if err != nil {
		return err
	}

	return downloadAndExtractNode(downloadURL, version)
}

// getNodeDownloadURL constructs the download URL for NodeJS based on the specified version
// and the current system's architecture and operating system.
//
// The function supports the following architectures:
// - amd64 (mapped to x64)
// - 386 (mapped to x86)
// - arm64
// - arm (mapped to armv7l)
//
// Currently, only the Linux operating system is supported.
//
// Parameters:
//   - version: The NodeJS version string (without the 'v' prefix)
//
// Returns:
//   - A string containing the complete URL to download the appropriate NodeJS tarball
//   - An error if the current architecture or operating system is unsupported
func getNodeDownloadURL(version string) (string, error) {
	var baseUrl string
	var arch string
	switch runtime.GOARCH {
	case "amd64":
		arch = "x64"
	case "386":
		arch = "x86"
	case "arm64":
		arch = "arm64"
	case "arm":
		arch = "armv7l"
	default:
		return "", fmt.Errorf("unsupported architecture: %s", runtime.GOARCH)
	}

	if utils.UseOfficialNodejs() {
		baseUrl = fmt.Sprintf("https://nodejs.org/dist/v%s", version)
	} else {
		baseUrl = fmt.Sprintf("https://unofficial-builds.nodejs.org/download/release/v%s", version)
	}

	switch runtime.GOOS {
	case "linux":
		if utils.IsAlpine() {
			arch += "-musl"
		}
		return fmt.Sprintf("%s/node-v%s-linux-%s.tar.gz", baseUrl, version, arch), nil
	case "windows":
		return fmt.Sprintf("%s/node-v%s-win-%s.zip", baseUrl, version, arch), nil
	case "darwin":
		return fmt.Sprintf("%s/node-v%s-darwin-%s.tar.gz", baseUrl, version, arch), nil
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// downloadAndExtractNode downloads Node.js from the specified URL and extracts it to the
// appropriate location on the filesystem.
//
// It creates a temporary file, downloads the Node.js archive from the provided URL,
// and extracts it based on the archive format (currently only supports .tar.gz).
// On Linux systems, it also sets appropriate ownership and permissions for the
// Node.js executable files and directories.
//
// Parameters:
//   - url: The URL to download Node.js archive from
//   - version: The version of Node.js being installed (used for extraction)
//
// Returns:
//   - error: An error if any step of the download, extraction or permission setting fails
func downloadAndExtractNode(url, version string) error {
	logger.Debug("Downloading Node.js from %s", url)

	// Create a temporary file for the download
	tempFile, err := os.CreateTemp("", "nodejs-download")
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	// Download the file
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to download Node.js: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download Node.js: HTTP status %d", resp.StatusCode)
	}

	_, err = io.Copy(tempFile, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save Node.js download: %w", err)
	}

	// Close the file before extraction
	tempFile.Close()

	logger.Debug("Extracting Node.js...")

	// Extract based on file type
	if strings.HasSuffix(url, ".tar.gz") {
		err = utils.ExtractTarGz(tempFile.Name(), nodeBaseDir, version)
	} else if strings.HasSuffix(url, ".zip") {
		err = utils.ExtractZip(tempFile.Name(), nodeBaseDir, version)
	} else {
		err = fmt.Errorf("unsupported archive format")
	}

	if err != nil {
		return fmt.Errorf("failed to extract Node.js: %w", err)
	}

	// Set the correct permissions for executable files
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		logger.Debug("Setting execute permissions for Node.js binaries...")

		chownCmd := exec.Command("sudo", "chown", "-R", utils.ServiceUsername, nodeBaseDir)
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		nodeBinCmd := exec.Command("sudo", "chmod", "755", nodeBinPath)
		if output, err := nodeBinCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set permissions for node executable: %w\nOutput: %s", err, output)
		}

		npmBinCmd := exec.Command("sudo", "chmod", "755", npmBinPath)
		if output, err := npmBinCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set permissions for npm executable: %w\nOutput: %s", err, output)
		}

		binDirCmd := exec.Command("sudo", "chmod", "-R", "755", filepath.Join(nodeBaseDir, "bin"))
		if output, err := binDirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set permissions for bin directory: %w\nOutput: %s", err, output)
		}
	} else {
		if err := os.Chmod(nodeBinPath, 0755); err != nil {
			return fmt.Errorf("failed to set permissions for node executable: %w", err)
		}
		if err := os.Chmod(npmBinPath, 0755); err != nil {
			return fmt.Errorf("failed to set permissions for npm executable: %w", err)
		}
	}

	return nil
}

// isNodeUpdateRequired checks if the requested Node.js version is already installed
// It retrieves the installed version and compares it with the version asked for update.
//
// Parameters:
//   - nodeVersion: The required Node.js version to check against (format: "x.y.z")
//   - workDir: The working directory where Node.js is installed
//
// Returns:
//   - bool: true if an update is required, false if the installed version is sufficient
//   - error: An error if the version cannot be determined or compared
func IsNodeUpdateRequired(nodeVersion, workDir string) (bool, error) {

	currentVersion, err := getInstalledNodeVersion(workDir)
	if err != nil {
		logger.Debug("Could not get installed Node.js version, assuming update is needed: %v", err)
		return true, nil // Can't determine version, assume update needed
	}

	if currentVersion == nodeVersion {
		return false, nil
	}

	return true, nil
}

// UpdateNodeJs updates the Node.js installation to the specified version.
//
// Parameters:
//   - nodeVersion: The required Node.js version
//   - workDir: The working directory where Node.js should be installed
//
// Returns:
//   - error: An error object if the update fails, nil otherwise
func UpdateNodeJs(nodeVersion, workDir string) error {
	setNodeDirectories(workDir)

	// Check if Node.js is installed in the expected location
	if _, err := os.Stat(nodeBaseDir); os.IsNotExist(err) {
		logger.Error("Node.js not found, please install it first")
		return fmt.Errorf("node.js not found in %s directory", nodeBaseDir)
	}

	logger.Debug("Node.js directory found at %s, checking version...", nodeBaseDir)

	// Update Node.js by removing old installation and installing new version
	logger.Debug("Removing existing Node.js installation...")
	if err := utils.RemoveDirectory(nodeBaseDir); err != nil {
		return fmt.Errorf("failed to remove existing Node.js directory: %w", err)
	}

	if err := EnsureNodeJs(nodeVersion, workDir, true); err != nil {
		logger.Error("Failed to install Node.js %s: %v", nodeVersion, err)
		return fmt.Errorf("failed to install Node.js %s: %w", nodeVersion, err)
	}

	logger.Info("Node.js successfully updated to version %s", nodeVersion)
	return nil
}
