#!/bin/bash

UUID="crypto-price@kaeose.me"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing extension to $INSTALL_DIR..."

mkdir -p "$INSTALL_DIR"
cp extension.js metadata.json "$INSTALL_DIR"

echo "Installation complete."
echo "Please restart GNOME Shell (Alt+F2, then 'r' on X11, or logout/login on Wayland) and enable the extension."
