package nodejs

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

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
func EnsureNodeJs(versionStr string, baseDir string) error {
	// Validate that the version string is in semver format (x.y.z)
	parts := strings.Split(versionStr, ".")
	if len(parts) < 1 {
		logger.Error("Invalid Node.js version format: %s", versionStr)
		return fmt.Errorf("invalid Node.js version format: %s, expected semver format like 20.19.0", versionStr)
	}

	setNodeDirectories(baseDir)

	if isNodeInstalled(versionStr) {
		logger.Info("Node.js version %s found.", versionStr)
		return nil
	}

	return installNodeJs(versionStr)
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
func isNodeInstalled(versionStr string) bool {
	if _, err := os.Stat(nodeBinPath); os.IsNotExist(err) {
		return false
	}

	cmd := exec.Command(nodeBinPath, "-v")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false
	}

	installedVersionStr := strings.TrimSpace(string(output))
	if len(installedVersionStr) > 1 && installedVersionStr[0] == 'v' {
		installedVersionStr = installedVersionStr[1:]
		return compareVersions(installedVersionStr, versionStr)
	}

	return false
}


// compareVersions checks if the installed version is greater than or equal to the requested version.
// It performs a semantic versioning comparison by splitting the version strings into major, minor, and patch components.
// The function compares each component in order of significance (major, then minor, then patch).
// If the installed version is greater than or equal to the requested version at any level, it returns true.
// If the comparison cannot be made properly (e.g., invalid version format), it returns false.
//
// Parameters:
//   - installed: A string representing the currently installed version (e.g., "16.14.0")
//   - requested: A string representing the minimum required version (e.g., "14.0.0")
//
// Returns:
//   - bool: true if the installed version meets or exceeds the requested version, false otherwise
func compareVersions(installed, requested string) bool {
	installedParts := strings.Split(installed, ".")
	requestedParts := strings.Split(requested, ".")

	// Compare major version first
	if len(installedParts) > 0 && len(requestedParts) > 0 {
		installedMajor, _ := strconv.Atoi(installedParts[0])
		requestedMajor, _ := strconv.Atoi(requestedParts[0])

		if installedMajor > requestedMajor {
			return true
		} else if installedMajor < requestedMajor {
			return false
		}

		// If major versions are equal, compare minor versions
		if len(installedParts) > 1 && len(requestedParts) > 1 {
			installedMinor, _ := strconv.Atoi(installedParts[1])
			requestedMinor, _ := strconv.Atoi(requestedParts[1])

			if installedMinor > requestedMinor {
				return true
			} else if installedMinor < requestedMinor {
				return false
			}

			// If minor versions are equal, compare patch versions
			if len(installedParts) > 2 && len(requestedParts) > 2 {
				installedPatch, _ := strconv.Atoi(installedParts[2])
				requestedPatch, _ := strconv.Atoi(requestedParts[2])

				return installedPatch >= requestedPatch
			}
		}
	}

	// If we can't properly compare versions, be conservative and return false
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
	nodeBaseDir = filepath.Join(basedir, NodeDir)
	if runtime.GOOS == "windows" {
		nodeBinPath = filepath.Join(nodeBaseDir, "bin", "node.exe")
		npmBinPath = filepath.Join(nodeBaseDir, "bin", "npm.cmd")
	} else {
		nodeBinPath = filepath.Join(nodeBaseDir, "bin", "node")
		npmBinPath = filepath.Join(nodeBaseDir, "bin", "npm")
	}
	logger.Debug("Node.js base dir: %s", nodeBaseDir)
	logger.Debug("Node.js path: %s", nodeBinPath)
	logger.Debug("NPM path: %s", npmBinPath)
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
	return filepath.Join(nodeBaseDir, "bin")
}

// setEnvPath modifies the system PATH environment variable to include the Node.js binary directory
// at the beginning. This ensures that the installed Node.js binaries are found first when executing
// Node.js commands. It returns the new PATH value as a formatted string.
// If setting the environment variable fails, the function returns error.
func setEnvPath() (string, error) {
	nodeBinDir := GetNodeBinDir()
	pathEnv := os.Getenv("PATH")
	newPath := fmt.Sprintf("PATH=%s%c%s", nodeBinDir, os.PathListSeparator, pathEnv)
	if err := os.Setenv("PATH", newPath); err != nil {
		logger.Debug("Failed to set PATH environment variable: %v", err)
		return "", fmt.Errorf("failed to set PATH environment variable: %w", err)
	}
	return newPath, nil
}

// installNodeJs installs the specified version of Node.js.
// It creates the necessary installation directory with appropriate permissions,
// downloads the Node.js binary from the official source, and extracts it.
// On Linux, it uses sudo to create the installation directory and set permissions.
//
// Parameters:
//   - version: The Node.js version to install (e.g., "16.14.2")
//
// Returns:
//   - error: An error if any step of the installation process fails
func installNodeJs(version string) error {
	logger.Info("Installing Node.js %s...", version)

	// Create the installation directory
	if runtime.GOOS == "linux" {
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

	baseURL := fmt.Sprintf("https://nodejs.org/dist/v%s", version)

	switch runtime.GOOS {
	case "linux":
		return fmt.Sprintf("%s/node-v%s-linux-%s.tar.gz", baseURL, version, arch), nil
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
		err = extractTarGz(tempFile.Name(), nodeBaseDir, version)
	} else {
		err = fmt.Errorf("unsupported archive format")
	}

	if err != nil {
		return fmt.Errorf("failed to extract Node.js: %w", err)
	}

	// Set the correct permissions for executable files
	if runtime.GOOS == "linux" {
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
	}

	logger.Info("Node.js installed successfully!")
	return nil
}

// extractTarGz extracts a Node.js tar.gz archive to the specified destination directory.
//
// This function handles the extraction of a Node.js tar.gz archive and manages the necessary permissions.
// On Linux, it first extracts the archive to a temporary directory and then uses sudo to move the files
// to the destination directory with proper ownership and permissions.
//
// Parameters:
//   - tarGzFile: Path to the Node.js tar.gz archive file.
//   - destDir: Destination directory where the contents should be extracted.
//   - version: Node.js version string used to identify the root directory in the archive.
//
// Returns:
//   - error: If any step in the extraction process fails, an error is returned with details.
//
// Notes:
//   - Currently only supports Linux platforms.
//   - Requires sudo privileges to set proper ownership and permissions.
//   - Handles directory creation, file extraction, symbolic links, and permission setting.
func extractTarGz(tarGzFile, destDir, version string) error {
	file, err := os.Open(tarGzFile)
	if err != nil {
		return err
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)

	// Get the root directory name in the archive
	var archSuffix string
	var rootDir string
	if runtime.GOOS == "linux" { 
		if runtime.GOARCH == "amd64" {
			archSuffix = "x64"
		} else if runtime.GOARCH == "386" {
			archSuffix = "x86"
		} else {
			archSuffix = runtime.GOARCH
		}
		rootDir = fmt.Sprintf("node-v%s-linux-%s", version, archSuffix)
	}

	if runtime.GOOS == "linux" {
		// Create a temporary directory
		tempExtractDir, err := os.MkdirTemp("", "nodejs-extract-")
		if err != nil {
			return fmt.Errorf("failed to create temporary extraction directory: %w", err)
		}
		defer os.RemoveAll(tempExtractDir)

		// First, extract to a temporary directory that doesn't require elevated privileges
		for {
			header, err := tarReader.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return err
			}

			// Skip if it's the root directory
			if header.Name == rootDir || header.Name == rootDir+"/" {
				continue
			}

			// Remove root directory from path
			relPath := strings.TrimPrefix(header.Name, rootDir)
			relPath = strings.TrimPrefix(relPath, "/")

			if relPath == "" {
				continue
			}

			tempPath := filepath.Join(tempExtractDir, relPath)

			switch header.Typeflag {
			case tar.TypeDir:
				if err := os.MkdirAll(tempPath, 0755); err != nil {
					return err
				}
			case tar.TypeReg:
				if err := os.MkdirAll(filepath.Dir(tempPath), 0755); err != nil {
					return err
				}

				outFile, err := os.Create(tempPath)
				if err != nil {
					return err
				}

				if _, err := io.Copy(outFile, tarReader); err != nil {
					outFile.Close()
					return err
				}
				outFile.Close()

				if err := os.Chmod(tempPath, os.FileMode(header.Mode)); err != nil {
					return err
				}
			case tar.TypeSymlink:
				if err := os.Symlink(header.Linkname, tempPath); err != nil {
					return err
				}
			}
		}

		// Copy the content from temp dir to the destination using sudo
		logger.Debug("Moving extracted files to %s (requires sudo)...", destDir)

		// Ensure the destination directory exists with proper permissions
		mkdirCmd := exec.Command("sudo", "mkdir", "-p", destDir)
		if output, err := mkdirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to create destination directory: %w\nOutput: %s", err, output)
		}

		// Copy the extracted files from temp dir to destination
		cpCmd := exec.Command("sudo", "cp", "-a", tempExtractDir+"/.", destDir)
		if output, err := cpCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to copy extracted files: %w\nOutput: %s", err, output)
		}

		// Set ownership of all files to the service user
		chownCmd := exec.Command("sudo", "chown", "-R", utils.ServiceUsername+":"+utils.ServiceUsername, destDir)
		chmodCmd := exec.Command("sudo", "chmod", "755", destDir)
		if output, err := chmodCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory permissions: %w\nOutput: %s", err, output)
		}
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		return nil
	}

	return nil
}
