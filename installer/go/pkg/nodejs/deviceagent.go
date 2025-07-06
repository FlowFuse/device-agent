package nodejs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/config"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

const packageName = "@flowfuse/device-agent"

// InstallDeviceAgent installs the FlowFuse Device Agent with the specified version
// to the given base directory. It requires Node.js to be already installed.
// The function will:
// 1. Check if Node.js is installed
// 2. Install the Device Agent globally using npm with the appropriate version
// 3. The installation runs as the service user
//
// Parameters:
//   - version: The version of the Device Agent to install (use "latest" for the latest version)
//   - baseDir: The base directory where Node.js is installed and where the Device Agent will be installed
//
// Returns an error if:
// - Node.js is not found
// - The operating system is not supported
// - The installation process fails
func InstallDeviceAgent(version, baseDir string, update bool) error {
	setNodeDirectories(baseDir)
	nodeBinDirPath := GetNodeBinDir()

	if _, err := os.Stat(nodeBinPath); os.IsNotExist(err) {
		return fmt.Errorf("node.js not found, please restart installator script")
	}

	var startMsg string
	var completeMsg string
	if update {
		startMsg = fmt.Sprintf("Updating FlowFuse Device Agent to %s version...", version)
		completeMsg = fmt.Sprintf("FlowFuse Device Agent successfully updated to %s version!", version)
	} else {
		startMsg = fmt.Sprintf("Installing FlowFuse Device Agent %s version...", version)
		completeMsg = "FlowFuse Device Agent installed successfully!"
	}

	serviceUser := utils.ServiceUsername
	packageName := packageName
	if version != "latest" {
		packageName += "@" + version
	}

	newPath, err := utils.SetEnvPath(nodeBinDirPath)
	if err != nil {
		logger.Error("Failed to set PATH: %v", err)
		return fmt.Errorf("failed to set PATH: %w", err)
	}

	// Create install command
	var installCmd *exec.Cmd
	npmPrefix := fmt.Sprintf("npm_config_prefix=%s", nodeBaseDir)
	switch runtime.GOOS {
	case "linux", "darwin":
		installCmd = exec.Command("sudo", "--preserve-env=PATH", "-u", serviceUser, npmBinPath, "install", "-g", "--cache", filepath.Join(nodeBaseDir, ".npm-cache"), packageName)
		env := os.Environ()
		installCmd.Env = append(env, npmPrefix, newPath)
	case "windows":
		installCmd = exec.Command("cmd", "/C", npmBinPath, "install", "-g", packageName)
		env := os.Environ()
		installCmd.Env = append(env, npmPrefix, newPath)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	logger.Info(startMsg)
	logger.Debug("Install/update command: %s", installCmd.String())
	if output, err := installCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to install/update device agent: %w\nOutput: %s", err, output)
	}
	logger.Info(completeMsg)

	return nil
}

// getDeviceAgentVersion retrieves version of cuirrently installed Device agent from installer config file.
//
// Returns:
//   - string: The version of the installed Device Agent, or an empty string if not found
//   - error: An error if the command fails or if the output cannot be parsed
func GetInstalledDeviceAgentVersion() (string, error) {
	// Load saved configuration
	logger.Debug("Loading configuration...")
	savedAgentVersion := ""
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Error("Could not load configuration: %v", err)
		return "", fmt.Errorf("could not load configuration: %w", err)
	} else {
		savedAgentVersion = cfg.AgentVersion
		logger.Debug("Node.js version retrieved from config: %s", savedAgentVersion)
	}

	return savedAgentVersion, nil
}

// getLatestDeviceAgentVersion retrieves the latest version of
// the FlowFuse Device Agent package available in npmjs registry.
// It runs the npm view command to get the latest version.
//
// Returns:
//   - string: The latest version of the Device Agent package
//   - error: An error if the command fails or if the output cannot be parsed
func GetLatestDeviceAgentVersion() (string, error) {
	var viewCmd *exec.Cmd
	serviceUser := utils.ServiceUsername

	baseDir, err := utils.GetWorkingDirectory()
	if err != nil {
		logger.Error("Failed to get working directory: %v", err)
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}

	setNodeDirectories(baseDir)
	nodeBinDirPath := GetNodeBinDir()
	newPath, err := utils.SetEnvPath(nodeBinDirPath)
	if err != nil {
		logger.Error("Failed to set PATH: %v", err)
		return "", fmt.Errorf("failed to set PATH: %w", err)
	}

	switch runtime.GOOS {
	case "linux", "darwin":
		viewCmd = exec.Command("sudo", "--preserve-env=PATH", "-u", serviceUser, npmBinPath, "--cache", filepath.Join(nodeBaseDir, ".npm-cache"), "view", packageName, "version")
		env := os.Environ()
		viewCmd.Env = append(env, newPath)
	case "windows":
		viewCmd = exec.Command("cmd", "/C", npmBinPath, "--cache", filepath.Join(nodeBaseDir, ".npm-cache"), "view", packageName, "version")
		env := os.Environ()
		viewCmd.Env = append(env, newPath)
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	output, err := viewCmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to get latest device agent version: %w\nOutput: %s", err, output)
	}
	return strings.TrimSpace(string(output)), nil
}

// isAgentUpdateNeeded checks if the Device Agent needs to be updated.
// It compares the currently installed version with the requested version.
// If the currently installed version is equal to requested version,
// it returns false, indicating no update is needed. Otherwise, it returns true.
//
// Parameters:
//   - requestedAgentVersion: The version of the Device Agent that is requested to be installed
//
// Returns:
//   - bool: true if an update is needed, false otherwise
//   - error: An error if the current version cannot be retrieved or if the comparison fails
func IsAgentUpdateRequired(requestedAgentVersion string) (bool, error) {
	logger.LogFunctionEntry("IsAgentUpdateRequired", map[string]interface{}{
		"requestedAgentVersion": requestedAgentVersion,
	})
	var err error

	if requestedAgentVersion == "latest" {
		requestedAgentVersion, err = GetLatestDeviceAgentVersion()
		if err != nil {
			return false, fmt.Errorf("failed to get latest device agent version: %v", err)
		}
	}
	currentVersion, err := GetInstalledDeviceAgentVersion()
	if err != nil {
		return false, fmt.Errorf("failed to get current device agent version: %v", err)
	}
	if currentVersion == "" {
		logger.Debug("No FlowFuse Device Agent installed, proceeding with installation.")
		return true, nil
	}
	if requestedAgentVersion == "" {
		logger.Debug("No specified version provided, assuming no update needed.")
		return false, nil
	}
	logger.Debug("Current FlowFuse Device Agent version: %s, requested version: %s", currentVersion, requestedAgentVersion)
	if currentVersion == requestedAgentVersion {
		logger.LogFunctionExit("IsAgentUpdateRequired", "no update needed", nil)
		return false, nil
	}

	logger.LogFunctionExit("IsAgentUpdateRequired", "update needed", nil)
	return true, nil
}

// UninstallDeviceAgent removes the FlowFuse Device Agent package from the system.
// It uninstalls the package using the local npm, running the uninstall command with
// It uninstalls the package using the local npm, running the uninstall command with
// the appropriate permissions based on the operating system.
//
// Parameters:
//   - baseDir: The base directory where node.js is installed
//
// Returns:
//   - error: An error if uninstallation fails or if the operating system is not supported
func UninstallDeviceAgent(baseDir string) error {
	setNodeDirectories(baseDir)
	nodeBinDirPath := GetNodeBinDir()

	serviceUser := utils.ServiceUsername

	newPath, err := utils.SetEnvPath(nodeBinDirPath)
	if err != nil {
		logger.Error("Failed to set PATH: %v", err)
		return fmt.Errorf("failed to set PATH: %w", err)
	}

	// Create uninstall command
	var uninstallCmd *exec.Cmd
	npmPrefix := fmt.Sprintf("npm_config_prefix=%s", nodeBaseDir)
	switch runtime.GOOS {
	case "linux", "darwin":
		uninstallCmd = exec.Command("sudo", "--preserve-env=PATH", "-u", serviceUser, npmBinPath, "uninstall", "-g", packageName)
		env := os.Environ()
		uninstallCmd.Env = append(env, npmPrefix, newPath)
	case "windows":
		workDir, err := utils.GetWorkingDirectory()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		deviceAgentPath := filepath.Join(workDir, "node", "node_modules", "@flowfuse", "device-agent")
		uninstallCmd = exec.Command("cmd", "/C", "rmdir", "/S", "/Q", deviceAgentPath)
		env := os.Environ()
		uninstallCmd.Env = append(env, npmPrefix, newPath)

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	logger.Debug("Uninstall command: %s", uninstallCmd.String())

	if output, err := uninstallCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to uninstall device agent: %w\nOutput: %s", err, output)
	}

	logger.Info("FlowFuse Device Agent package removed successfully!")
	return nil
}

// ConfigureDeviceAgent handles the device agent configuration based on OTC availability.
// It supports three modes:
// 1. otc: Configures Device Agent using provided one time code (OTC) and URL
// 2. manual: Without OTC, prompts for device configuration and saves as device.yml
// 3. install-only: If neither OTC nor config is provided, it does not configure the Device Agent
//
// Parameters:
//   - url: The URL of the FlowFuse platform to connect to
//   - token: The authentication token for the device (can be empty for interactive mode)
//   - baseDir: The base directory where configuration files will be stored
//
// Returns:
//   - installMode: The mode used ("otc", "manual", "install-only")
//   - autoStartService: Whether the service should be started automatically
//   - error: Any error that occurred during configuration
func ConfigureDeviceAgent(url, token, baseDir string) (string, bool, error) {

	var deviceAgentPath string

	setNodeDirectories(baseDir)
	nodeBinDirPath := GetNodeBinDir()
	serviceUser := utils.ServiceUsername

	deviceConfigPath := filepath.Join(baseDir, "device.yml")
	if _, err := os.Stat(deviceConfigPath); !os.IsNotExist(err) {
		logger.Info("Device Agent is already configured, skipping configuration.")
		return "none", true, nil
	}

	// Check if node is installed
	if _, err := os.Stat(nodeBinPath); os.IsNotExist(err) {
		logger.Error("Node.js not found, please restart installator script")
		return "", false, fmt.Errorf("node.js is not installed locally")
	}

	newPath, err := utils.SetEnvPath(nodeBinDirPath)
	if err != nil {
		logger.Error("Failed to set PATH: %v", err)
		return "", false, fmt.Errorf("failed to set PATH: %w", err)
	}

	// Getting full path to flowfuse-device-agent binary
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		deviceAgentPath = filepath.Join(nodeBinDirPath, "flowfuse-device-agent")
	} else {
		deviceAgentPath = filepath.Join(nodeBinDirPath, "flowfuse-device-agent.cmd")
	}

	if token != "" {
		// Create configure command
		var configureCmd *exec.Cmd
		switch runtime.GOOS {
		case "linux", "darwin":
			configureCmd = exec.Command("sudo", "--preserve-env=PATH", deviceAgentPath, "-o", token, "-u", url, "--otc-no-start", "--installer-mode")
			env := os.Environ()
			configureCmd.Env = append(env, newPath)
		case "windows":
			configureCmd = exec.Command("cmd", "/C", deviceAgentPath, "-o", token, "-u", url, "--otc-no-start", "--installer-mode")
			env := os.Environ()
			configureCmd.Env = append(env, newPath)
		default:
			return "", false, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
		}

		logger.Debug("Configure command: %s", configureCmd.String())

		// Connect stdin, stdout, and stderr for interactive processes
		configureCmd.Stdin = os.Stdin
		configureCmd.Stdout = os.Stdout
		configureCmd.Stderr = os.Stderr

		logger.Debug("Starting device agent configuration")

		// Run the command interactively
		if err := configureCmd.Run(); err != nil {
			return "", false, fmt.Errorf("failed to configure the device agent: %w", err)
		}

		var chownCmd *exec.Cmd
		switch runtime.GOOS {
		case "linux":
			chownCmd = exec.Command("sudo", "chown", "-R", serviceUser+":"+serviceUser, baseDir)
		case "darwin":
			chownCmd = exec.Command("sudo", "chown", "-R", serviceUser, baseDir)
		case "windows":
			logger.Info("Configuration completed successfully!")
			return "otc", true, nil
		}
		// Set permissions for the working directory
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return "", false, fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		logger.Info("Configuration completed successfully!")
		return "otc", true, nil
	} else {
	
		logger.Info("No OTC (One-Time Code) provided. Automatic configuration is not possible.")
		logger.Info("You can either:")
		logger.Info("  1. Install the device agent only (you'll need to configure it manually later)")
		logger.Info("  2. Provide a device configuration file now")

		configProvided := utils.PromptYesNo("Do you want to provide a device agent configuration now?", true)

		if configProvided {
			// Manual configuration mode
			logger.Info("Please paste your device configuration below.")
			logger.Info("The configuration should be in YAML format with all required fields.")
			logger.Info("Enter an empty line when done:")

			configContent, err := utils.PromptMultilineInput()
			if err != nil {
				logger.Error("Failed to read configuration input: %v", err)
				return "", false, fmt.Errorf("failed to read configuration input: %w", err)
			}

			// Validate configuration
			if err := utils.ValidateDeviceConfiguration(configContent); err != nil {
				logger.Error("Invalid device configuration: %v", err)
				return "", false, fmt.Errorf("invalid device configuration: %w", err)
			}

			// Save configuration to device.yml
			if err := utils.SaveDeviceConfiguration(configContent, deviceConfigPath); err != nil {
				logger.Error("Failed to save device configuration: %v", err)
				return "", false, fmt.Errorf("failed to save device configuration: %w", err)
			}

			var chownCmd *exec.Cmd
			switch runtime.GOOS {
			case "linux":
				chownCmd = exec.Command("sudo", "chown", "-R", serviceUser+":"+serviceUser, baseDir)
			case "darwin":
				chownCmd = exec.Command("sudo", "chown", "-R", serviceUser, baseDir)
			case "windows":
				logger.Info("Configuration completed successfully!")
				return "manual", true, nil
			}
			// Set permissions for the working directory
			if output, err := chownCmd.CombinedOutput(); err != nil {
				return "", false, fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
			}

			logger.Info("Configuration completed successfully!")
			return "manual", true, nil
		}

		logger.Info("Configuration completed successfully!")
		return "install-only", false, nil
	}
}
