package nodejs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

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
func InstallDeviceAgent(version string, baseDir string) error {
	setNodeDirectories(baseDir)
	nodeBinDirPath := GetNodeBinDir()

	if _, err := os.Stat(nodeBinPath); os.IsNotExist(err) {
		return fmt.Errorf("node.js not found, please restart installator script")
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
	case "linux":
		installCmd = exec.Command("sudo", "--preserve-env=PATH", "-u", serviceUser, npmBinPath, "install", "-g", packageName)
		env := os.Environ()
		installCmd.Env = append(env, npmPrefix, newPath)
	case "windows":
		installCmd = exec.Command("cmd", "/C", npmBinPath, "install", "-g", packageName)
		env := os.Environ()
		installCmd.Env = append(env, npmPrefix, newPath)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	logger.Debug("Install command: %s", installCmd.String())

	if output, err := installCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to install device agent: %w\nOutput: %s", err, output)
	}

	logger.Info("FlowFuse Device Agent installed successfully!")
	return nil
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
	case "linux":
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

// ConfigureDeviceAgent sets up the FlowFuse Device Agent with the provided configuration.
// It configures the agent to connect to the specified FlowFuse platform URL using the provided token.
//
// Parameters:
//   - url: The URL of the FlowFuse platform to connect to
//   - token: The authentication token for the device
//   - baseDir: The base directory where configuration files will be stored
//
// Returns:
//   - error: An error if configuration fails, or nil if successful
//
// The function skips configuration if device.yml already exists in the base directory.
// For Linux, the configuration uses sudo to run as the service user.
// For Windows, it uses cmd.exe .
func ConfigureDeviceAgent(url string, token string, baseDir string) error {

	var deviceAgentPath string

	setNodeDirectories(baseDir)
	nodeBinDirPath 	:= GetNodeBinDir()
	serviceUser 		:= utils.ServiceUsername

	deviceConfigPath := filepath.Join(baseDir, "device.yml")
	if _, err := os.Stat(deviceConfigPath); !os.IsNotExist(err) {
		logger.Info("Device Agent is already configured, skipping configuration.")
		return nil
	}

	// Check if node is installed
	if _, err := os.Stat(nodeBinPath); os.IsNotExist(err) {
		logger.Error("Node.js not found, please restart installator script")
		return fmt.Errorf("node.js is not installed locally")
	}

	newPath, err := utils.SetEnvPath(nodeBinDirPath)
	if err != nil {
    logger.Error("Failed to set PATH: %v", err)
    return fmt.Errorf("failed to set PATH: %w", err)
	}

	// Getting full path to flowfuse-device-agent binary
	if runtime.GOOS == "linux" {
		deviceAgentPath = filepath.Join(nodeBinDirPath, "flowfuse-device-agent")
	} else {
		deviceAgentPath = filepath.Join(nodeBinDirPath, "flowfuse-device-agent.cmd")
	}

	// Create configure command
	var configureCmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		configureCmd = exec.Command("sudo", "--preserve-env=PATH", deviceAgentPath, "-o", token, "-u", url, "--otc-no-start")
		env := os.Environ()
		configureCmd.Env = append(env, newPath)
	case "windows":
		configureCmd = exec.Command("cmd", "/C", deviceAgentPath, "-o", token, "-u", url, "--otc-no-start")
		env := os.Environ()
		configureCmd.Env = append(env, newPath)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	logger.Debug("Configure command: %s", configureCmd.String())

	// Connect stdin, stdout, and stderr for interactive processes
	configureCmd.Stdin = os.Stdin
	configureCmd.Stdout = os.Stdout
	configureCmd.Stderr = os.Stderr

	logger.Debug("Starting device agent configuration")

	// Run the command interactively
	if err := configureCmd.Run(); err != nil {
		return fmt.Errorf("failed to configure the device agent: %w", err)
	}
	var chownCmd *exec.Cmd
	switch runtime.GOOS {
		case "linux":
			chownCmd = exec.Command("sudo", "chown", "-R", serviceUser+":"+serviceUser, baseDir)
		case "darwin":
			chownCmd = exec.Command("sudo", "chown", "-R", serviceUser, baseDir)
		case "windows":
			logger.Info("Configuration completed successfully!")
			return nil
	}
	// Set permissions for the working directory
	if output, err := chownCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
	}

	logger.Info("Configuration completed successfully!")
	return nil
}
