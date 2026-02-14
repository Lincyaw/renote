.PHONY: build publish install start stop restart status logs setup

# Build web + server together
build:
	cd server && npm run build:all

# Publish to npm (requires npm login + OTP)
publish:
	cd server && npm version patch --no-git-tag-version && npm publish

# Install globally from local build
install: build
	cd server && npm install -g .

# systemd service management
start:
	systemctl --user start renote-server

stop:
	systemctl --user stop renote-server

restart:
	systemctl --user restart renote-server

status:
	systemctl --user status renote-server

logs:
	journalctl --user -u renote-server -f

# Install systemd service + enable on boot
setup:
	mkdir -p ~/.config/systemd/user
	cp server/renote-server.service ~/.config/systemd/user/
	systemctl --user daemon-reload
	systemctl --user enable renote-server

# Build, install globally, restart service
deploy: install
	systemctl --user restart renote-server
