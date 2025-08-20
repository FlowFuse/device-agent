package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/nodejs"
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
//
// Parameters:
//   - serviceName: The name to use for the Windows service
//   - workDir: The working directory for the service
//
// Returns:
//   - error: nil on success, otherwise an error with detailed failure information
func InstallWindows(serviceName, workDir string) error {
	// First, download and extract NSSM if it doesn't exist
	nssmPath, err := ensureNSSM(workDir)
	if err != nil {
		return fmt.Errorf("failed to ensure NSSM is available: %w", err)
	}

	nodeBinDirPath := nodejs.GetNodeBinDir()

	if _, err := utils.SetEnvPath(nodeBinDirPath); err != nil {
		return fmt.Errorf("failed to set PATH: %w", err)
	}

	deviceAgentPath := filepath.Join(nodeBinDirPath, "flowfuse-device-agent.cmd")

	logger.Debug("Creating Windows service...")

	// Install the service
	installCmd := exec.Command(nssmPath, "install", serviceName, deviceAgentPath)
	logger.Debug("Install command: %s", installCmd.String())
	if output, err := installCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to create service: %w\nOutput: %s", err, output)
	}

	// Configure the service
	if err := configureService(nssmPath, serviceName, workDir); err != nil {
		return err
	}

	return nil
}

// configureService sets up all parameters for the NSSM service.
// This function applies all the necessary settings to configure the Windows service.
//
// Parameters:
//   - nssmPath: The path to the NSSM executable
//   - serviceName: The name of the service
//   - workDir: The working directory for the service
//
// Returns:
//   - error: nil on success, otherwise an error indicating the failure
func configureService(nssmPath, serviceName, workDir string) error {
	serviceParams := map[string]string{
		"AppDirectory":                 workDir,
		"DisplayName":                  "FlowFuse Device Agent",
		"Description":                  fmt.Sprintf("FlowFuse Device Agent Service running from %s", workDir),
		"AppStdout":                    filepath.Join(workDir, "flowfuse-device-agent.log"),
		"AppStderr":                    filepath.Join(workDir, "flowfuse-device-agent-error.log"),
		"AppRestartDelay":              "30000",
		"ObjectName":                   "LocalService",
		"AppStdoutCreationDisposition": "4",
		"AppStderrCreationDisposition": "4",
		"AppRotateFiles":               "1",
		"AppRotateOnline":              "1",
		"AppRotateBytes":               "10240",
	}

	for param, value := range serviceParams {
		if err := setNssmParam(nssmPath, serviceName, param, value); err != nil {
			return err
		}
	}

	// Configure environment variables
	nodeOptions := "NODE_OPTIONS=--max_old_space_size=512"
	// The AppEnvironmentExtra parameter needs multiple values, which requires a direct command
	envCmd := exec.Command(nssmPath, "set", serviceName, "AppEnvironmentExtra", nodeOptions, os.Getenv("PATH"))
	logger.Debug("Set environment command: %s", envCmd.String())
	if output, err := envCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set environment variables: %w\nOutput: %s", err, output)
	}

	return nil
}

// setNssmParam is a helper function that sets a parameter for an NSSM service and handles errors
// during the process. It constructs the command to set the parameter and executes it.
//
// Parameters:
//   - nssmPath: The path to the NSSM executable
//   - serviceName: The name of the service
//   - paramName: The name of the parameter to set
//   - paramValue: The value to set for the parameter
//
// Returns:
//   - error: nil on success, otherwise an error indicating the failure
func setNssmParam(nssmPath, serviceName, paramName, paramValue string) error {
	cmd := exec.Command(nssmPath, "set", serviceName, paramName, paramValue)
	logger.Debug("Set NSSM parameter command: %s", cmd.String())
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set %s: %w\nOutput: %s", paramName, err, output)
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
// It first attempts to stop the service, then uses "sc.exe delete" command to remove it.
//
// Parameters:
//   - serviceName: The name of the Windows service to uninstall.
//
// Returns:
//   - An error if uninstallation fails.
//   - nil if the service is successfully uninstalled.
func UninstallWindows(serviceName string) error {
	_ = StopWindows(serviceName)

	removeCmd := exec.Command("sc.exe", "delete", serviceName)
	output, err := removeCmd.CombinedOutput()
	if err != nil {
		// Parse output to catch actual removal failure
		outputStr := string(output)

		// Common Windows error codes for service not found:
		// 1060 = ERROR_SERVICE_DOES_NOT_EXIST
		// 1072 = ERROR_SERVICE_MARKED_FOR_DELETE
		if strings.Contains(outputStr, "1060") ||
			strings.Contains(outputStr, "does not exist") ||
			strings.Contains(outputStr, "ERROR_SERVICE_DOES_NOT_EXIST") {
			logger.Debug("Windows service %s does not exist, skipping removal", serviceName)
			return nil
		}

		// If service is marked for delete, this is also considered success
		if strings.Contains(outputStr, "1072") ||
			strings.Contains(outputStr, "marked for deletion") ||
			strings.Contains(outputStr, "ERROR_SERVICE_MARKED_FOR_DELETE") {
			logger.Debug("Windows service %s is marked for deletion, removal successful", serviceName)
			return nil
		}

		// Any other error is a real failure
		logger.Error("Failed to remove Windows service: %s", outputStr)
		return fmt.Errorf("failed to remove service: %w\nOutput: %s", err, outputStr)
	}

	logger.Debug("Windows service removed successfully")
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
func ensureNSSM(workDir string) (string, error) {
	downloadUrl := fmt.Sprintf("https://nssm.cc/release/nssm-%s.zip", nssmVersion)

	nssmPath, err := findNSSM(workDir)
	if err == nil {
		return nssmPath, nil
	}

	logger.Debug("Downloading NSSM...")

	arch := "win64"
	if os.Getenv("PROCESSOR_ARCHITECTURE") == "x86" {
		arch = "win32"
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
func findNSSM(workDir string) (string, error) {
	arch := "win64"
	if os.Getenv("PROCESSOR_ARCHITECTURE") == "x86" {
		arch = "win32"
	}

	nssmPath := filepath.Join(workDir, "nssm", fmt.Sprintf("nssm-%s", nssmVersion), arch, "nssm.exe")
	logger.Debug("Looking for NSSM at: %s", nssmPath)

	if _, err := os.Stat(nssmPath); err == nil {
		return nssmPath, nil
	}

	return "", fmt.Errorf("NSSM not found")
}
