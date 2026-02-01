# Gnome Crypto Price Extension

A GNOME Shell extension that displays real-time Bitcoin (BTC) and Ethereum (ETH) prices in the top panel, with detailed 1-minute K-line charts available on click.

## Features

- **Real-time Monitoring:** 
  - Displays current BTC and ETH prices from Binance in the top panel.
  - Updates automatically every 5 seconds.
  - Visual fade-in effect on price updates.

- **Interactive Charts:**
  - Click the panel indicator to open the menu.
  - **1-Minute K-line Charts:** detailed candlestick charts for the last hour (60 minutes).
  - **Local Timestamps:** X-axis shows start and end times in your local timezone.
  - **Price Levels:** Y-axis displays Maximum, Minimum, and Average prices with grid lines.
  - Color-coded candlesticks (Green for up, Red for down).

## Installation

1. **Prerequisites:** 
   - GNOME Shell 43 or 44.
   - `cairo` (usually pre-installed with GNOME).

2. **Install:**
   Clone the repository and run the install script:
   ```bash
   git clone <repository-url>
   cd gnome-crypto-price
   chmod +x install.sh
   ./install.sh
   ```

3. **Activate:**
   - Restart GNOME Shell:
     - **X11:** Press `Alt + F2`, type `r`, and hit Enter.
     - **Wayland:** Log out and log back in.
   - Enable the extension via the **Extensions** app or **Extension Manager**.

## Development

- `extension.js`: Core logic including the `ChartWidget` class for drawing Cairo-based charts.
- `metadata.json`: Extension metadata and configuration.

## License

MIT