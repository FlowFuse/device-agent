.PHONY: help build winres clean lint fmt vet check-quality
APP_NAME=flowfuse-device-installer
VERSION:=development

# Tool that produces the Windows version resource (VS_VERSIONINFO) from a JSON file
GOVERSIONINFO=github.com/josephspurrier/goversioninfo/cmd/goversioninfo@v1.7.0

WIN_VER := $(shell echo "$(VERSION)" | grep -Eo '^[0-9]+\.[0-9]+\.[0-9]+' || echo 0.0.0)
WIN_VER_MAJOR := $(word 1,$(subst ., ,$(WIN_VER)))
WIN_VER_MINOR := $(word 2,$(subst ., ,$(WIN_VER)))
WIN_VER_PATCH := $(word 3,$(subst ., ,$(WIN_VER)))

# Optional colors
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
WHITE  := $(shell tput -Txterm setaf 7)
CYAN   := $(shell tput -Txterm setaf 6)
RESET  := $(shell tput -Txterm sgr0)

default: help

winres: ## generates the Windows version resource (VS_VERSIONINFO) for the windows build
	@echo "Generating Windows version resource for ${WIN_VER}..."
	go run ${GOVERSIONINFO} \
		-64 -o resource_windows_amd64.syso \
		-ver-major ${WIN_VER_MAJOR} -ver-minor ${WIN_VER_MINOR} -ver-patch ${WIN_VER_PATCH} -ver-build 0 \
		-product-ver-major ${WIN_VER_MAJOR} -product-ver-minor ${WIN_VER_MINOR} -product-ver-patch ${WIN_VER_PATCH} -product-ver-build 0 \
		-file-version "${WIN_VER}.0" -product-version "${VERSION}" \
		-original-name "${APP_NAME}-windows-amd64.exe" \
		versioninfo.json

build: winres ## builds the installer for all platforms
	mkdir -p out/{linux,macos,windows}
	@echo "Building ${APP_NAME} version ${VERSION}..."
	GOARCH=amd64 GOOS=linux CGO_ENABLED=0 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/linux/${APP_NAME}-linux-amd64 .
	GOARCH=arm64 GOOS=linux CGO_ENABLED=0 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm64 .
	GOARCH=arm GOOS=linux CGO_ENABLED=0 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm .
	GOARCH=amd64 GOOS=windows CGO_ENABLED=0 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/windows/${APP_NAME}-windows-amd64.exe .
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/macos/${APP_NAME}-macos-amd64 .
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/macos/${APP_NAME}-macos-arm64 .

clean: ## cleans the build artifacts
	go clean
	rm -rf ./out/*
	rm -f resource_windows_amd64.syso

## Quality checks
check-quality: ## runs code quality checks
	make lint
	make fmt
	make vet

lint: ## go linting. Update and use specific lint tool and options
	golangci-lint run --enable-all

vet: ## go vet
	go vet ./...

fmt: ## runs go formatter
	go fmt ./...

## Help
help: ## Show this help.
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} { \
		if (/^[a-zA-Z_-]+:.*?##.*$$/) {printf "    ${YELLOW}%-20s${GREEN}%s${RESET}\n", $$1, $$2} \
		else if (/^## .*$$/) {printf "  ${CYAN}%s${RESET}\n", substr($$1,4)} \
		}' $(MAKEFILE_LIST)
