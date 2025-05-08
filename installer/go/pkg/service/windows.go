package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// NSSM version used throughout the Windows service management
const nssmVersion = "2.24"

// InstallWindows creates and configures a Windows service for the FlowFuse Device Agent.
// It performs the following operations:
//  1. Ensures NSSM (Non-Sucking Service Manager) is available for service management
//  2. Adds the FlowFuse node path to the PATH environment variable for the current process
//  3. Locates the device agent executable
//  4. Creates a Windows service using NSSM with the specified service name
//  5. Configures service properties including:
//     - Working directory
//     - Display name and description
//     - Standard output and error log files
//     - Restart delay (30 seconds)
//     - Node.js environment options (memory limit of 512MB)
//     - Service user (LocalService)
//  6. Starts the newly created service
//
// Parameters:
//   - serviceName: The name to use for the Windows service
//   - workDir: The working directory for the service
//
// Returns:
//   - error: nil on success, otherwise an error with detailed failure information
func InstallWindows(serviceName, workDir string) error {
	// First, download and extract NSSM if it doesn't exist
	nssmPath, err := ensureNSSM()
	if err != nil {
		return fmt.Errorf("failed to ensure NSSM is available: %w", err)
	}

	flowfuseNodePath := filepath.Join("c:\\", "opt", "flowfuse-device", "node")
	currentPath := os.Getenv("PATH")

	// Check if the path already exists in PATH
	if !pathContains(currentPath, flowfuseNodePath) {
		logger.Debug("Adding %s to PATH", flowfuseNodePath)

		// Set the PATH for this process
		newPath := flowfuseNodePath + ";" + currentPath
		os.Setenv("PATH", newPath)
	}

	// Find path to the device agent executable
	deviceAgentPath, err := exec.LookPath("flowfuse-device-agent.cmd")
	if err != nil {
		// Use direct path as fallback
		directPath := filepath.Join(flowfuseNodePath, "flowfuse-device-agent.cmd")
		if _, statErr := os.Stat(directPath); statErr == nil {
			deviceAgentPath = directPath
		} else {
			return fmt.Errorf("flowfuse-device-agent.cmd not found in PATH (including %s), is it installed? %w", flowfuseNodePath, err)
		}
	}

	logger.Debug("Creating Windows service...")

	// Install the service
	installCmd := exec.Command(nssmPath, "install", serviceName, deviceAgentPath)
	logger.Debug("Install command: %s", installCmd.String())
	if output, err := installCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to create service: %w\nOutput: %s", err, output)
	}

	// Set the working directory
	setDirCmd := exec.Command(nssmPath, "set", serviceName, "AppDirectory", workDir)
	logger.Debug("Set working directory command: %s", setDirCmd.String())
	if output, err := setDirCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set working directory: %w\nOutput: %s", err, output)
	}

	// Set the display name
	setDisplayCmd := exec.Command(nssmPath, "set", serviceName, "DisplayName", "FlowFuse Device Agent")
	logger.Debug("Set display name command: %s", setDisplayCmd.String())
	if output, err := setDisplayCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set display name: %w\nOutput: %s", err, output)
	}

	// Set the description
	setDescCmd := exec.Command(nssmPath, "set", serviceName, "Description", "FlowFuse Device Agent Service")
	logger.Debug("Set description command: %s", setDescCmd.String())
	if output, err := setDescCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set description: %w\nOutput: %s", err, output)
	}

	// Set log
	setLogCmd := exec.Command(nssmPath, "set", serviceName, "AppStdout", filepath.Join(workDir, "flowfuse-device-agent.log"))
	logger.Debug("Set log command: %s", setLogCmd.String())
	if output, err := setLogCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set log file: %w\nOutput: %s", err, output)
	}

	// Set the error log
	setErrorLogCmd := exec.Command(nssmPath, "set", serviceName, "AppStderr", filepath.Join(workDir, "flowfuse-device-agent-error.log"))
	logger.Debug("Set error log command: %s", setErrorLogCmd.String())
	if output, err := setErrorLogCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set error log file: %w\nOutput: %s", err, output)
	}

	// Set the failure reset period (in seconds)
	setResetCmd := exec.Command(nssmPath, "set", serviceName, "AppRestartDelay", "30000")
	logger.Debug("Set restart delay command: %s", setResetCmd.String())
	if output, err := setResetCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set restart delay: %w\nOutput: %s", err, output)
	}

	// Set the Node.js environment options
	setEnvCmd := exec.Command(nssmPath, "set", serviceName, "AppEnvironmentExtra", "NODE_OPTIONS=--max_old_space_size=512", fmt.Sprintf("PATH=%s", os.Getenv("PATH")))
	logger.Debug("Set environment command: %s", setEnvCmd.String())
	if output, err := setEnvCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set environment variables: %w\nOutput: %s", err, output)
	}

	// Set the service user
	setUserCmd := exec.Command(nssmPath, "set", serviceName, "ObjectName", "LocalService")
	logger.Debug("Set user command: %s", setUserCmd.String())
	if output, err := setUserCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set service user: %w\nOutput: %s", err, output)
	}

	// Start the service
	if err := StartWindows(serviceName); err != nil {
		return err
	}

	return nil
}

// StartWindows attempts to start a Windows service with the given name.
// It executes the "sc.exe start" command to start the service and logs the service status after the start attempt.
//
// Parameters:
//   - serviceName: The name of the service to start
//
// Returns:
//   - error: nil if the service started successfully, otherwise an error detailing what went wrong
func StartWindows(serviceName string) error {
	startCmd := exec.Command("sc.exe", "start", serviceName)
	if output, err := startCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to start service: %w\nOutput: %s", err, output)
	}

	statusCmd := exec.Command("sc.exe", "query", serviceName)
	statusOutput, _ := statusCmd.CombinedOutput()
	logger.Debug("Service status:\n%s", statusOutput)

	return nil
}

// StopWindows attempts to stop a Windows service with the given name.
// It executes the "sc.exe stop" command to stop the service.
//
// Parameters:
//   - serviceName: The name of the Windows service to stop.
//
// Returns:
//   - error: nil if the service was stopped successfully, otherwise an error
//     containing the command output and the original error.
func StopWindows(serviceName string) error {
	stopCmd := exec.Command("sc.exe", "stop", serviceName)
	if output, err := stopCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to stop service: %w\nOutput: %s", err, output)
	}
	return nil
}

// UninstallWindows uninstalls a Windows service with the given name.
// It first attempts to stop the service, then uses NSSM to remove it.
// This function requires NSSM to be installed and accessible on the system.
//
// Parameters:
//   - serviceName: The name of the Windows service to uninstall.
//
// Returns:
//   - An error if uninstallation fails.
//   - nil if the service is successfully uninstalled.
func UninstallWindows(serviceName string) error {
	_ = StopWindows(serviceName)

	nssmPath, err := findNSSM()
	if err != nil {
		return fmt.Errorf("failed to find NSSM: %w", err)
	}
	removeCmd := exec.Command(nssmPath, "remove", serviceName, "confirm")
	if output, err := removeCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to remove service: %w\nOutput: %s", err, output)
	}

	return nil
}

// IsInstalledWindows checks if a Windows service with the given name is installed.
// It executes "sc.exe query" to check the service status.
//
// Parameters:
//   - serviceName: The name of the Windows service to check.
//
// Returns:
//   - bool: true if the service is installed, false otherwise.
func IsInstalledWindows(serviceName string) bool {
	statusCmd := exec.Command("sc.exe", "query", serviceName)
	err := statusCmd.Run()
	return err == nil
}

// ensureNSSM ensures that the NSSM (Non-Sucking Service Manager) executable is available on the system.
// It first tries to find an existing NSSM installation. If not found, it downloads and extracts
// the specified version of NSSM to a directory within the application's working directory.
//
// Returns:
//   - string: The path to the NSSM executable
//   - error: An error if the NSSM executable could not be found or downloaded
func ensureNSSM() (string, error) {
	downloadUrl := fmt.Sprintf("https://nssm.cc/release/nssm-%s.zip", nssmVersion)

	nssmPath, err := findNSSM()
	if err == nil {
		return nssmPath, nil
	}

	logger.Debug("Downloading NSSM...")

	arch := "win64"
	if os.Getenv("PROCESSOR_ARCHITECTURE") == "x86" {
		arch = "win32"
	}

	workDir, err := utils.GetWorkingDirectory()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}

	// Create directory for NSSM
	nssmDir := filepath.Join(workDir, "nssm")
	if err := os.MkdirAll(nssmDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create NSSM directory: %w", err)
	}

	// Create temporary directory for downloading
	tempDir := filepath.Join(os.TempDir(), "flowfuse-nssm")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create temporary directory: %w", err)
	}

	// Download NSSM to temporary directory
	zipPath := filepath.Join(tempDir, "nssm.zip")
	downloadCmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Invoke-WebRequest -Uri '%s' -OutFile '%s'", downloadUrl, zipPath))
	if err := downloadCmd.Run(); err != nil {
		return "", fmt.Errorf("failed to download NSSM: %w", err)
	}

	// Extract the zip file
	extractCmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Expand-Archive -Path '%s' -DestinationPath '%s' -Force", zipPath, nssmDir))
	if err := extractCmd.Run(); err != nil {
		_ = os.Remove(zipPath)
		return "", fmt.Errorf("failed to extract NSSM: %w", err)
	}

	// Clean up
	_ = os.Remove(zipPath)
	_ = os.RemoveAll(tempDir)

	// Find the path to NSSM executable
	nssmPath = filepath.Join(nssmDir, fmt.Sprintf("nssm-%s", nssmVersion), arch, "nssm.exe")
	if _, err := os.Stat(nssmPath); err != nil {
		return "", fmt.Errorf("NSSM executable not found after extraction: %w", err)
	}

	return nssmPath, nil
}

// findNSSM searches for the NSSM (Non-Sucking Service Manager) executable in the workdir/nssm directory.
// It looks for the executable based on the current OS architecture and NSSM version.
//
// Returns:
//   - string: The full path to nssm.exe if found
//   - error: An error if NSSM could not be found in the expected location
func findNSSM() (string, error) {
	arch := "win64"
	if os.Getenv("PROCESSOR_ARCHITECTURE") == "x86" {
		arch = "win32"
	}

	workDir, err := utils.GetWorkingDirectory()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}

	nssmPath := filepath.Join(workDir, "nssm", fmt.Sprintf("nssm-%s", nssmVersion), arch, "nssm.exe")
	logger.Debug("Looking for NSSM at: %s", nssmPath)

	if _, err := os.Stat(nssmPath); err == nil {
		return nssmPath, nil
	}

	return "", fmt.Errorf("NSSM not found")
}

// pathContains checks if a given path is present in the current PATH environment variable.
// It splits the current PATH into individual paths and checks for a match.
//
// Parameters:
//   - currentPath: The current PATH environment variable
//   - checkPath: The path to check for in the current PATH
//
// Returns:
//   - bool: true if the checkPath is found in currentPath, false otherwise
func pathContains(currentPath, checkPath string) bool {
	for _, p := range filepath.SplitList(currentPath) {
		if p == checkPath {
			return true
		}
	}
	return false
}
