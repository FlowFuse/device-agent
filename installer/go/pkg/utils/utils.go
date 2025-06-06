package utils

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"compress/gzip"
	"path/filepath"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
)

// Global variable to store the service username
var ServiceUsername = "flowfuse"

// CheckPermissions checks if the user who executed the installer has the necessary permissions to operate
// based on the current operating system.
//
// For Unix systems, it delegates to checkUnixPermissions to verify specific Unix permissions.
// For Windows systems, it checks if the user has administrator privileges by executing a command that
// requires elevated permissions.
// For other operating systems, it returns an error indicating the OS is not supported.
//
// Returns:
//   - nil if the application has sufficient permissions
//   - error if permissions are insufficient or the operating system is not supported
func CheckPermissions() error {
	switch runtime.GOOS {
	case "linux", "darwin":
		return checkUnixPermissions()
	case "windows":
		return checkWindowsPermissions()
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// checkUnixPermissions checks if the current user has sudo access without requiring a password.
// It runs 'sudo -nv' command which will succeed if the user has sudo privileges without needing
// to enter a password. If the command fails, it checks if sudo is available on the system at all.
// If sudo is not available, it returns an error; otherwise it just logs informational messages.
//
// Returns:
//   - nil if sudo is available (either with or without password)
//   - error if sudo is not available on the system
func checkUnixPermissions() error {
	cmd := exec.Command("sudo", "-nv")
	err := cmd.Run()

	if err != nil {
		_, err := exec.LookPath("sudo")
		if err != nil {
			return fmt.Errorf("sudo command not found on this system: %w", err)
		}

		logger.Info("This installer requires sudo access for some operations.")
		logger.Info("You will be prompted for your password when needed.")
	}

	return nil
}

// checkWindowsPermissions verifies if the current process is running with administrator privileges on Windows.
// It attempts to execute the "net session" command, which requires elevated privileges to succeed.
// Returns nil if the process has administrator privileges, otherwise returns an error with instructions
// to run as administrator.
func checkWindowsPermissions() error {
	cmd := exec.Command("net", "session")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("this installer requires elevated privileges. Please run as administrator")
	}
	return nil
}

// CreateWorkingDirectory creates and returns the working directory path for the FlowFuse device agent.
// On Unix systems, it creates the directory at "/opt/flowfuse-device" with 0755 permissions.
// On Windows systems, it creates the directory at "c:\opt\flowfuse-device".
// For other operating systems, it returns an error indicating the OS is not supported.
//
// Returns:
//   - string: The path to the created working directory
//   - error: nil if successful, otherwise an error describing what went wrong
func CreateWorkingDirectory() (string, error) {
	var workDir string

	switch runtime.GOOS {
	case "linux", "darwin":
		workDir = "/opt/flowfuse-device"
	case "windows":
		workDir = `c:\opt\flowfuse-device`
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	if err := createDirWithPermissions(workDir, 0755); err != nil {
		return "", err
	}

	return workDir, nil
}

// GetWorkingDirectory returns the default working directory for the FlowFuse device agent based on the operating system.
// 
// Returns:
//   - string: The path to the working directory
//   - error: nil if successful, otherwise an error describing what went wrong
func GetWorkingDirectory() (string, error) {
	switch runtime.GOOS {
	case "linux", "darwin":
		return "/opt/flowfuse-device", nil
	case "windows":
		return `c:\opt\flowfuse-device`, nil
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// createDirWithPermissions creates a directory at the specified path with the given permissions.
// If the directory already exists, no action is taken.
// Before creating directory, it creates a service user with the specified username and password.
// On Linux systems, the function first attempts to create the directory without sudo. If that fails, it tries with sudo. After creation, it sets
// the ownership of the directory to a service user.
// On Windows systems, it creates the directory.
//
// Parameters:
//   - path: The file system path where the directory should be created
//   - permissions: The file mode/permissions to apply to the new directory
//
// Returns:
//   - error: An error if directory creation fails or if running on an unsupported OS
//
// Note: Currently, this function only supports Linux. Other operating systems will return an error.
func createDirWithPermissions(path string, permissions os.FileMode) error {
	serviceUser, err := CreateServiceUser(ServiceUsername)
	if err != nil {
		return fmt.Errorf("failed to create service user: %w", err)
	}
	if runtime.GOOS != "windows" {
		logger.Debug("Service user %s created successfully", serviceUser)
	}

	switch runtime.GOOS {
	case "linux", "darwin":
		if _, err := os.Stat(path); os.IsNotExist(err) {
			// Try to create without sudo first
			logger.Debug("Creating directory %s...", path)
			err := os.MkdirAll(path, permissions)
			if err != nil {
				logger.Debug("Creating directory %s (requires sudo)...", path)
				mkdirCmd := exec.Command("sudo", "mkdir", "-p", path)
				if output, err := mkdirCmd.CombinedOutput(); err != nil {
					return fmt.Errorf("failed to create directory %s: %w\nOutput: %s", path, err, output)
				}
			}
		}

		logger.Debug("Setting ownership of %s to %s...", path, serviceUser)
		chownCmd := exec.Command("sudo", "chown", "-R", serviceUser, path)
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		return nil

	case "windows":
		if err := os.MkdirAll(path, permissions); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", path, err)
		}
		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// CreateServiceUser creates a system user with the given username if it doesn't already exist.
// For Unix systems, it checks if the user exists by calling the "id" command.
// If the user doesn't exist, it creates the user with a home directory and no shell.
// On Linux, it uses "useradd" to create the user.
// On macOS, it uses "sysadminctl" to create the user.
// For Windows systems, we do not create a user.
//
// Parameters:
//   - username: the name of the user to create
//
// Returns:
//   - string: the username of the created or existing service user
//   - error: an error if the user creation failed or if the operating system is not supported
func CreateServiceUser(username string) (string, error) {
	switch runtime.GOOS {
	case "linux":
		checkUserCmd := exec.Command("id", username)
		if err := checkUserCmd.Run(); err == nil {
			logger.Debug("Service user %s already exists", username)
		} else {
			logger.Info("Creating service user %s...", username)
			var createUserCmd *exec.Cmd
			if checkBinaryExists("useradd") {
				createUserCmd = exec.Command("sudo", "useradd", "-m", "-s", "/sbin/nologin", username)
			} else {
				createUserCmd = exec.Command("sudo", "adduser", "-S", "-D", "-H", "-s", "/sbin/nologin", username)
			}
			if output, err := createUserCmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("failed to create user: %w\nOutput: %s", err, output)
			}
		}
		return username, nil

	case "darwin":
		checkUserCmd := exec.Command("id", username)
		if err := checkUserCmd.Run(); err == nil {
			logger.Debug("Service user %s already exists", username)
		} else {
			// Create the user
			logger.Info("Creating service user %s...", username)
			createUserCmd := exec.Command("sudo", "sysadminctl", "-addUser", username, "-shell", "/usr/bin/false")
			if output, err := createUserCmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("failed to create user: %w\nOutput: %s", err, output)
			}
		}

		return username, nil

	case "windows":
		logger.Debug("On Windows, we do not create a service user.")
		return username, nil

	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// RemoveServiceUser deletes the specified service user account from the system.
// On Linux, it executes "userdel -r" with sudo to remove the user and their home directory.
// On macOS, it uses "sysadminctl -deleteUser" to remove the user.
// On Windows, we do not create a service user.
//
// Parameters:
//   - username: the name of the user account to be removed
//
// Returns:
//   - error: nil on success, or an error describing what went wrong
func RemoveServiceUser(username string) error {
	logger.Debug("Removing service user %s...", username)

	switch runtime.GOOS {
	case "linux":
		removeUserCmd := exec.Command("sudo", "userdel", "-r", username)
		if output, err := removeUserCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove user %s: %w\nOutput: %s", username, err, output)
		}
		return nil

	case "darwin":
		removeUserCmd := exec.Command("sudo", "sysadminctl", "-deleteUser", username)
		if output, err := removeUserCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove user %s: %w\nOutput: %s", username, err, output)
		}
		return nil

	case "windows":
		logger.Debug("On Windows, we have not created a service user.")
		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// RemoveWorkingDirectory attempts to remove the content of the specified working directory,
// while preserving the directory itself and any files specified in the preserveFiles parameter.
//
// Parameters:
//   - workDir: The path to the directory whose contents need to be removed
//   - preserveFiles: Optional slice of filenames/directories that should not be removed
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func RemoveWorkingDirectory(workDir string, preserveFiles ...string) error {
	logger.Debug("Removing contents of working directory: %s (preserving %v)", workDir, preserveFiles)

	if _, err := os.Stat(workDir); os.IsNotExist(err) {
		logger.Debug("Directory %s does not exist, nothing to remove", workDir)
		return nil
	}

	dirContent, err := os.ReadDir(workDir)
	if err != nil {
		return fmt.Errorf("failed to read working directory: %w", err)
	}

	// Convert preserveFiles to a map for faster lookups
	preserveMap := make(map[string]bool)
	for _, file := range preserveFiles {
		preserveMap[file] = true
	}

	for _, entry := range dirContent {
		if !preserveMap[entry.Name()] {
			fullPath := filepath.Join(workDir, entry.Name())
			logger.Debug("Removing: %s", fullPath)

			var removeCmd *exec.Cmd
			switch runtime.GOOS {
			case "linux", "darwin":
				removeCmd = exec.Command("sudo", "rm", "-rf", fullPath)
			case "windows":
				if entry.IsDir() {
					removeCmd = exec.Command("cmd", "/C", "rmdir", "/S", "/Q", fullPath)
				} else {
					removeCmd = exec.Command("cmd", "/C", "del", "/q", "/f", fullPath)
				}
			default:
				return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
			}

			if output, err := removeCmd.CombinedOutput(); err != nil {
				return fmt.Errorf("failed to remove %s: %w\nOutput: %s", fullPath, err, output)
			}
		} else {
			logger.Debug("Preserving: %s", entry.Name())
		}
	}
	return nil

}

// extractZip extracts a Node.js zip archive to a destination directory.
//
// Parameters:
//   - zipFile: path to the zip file to extract
//   - destDir: destination directory where files will be extracted
//   - version: Node.js version string (e.g. "16.14.0")
//
// The function handles architecture-specific Node.js archives for Windows,
// correctly mapping the archive's internal directory structure when extracting.
// It preserves file permissions from the archive and creates any necessary
// directories in the destination path.
//
// Returns an error if any part of the extraction process fails (opening the zip file,
// creating directories, extracting files, etc.).
func ExtractZip(zipFile, destDir, version string) error {
	reader, err := zip.OpenReader(zipFile)
	if err != nil {
		return err
	}
	defer reader.Close()

	// Get the root directory name in the archive
	rootDir := fmt.Sprintf("node-v%s-win-%s", version, runtime.GOARCH)
	if runtime.GOARCH == "amd64" {
		rootDir = fmt.Sprintf("node-v%s-win-x64", version)
	} else if runtime.GOARCH == "386" {
		rootDir = fmt.Sprintf("node-v%s-win-x86", version)
	}

	// Extract files
	for _, file := range reader.File {
		// Remove root directory from path
		relPath := strings.TrimPrefix(file.Name, rootDir)
		relPath = strings.TrimPrefix(relPath, "/")
		relPath = strings.TrimPrefix(relPath, "\\")

		if relPath == "" {
			continue
		}

		targetPath := filepath.Join(destDir, relPath)

		if file.FileInfo().IsDir() {
			os.MkdirAll(targetPath, file.Mode())
			continue
		}

		os.MkdirAll(filepath.Dir(targetPath), 0755)

		srcFile, err := file.Open()
		if err != nil {
			return err
		}

		destFile, err := os.Create(targetPath)
		if err != nil {
			srcFile.Close()
			return err
		}

		_, err = io.Copy(destFile, srcFile)
		srcFile.Close()
		destFile.Close()
		if err != nil {
			return err
		}

		os.Chmod(targetPath, file.Mode())
	}

	return nil
}

// extractTarGz extracts a Node.js tar.gz archive to the specified destination directory.
//
// This function handles the extraction of a Node.js tar.gz archive and manages the necessary permissions.
// It first extracts the archive to a temporary directory and then uses sudo to move the files
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
//   - This function has heavily assumes, that there are no tar.gz files for Windows.
//   - Requires sudo privileges to set proper ownership and permissions.
//   - Handles directory creation, file extraction, symbolic links, and permission setting.
func ExtractTarGz(tarGzFile, destDir, version string) error {
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
		} else if runtime.GOARCH == "arm" {
			archSuffix = "armv7l"
		} else {
			archSuffix = runtime.GOARCH
		}
		if IsAlpine() {
			archSuffix += "-musl"
		}
		rootDir = fmt.Sprintf("node-v%s-linux-%s", version, archSuffix)
	} else { // MacOS since there is no tar.gz for Windows
		if runtime.GOARCH == "amd64" {
			archSuffix = "x64"
		} else {
			archSuffix = runtime.GOARCH
		}
		rootDir = fmt.Sprintf("node-v%s-darwin-%s", version, archSuffix)
	}

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
	var chownCmd *exec.Cmd
	if runtime.GOOS == "linux" {
		chownCmd = exec.Command("sudo", "chown", "-R", ServiceUsername+":"+ServiceUsername, destDir)
	} else {
		chownCmd = exec.Command("sudo", "chown", "-R", ServiceUsername, destDir)
	}
	chmodCmd := exec.Command("sudo", "chmod", "755", destDir)
	if output, err := chmodCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set directory permissions: %w\nOutput: %s", err, output)
	}
	if output, err := chownCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
	}

	return nil
}

// GetOSDetails returns the current operating system and architecture.
//
// Returns:
//   - string: The operating system (e.g., "linux", "darwin", "windows")
//   - string: The architecture (e.g., "amd64", "arm64", "386")
func GetOSDetails() (string, string) {
	return runtime.GOOS, runtime.GOARCH
}

// checkPath checks if the specified path is part of the currentPath.
// Main purpose is to check if the path is already in the PATH environment variable.
//
// Parameters:
//   - currentPath: The current PATH environment variable
//   - path: The path to check within the currentPath
//
// Returns:
//   - bool: true if the path is found in the currentPath, false otherwise
func checkEnvPath(currentPath, path string) bool {
	logger.Debug("Checking if %s is in %s", path, currentPath)
	return strings.Contains(currentPath, path)
}

// SetEnvPath modifies the system PATH environment variable to include the path
// specified as an parameter of the function.
//
// Parameters:
//   - path: The path to be added to the PATH environment variable
//
// Returns:
//   - string: The updated PATH environment variable
//   - error: An error if the operation fails
func SetEnvPath(path string) (string, error) {
	currentEnvPath := os.Getenv("PATH")
	if !checkEnvPath(currentEnvPath, path) {
		logger.Debug("%s is not in PATH, adding...", path)
		newEnvPath := fmt.Sprintf("PATH=%s%c%s", path, os.PathListSeparator, currentEnvPath)
		if err := os.Setenv("PATH", newEnvPath); err != nil {
			logger.Debug("Failed to set PATH environment variable: %v", err)
			return "", fmt.Errorf("failed to set PATH environment variable: %w", err)
		}
		return newEnvPath, nil
	} else {
		logger.Debug("%s is already in PATH", path)
		return currentEnvPath, nil
	}
}

// YesNoPrompt prompts the user with a yes/no question and returns true for "yes" and false for "no".
// It continues to prompt until a valid response is given.
//
// Parameters:
//   - message: The question to ask the user
//
// Returns:
//   - bool: true if the user responds with "yes" or "y", false for "no" or "n"
func YesNoPrompt(message string) bool {
	choices := "Y/n"

	r := bufio.NewReader(os.Stdin)
	var input string

	for {
		fmt.Fprintf(os.Stderr, "%s (%s) ", message, choices)
		input, _ = r.ReadString('\n')
		input = strings.TrimSpace(input)
		if input == "" {
			return true
		}
		input = strings.ToLower(input)
		if input == "y" || input == "yes" {
			return true
		}
		if input == "n" || input == "no" {
			return false
		}
	}
}

// IsAlpine checks if the current operating system is Alpine Linux.
// It checks for the presence of the "/etc/alpine-release" file or looks for "Alpine" in "/etc/os-release".
//
// Returns:
//   - bool: true if the system is Alpine Linux, false otherwise
func IsAlpine() bool {
    if _, err := os.Stat("/etc/alpine-release"); err == nil {
        return true
    }

    data, err := os.ReadFile("/etc/os-release")
    if err == nil && strings.Contains(string(data), "Alpine") {
        return true
    }
    return false
}

// UseOfficialNodejs determines whether to use official Node.js builds or unofficial builds based on the operating system.
//
// Returns:
//   - bool: true if official Node.js builds should be used, false if unofficial builds should be used
func UseOfficialNodejs() bool {
	if IsAlpine() {
		logger.Debug("Detected Alpine Linux, using unofficial Node.js builds")
		return false
	}

	logger.Debug("Using official Node.js builds")
	return true
}

// checkBinaryExists checks if a binary is available.
//
// Parameters:
//   - binary: The name of the binary to check
// Returns:
//   - bool: true if the binary exists in the system's PATH, false otherwise
func checkBinaryExists(binary string) bool {
	_, err := exec.LookPath(binary)
	return err == nil
}
