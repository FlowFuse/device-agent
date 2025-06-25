.PHONY: help build clean lint fmt vet check-quality
APP_NAME=flowfuse-device-installer
VERSION:=development

# Optional colors
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
WHITE  := $(shell tput -Txterm setaf 7)
CYAN   := $(shell tput -Txterm setaf 6)
RESET  := $(shell tput -Txterm sgr0)

default: help

build: ## builds the application for all platforms
	mkdir -p out/{linux,macos,windows}
	@echo "Building ${APP_NAME} version ${VERSION}..."
	GOARCH=amd64 GOOS=linux go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/linux/${APP_NAME}-linux-amd64 main.go
	GOARCH=arm64 GOOS=linux go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm64 main.go
	GOARCH=arm GOOS=linux go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm main.go
	GOARCH=amd64 GOOS=windows go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/windows/${APP_NAME}-windows-amd64.exe main.go
	GOOS=darwin GOARCH=amd64 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/macos/${APP_NAME}-macos-amd64 main.go
	GOOS=darwin GOARCH=arm64 go build -ldflags "-X main.instVersion=${VERSION}" -o ./out/macos/${APP_NAME}-macos-arm64 main.go

clean: ## cleans the build artifacts
	go clean
	rm -rf ./out/*


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
