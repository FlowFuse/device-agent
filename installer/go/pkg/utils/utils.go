package utils

import (
	"bufio"
	"fmt"
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
// For Linux systems, it delegates to checkUnixPermissions to verify specific Unix permissions.
// For other operating systems, it returns an error indicating the OS is not supported.
//
// Returns:
//   - nil if the application has sufficient permissions
//   - error if permissions are insufficient or the operating system is not supported
func CheckPermissions() error {
	switch runtime.GOOS {
	case "linux":
		return checkUnixPermissions()
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

// CreateWorkingDirectory creates and returns the working directory path for the FlowFuse device agent.
// On Linux systems, it creates the directory at "/opt/flowfuse-device" with 0755 permissions.
// For other operating systems, it returns an error indicating the OS is not supported.
// Returns the working directory path as a string and any error encountered during directory creation.
func CreateWorkingDirectory() (string, error) {
	var workDir string

	switch runtime.GOOS {
	case "linux":
		workDir = "/opt/flowfuse-device"
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	if err := createDirWithPermissions(workDir, 0755); err != nil {
		return "", err
	}

	return workDir, nil
}

// GetWorkingDirectory returns the default working directory for the FlowFuse device agent based on the operating system.
// Currently, only Linux is supported, returning "/opt/flowfuse-device".
// For unsupported operating systems, it returns an error.
func GetWorkingDirectory() (string, error) {
	switch runtime.GOOS {
	case "linux":
		return "/opt/flowfuse-device", nil
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// createDirWithPermissions creates a directory at the specified path with the given permissions.
// If the directory already exists, no action is taken. On Linux systems, the function first attempts
// to create the directory without sudo. If that fails, it tries with sudo. After creation, it sets
// the ownership of the directory to a service user.
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
	switch runtime.GOOS {
	case "linux":
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

		serviceUser, err := createServiceUser(ServiceUsername)
		if err != nil {
			return fmt.Errorf("failed to create service user: %w", err)
		}

		logger.Debug("Setting ownership of %s to %s...", path, serviceUser)
		chownCmd := exec.Command("sudo", "chown", "-R", serviceUser, path)
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// createServiceUser creates a system user with the given username if it doesn't already exist.
// For Linux systems, it checks if the user exists by calling the "id" command.
// If the user doesn't exist, it creates the user with a home directory and no shell.
//
// Parameters:
//   - username: the name of the user to create
//
// Returns:
//   - string: the username if successful
//   - error: an error if the user creation failed or if the operating system is not supported
//
// Note: This function currently only supports Linux operating systems.
func createServiceUser(username string) (string, error) {
	switch runtime.GOOS {
	case "linux":
		checkUserCmd := exec.Command("id", username)
		if err := checkUserCmd.Run(); err == nil {
			logger.Debug("Service user %s already exists", username)
		} else {
			logger.Info("Creating service user %s...", username)
			createUserCmd := exec.Command("sudo", "useradd", "-m", "-s", "/sbin/nologin", username)
			if output, err := createUserCmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("failed to create user: %w\nOutput: %s", err, output)
			}
		}
		return username, nil

	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// RemoveServiceUser deletes the specified service user account from the system.
// On Linux, it executes "userdel -r" with sudo to remove the user and their home directory.
//
// Parameters:
//   - username: the name of the user account to be removed
//
// Returns:
//   - error: nil on success, or an error describing what went wrong
//
// Note: Currently only supported on Linux operating systems.
func RemoveServiceUser(username string) error {
	logger.Debug("Removing service user %s...", username)

	switch runtime.GOOS {
	case "linux":
		removeUserCmd := exec.Command("sudo", "userdel", "-r", username)
		if output, err := removeUserCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove user %s: %w\nOutput: %s", username, err, output)
		}
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
			fullPath := fmt.Sprintf("%s/%s", workDir, entry.Name())
			logger.Debug("Removing: %s", fullPath)

			var removeCmd *exec.Cmd
			switch runtime.GOOS {
			case "linux", "darwin":
				removeCmd = exec.Command("sudo", "rm", "-rf", fullPath)
			case "windows":
				removeCmd = exec.Command("cmd", "/C", "rmdir", "/S", "/Q", fullPath)
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

// GetOSDetails returns the current operating system and architecture.
//
// Returns:
//   - string: The operating system (e.g., "linux", "darwin", "windows")
//   - string: The architecture (e.g., "amd64", "arm64", "386")
func GetOSDetails() (string, string) {
	return runtime.GOOS, runtime.GOARCH
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
