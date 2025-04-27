package utils

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"

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
// to enter a password. If the command fails, it logs informational messages notifying the user
// that they will be prompted for a password when sudo operations are performed.
// This function always returns nil as it's only used for informational purposes.
func checkUnixPermissions() error {
	cmd := exec.Command("sudo", "-nv")
	err := cmd.Run()

	if err != nil {
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

// RemoveWorkingDirectory attempts to remove the specified working directory.
// On Linux systems, it uses sudo to ensure proper permissions.
// For other operating systems, it returns an error indicating lack of support.
//
// Parameters:
//   - workDir: The path to the directory that needs to be removed
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func RemoveWorkingDirectory(workDir string) error {
	logger.Debug("Removing working directory: %s", workDir)

	switch runtime.GOOS {
	case "linux":
		removeWorkDirCmd := exec.Command("sudo", "rm", "-rf", workDir)
		if output, err := removeWorkDirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove working directory: %w\nOutput: %s", err, output)
		}
		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}
