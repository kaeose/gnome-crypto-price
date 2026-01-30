# Gnome Crypto Price Extension

A simple GNOME Shell extension that displays real-time Bitcoin (BTC) and Ethereum (ETH) prices from Binance in the top panel.

## Features

- **Real-time Updates:** Fetches prices every 5 seconds.
- **Visual Feedback:** Subtle fade-in animation when prices update.
- **Reliable:** Ensures the previous request completes before scheduling the next one to avoid overlap.

## Installation

1. Make sure you have the necessary dependencies (GNOME Shell).
2. Run the install script:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```
3. Restart GNOME Shell:
   - **X11:** Press `Alt + F2`, type `r`, and hit Enter.
   - **Wayland:** Log out and log back in.
4. Enable the extension using **Extensions** app or **Extension Manager**.

## Development

- `extension.js`: Main logic code.
- `metadata.json`: Extension metadata.
