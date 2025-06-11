package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/flowfuse/device-agent-installer/cmd"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
	"github.com/spf13/pflag"
)

var (
	agentVersion        string
	flowfuseURL         string
	flowfuseOneTimeCode string
	nodeVersion         string
	serviceUsername     string
	help                bool
	uninstall           bool
	updateNode        bool
	updateAgent         bool
	debugMode           bool
)

func init() {
	pflag.StringVarP(&nodeVersion, "nodejs-version", "n", "20.19.1", "Node.js version to install (minimum)")
	pflag.StringVarP(&agentVersion, "agent-version", "a", "latest", "Device agent version to install/update to")
	pflag.StringVarP(&serviceUsername, "service-user", "s", "flowfuse", "Username for the service account")
	pflag.StringVarP(&flowfuseURL, "url", "u", "https://app.flowfuse.com", "FlowFuse URL")
	pflag.StringVarP(&flowfuseOneTimeCode, "otc", "o", "", "FlowFuse one time code for authentication (required)")
	pflag.BoolVarP(&help, "help", "h", false, "Display help information")
	pflag.BoolVar(&uninstall, "uninstall", false, "Uninstall the device agent")
	pflag.BoolVar(&updateNode, "update-nodejs", false, "Update bundled Node.js to specified version")
	pflag.BoolVar(&updateAgent, "update-agent", false, "Update the Device Agent package to specified version")
	pflag.BoolVar(&debugMode, "debug", false, "Enable debug logging")
	pflag.Parse()

	if help {
		fmt.Println("FlowFuse Device Agent Installer")
		fmt.Print("\n")
		fmt.Println("Usage:")
		fmt.Println("  Installation:")
		fmt.Println("    ./installer --otc <one-time-code> [--agent-version <version>] [--nodejs-versionjs-version <version>]")
		fmt.Println("  Update:")
		fmt.Println("    ./installer --update-agent [--agent-version <version>]")
		fmt.Println("    ./installer --update-nodejs [--nodejs-version <version>]")
		fmt.Println("    ./installer --update-agent --update-nodejs [--agent-version <version>] [--nodejs-version <version>]")
		fmt.Println("  Uninstall:")
		fmt.Println("    ./installer --uninstall")
		fmt.Print("\n")
		fmt.Println("Options:")
		pflag.PrintDefaults()
		os.Exit(0)
	}

	if !uninstall && !updateNode && !updateAgent && flowfuseOneTimeCode == "" {
		fmt.Println("[ERROR]: FlowFuse one time code is required for installation")
		fmt.Print("\n")
		fmt.Println("Usage:")
		pflag.PrintDefaults()
		os.Exit(1)
	}
}

func main() {
	utils.ServiceUsername = serviceUsername

	exePath, err := os.Executable()
	if err != nil {
		fmt.Println("Error determining executable path:", err)
		os.Exit(1)
	}
	installerDir := filepath.Dir(exePath)

	// Initialize logger
	if err := logger.Initialize(debugMode); err != nil {
		fmt.Printf("Warning: Failed to initialize logger: %s\n", err)
	} else {
		defer logger.Close()
	}

	// Log startup information
	logger.Debug("Command line arguments: node=%s, agent=%s, user=%s, url=%s, debug=%v",
		nodeVersion, agentVersion, serviceUsername, flowfuseURL, debugMode)
	operatingSystem, architecture := utils.GetOSDetails()
	logger.Debug("Detected system: %s, detected architecture: %s", operatingSystem, architecture)

	logger.Info("****************************************************************")
	logger.Info("*            FlowFuse Device Agent Installer                   *")
	logger.Info("*                                                              *")
	logger.Info("* This installer will set up the FlowFuse Device Agent on your *")
	logger.Info("* system and configure it to run as a system service.          *")
	logger.Info("*                                                              *")
	logger.Info("****************************************************************")

	if debugMode {
		logger.Info("Debug mode enabled. Logs will be written to: %s", logger.GetLogFilePath())
	}

	var exitCode int

	if uninstall {
		logger.Info("Uninstalling FlowFuse Device Agent...")
		err = cmd.Uninstall()
	} else if updateNode || updateAgent {
		logger.Info("Updating FlowFuse Device Agent...")
		err = cmd.Update(agentVersion, nodeVersion, updateAgent, updateNode)
	} else {
		logger.Info("Installing FlowFuse Device Agent...")

		err = cmd.Install(nodeVersion, agentVersion, installerDir, flowfuseURL, flowfuseOneTimeCode, false)
	}

	if err != nil {
		logger.Error("Installation failed: %s", err)
		exitCode = 1
	} else {
		exitCode = 0
	}

	os.Exit(exitCode)
}
