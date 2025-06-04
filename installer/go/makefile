.PHONY: build clean
APP_NAME=flowfuse-device-installer
VERSION:=$(shell grep -o '"version": "[^"]*"' ../../package.json | sed 's/"version": "//;s/"//')

build:
	mkdir -p out/{linux,macos,windows}
	@echo "Building ${APP_NAME} version ${VERSION}..."
	GOARCH=amd64 GOOS=linux go build -ldflags "-X main.version=${VERSION}" -o ./out/linux/${APP_NAME}-linux-amd64 main.go
	GOARCH=arm64 GOOS=linux go build -ldflags "-X main.version=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm64 main.go
	GOARCH=arm GOOS=linux go build -ldflags "-X main.version=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm main.go
	GOARCH=amd64 GOOS=windows go build -ldflags "-X main.version=${VERSION}" -o ./out/windows/${APP_NAME}-windows-amd64.exe main.go
	GOOS=darwin GOARCH=amd64 go build -ldflags "-X main.version=${VERSION}" -o ./out/macos/${APP_NAME}-macos-amd64 main.go
	GOOS=darwin GOARCH=arm64 go build -ldflags "-X main.version=${VERSION}" -o ./out/macos/${APP_NAME}-macos-arm64 main.go

clean:
	go clean
	rm -rf ./out/*
