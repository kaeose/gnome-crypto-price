const St = imports.gi.St;
const GLib = imports.gi.GLib;
imports.gi.versions.Soup = '3.0';
const Soup = imports.gi.Soup;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Cairo = imports.cairo;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const BINANCE_API_URL = 'https://api.binance.com/api/v3/ticker/price';
const BINANCE_KLINE_URL = 'https://api.binance.com/api/v3/klines';
const UPDATE_INTERVAL_SECONDS = 5;

class ChartWidget {
    constructor(title) {
        this.widget = new St.BoxLayout({
            vertical: true,
            style: 'padding: 10px;',
            x_expand: true,
            y_expand: true
        });

        this.titleLabel = new St.Label({
            text: title,
            style: 'font-weight: bold; margin-bottom: 5px;'
        });
        this.widget.add_child(this.titleLabel);

        // Drawing area container
        // Increased width to 360 to accommodate Y-axis labels
        this.drawingArea = new St.Widget({
            width: 360,
            height: 170, 
            style: 'background-color: rgba(0,0,0,0.3); border-radius: 4px;'
        });
        this.widget.add_child(this.drawingArea);

        this.canvas = new Clutter.Canvas();
        this.canvas.set_size(360, 170);
        this.drawingArea.set_content(this.canvas);
        
        this._data = [];

        this.canvas.connect('draw', (canvas, cr, width, height) => {
            this._drawContent(cr, width, height);
        });
    }

    setData(data) {
        this._data = data;
        this.canvas.invalidate();
    }

    _formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    _drawContent(cr, width, height) {
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        if (!this._data || this._data.length === 0) {
            return;
        }

        const BOTTOM_MARGIN = 20; // For X-axis timestamps
        const RIGHT_MARGIN = 60;  // For Y-axis prices
        
        const chartHeight = height - BOTTOM_MARGIN;
        const chartWidth = width - RIGHT_MARGIN;

        // Parse data
        let min = Infinity;
        let max = -Infinity;
        
        const candles = this._data.map(d => {
            const time = d[0];
            const open = parseFloat(d[1]);
            const high = parseFloat(d[2]);
            const low = parseFloat(d[3]);
            const close = parseFloat(d[4]);
            
            if (low < min) min = low;
            if (high > max) max = high;
            
            return { time, open, high, low, close };
        });

        // Add padding to range
        const paddingRange = (max - min) * 0.1;
        let visibleMin, visibleMax;
        
        if (paddingRange === 0) {
            visibleMin = min - 1;
            visibleMax = max + 1;
        } else {
            visibleMin = min - paddingRange;
            visibleMax = max + paddingRange;
        }
        const range = visibleMax - visibleMin;

        // --- Draw Grid Lines & Y-Axis Labels ---
        cr.setLineWidth(0.5);
        cr.setFontSize(11);
        
        // Helper to draw Y-axis grid line and label
        const drawYLabel = (priceVal, yPos, color = [1, 1, 1, 0.4]) => {
            // Grid line (dashed)
            cr.setSourceRGBA(1, 1, 1, 0.1);
            cr.setDash([4, 4], 0); // Dashed line
            cr.moveTo(0, yPos);
            cr.lineTo(chartWidth, yPos);
            cr.stroke();
            cr.setDash([], 0); // Reset dash

            // Text
            cr.setSourceRGBA(...color);
            // Simple formatting: remove trailing zeros if possible, keep precision
            let text = priceVal.toFixed(2); 
            // If price is large (like BTC > 1000), maybe remove decimals or keep 1
            if (priceVal > 1000) text = priceVal.toFixed(0); 
            else if (priceVal > 1) text = priceVal.toFixed(2);

            cr.moveTo(chartWidth + 5, yPos + 4); // +5 padding, +4 to center vertically
            cr.showText(text);
        };

        // 1. Max Price (High)
        const yMax = chartHeight - ((max - visibleMin) / range) * chartHeight;
        drawYLabel(max, yMax, [0.4, 1, 0.4, 0.9]); // Light Greenish

        // 2. Min Price (Low)
        const yMin = chartHeight - ((min - visibleMin) / range) * chartHeight;
        drawYLabel(min, yMin, [1, 0.4, 0.4, 0.9]); // Light Reddish

        // 3. Middle Price (Average)
        const mid = (max + min) / 2;
        const yMid = chartHeight - ((mid - visibleMin) / range) * chartHeight;
        // Only draw mid if it doesn't overlap too much with max or min
        if (Math.abs(yMid - yMax) > 15 && Math.abs(yMid - yMin) > 15) {
             drawYLabel(mid, yMid, [1, 1, 1, 0.7]);
        }

        // --- Draw Candles ---
        const count = candles.length;
        const candleWidth = chartWidth / count;
        const spacing = 2;
        const barWidth = Math.max(1, candleWidth - spacing);

        cr.setLineWidth(1);

        candles.forEach((c, i) => {
            const x = i * candleWidth + spacing / 2;
            const centerX = x + barWidth / 2;

            const yHigh = chartHeight - ((c.high - visibleMin) / range) * chartHeight;
            const yLow = chartHeight - ((c.low - visibleMin) / range) * chartHeight;
            const yOpen = chartHeight - ((c.open - visibleMin) / range) * chartHeight;
            const yClose = chartHeight - ((c.close - visibleMin) / range) * chartHeight;

            const isUp = c.close >= c.open;
            if (isUp) {
                cr.setSourceRGBA(0, 1, 0, 1); // Green
            } else {
                cr.setSourceRGBA(1, 0, 0, 1); // Red
            }

            // Wick
            cr.moveTo(centerX, yHigh);
            cr.lineTo(centerX, yLow);
            cr.stroke();

            // Body
            let bodyTop = Math.min(yOpen, yClose);
            let bodyHeight = Math.abs(yOpen - yClose);
            if (bodyHeight < 1) bodyHeight = 1;

            cr.rectangle(x, bodyTop, barWidth, bodyHeight);
            cr.fill();
        });

        // --- Draw X-Axis Time Labels ---
        if (candles.length > 0) {
            const startTime = this._formatTime(candles[0].time);
            const endTime = this._formatTime(candles[candles.length - 1].time);

            cr.setSourceRGBA(1, 1, 1, 0.8);
            cr.setFontSize(11);

            // Draw Start Time
            cr.moveTo(5, height - 5);
            cr.showText(startTime);

            // Draw End Time
            // Align with the end of the chart area, not the full canvas width
            const extents = cr.textExtents(endTime);
            cr.moveTo(chartWidth - extents.width - 5, height - 5);
            cr.showText(endTime);
        }
        
        // Vertical separator line between chart and labels
        cr.setSourceRGBA(1, 1, 1, 0.2);
        cr.setLineWidth(1);
        cr.moveTo(chartWidth, 0);
        cr.lineTo(chartWidth, chartHeight);
        cr.stroke();
    }
}

class CryptoPriceExtension {
    constructor() {
        this.uuid = Me.metadata.uuid;
        this.metadata = Me.metadata;
        this._indicator = null;
        this._box = null;
        this._label = null;
        this._soupSession = null;
        this._timeout = null;
        this._menuSignal = null;
        this._btcChart = null;
        this._ethChart = null;
    }

    enable() {
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        this._box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        
        this._label = new St.Label({
            text: 'Loading...',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-family: monospace; padding-left: 5px; padding-right: 5px;'
        });

        this._box.add_child(this._label);
        this._indicator.add_child(this._box);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._soupSession = new Soup.Session();

        this._setupMenu();
        
        this._updatePrices();
    }

    _setupMenu() {
        // BTC Chart
        this._btcChart = new ChartWidget('BTC/USDT (1m)');
        const btcItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        btcItem.actor.add_child(this._btcChart.widget);
        this._indicator.menu.addMenuItem(btcItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ETH Chart
        this._ethChart = new ChartWidget('ETH/USDT (1m)');
        const ethItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        ethItem.actor.add_child(this._ethChart.widget);
        this._indicator.menu.addMenuItem(ethItem);

        // Fetch on open
        this._menuSignal = this._indicator.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this._updateCharts();
            }
        });
    }

    disable() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }

        if (this._menuSignal && this._indicator) {
            this._indicator.menu.disconnect(this._menuSignal);
            this._menuSignal = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        
        if (this._soupSession) {
            this._soupSession.abort();
            this._soupSession = null;
        }
        
        this._box = null;
        this._label = null;
        this._btcChart = null;
        this._ethChart = null;
    }

    async _fetchPrice(symbol) {
        const message = Soup.Message.new('GET', `${BINANCE_API_URL}?symbol=${symbol}`);
        
        return new Promise((resolve, reject) => {
            this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (message.status_code !== 200) {
                        reject(new Error(`HTTP Status ${message.status_code}`));
                        return;
                    }
                    const decoder = new TextDecoder('utf-8');
                    const json = JSON.parse(decoder.decode(bytes.get_data()));
                    if (!json.price) throw new Error('No price');
                    resolve(parseFloat(json.price));
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async _fetchKlines(symbol) {
        const url = `${BINANCE_KLINE_URL}?symbol=${symbol}&interval=1m&limit=60`;
        const message = Soup.Message.new('GET', url);
        
        return new Promise((resolve, reject) => {
            this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (message.status_code !== 200) {
                        reject(new Error(`HTTP Status ${message.status_code}`));
                        return;
                    }
                    const decoder = new TextDecoder('utf-8');
                    const json = JSON.parse(decoder.decode(bytes.get_data()));
                    resolve(json); 
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async _updatePrices() {
        try {
            const [btcPrice, ethPrice] = await Promise.all([
                this._fetchPrice('BTCUSDT'),
                this._fetchPrice('ETHUSDT')
            ]);

            const btcFormatted = Math.round(btcPrice).toLocaleString();
            const ethFormatted = Math.round(ethPrice).toLocaleString();

            if (this._label) {
                this._label.set_text(`${btcFormatted} | ${ethFormatted}`);
                this._label.opacity = 150;
                this._label.ease({
                    opacity: 255,
                    duration: 500,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        } catch (e) {
            // Error handling
        } finally {
            if (this._soupSession) {
                this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_SECONDS, () => {
                    this._updatePrices();
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    async _updateCharts() {
        try {
            const [btcData, ethData] = await Promise.all([
                this._fetchKlines('BTCUSDT'),
                this._fetchKlines('ETHUSDT')
            ]);

            if (this._btcChart) this._btcChart.setData(btcData);
            if (this._ethChart) this._ethChart.setData(ethData);
        } catch (e) {
            global.log(`[CryptoPrice] Chart Error: ${e.message}`);
        }
    }
}

function init() {
    return new CryptoPriceExtension();
}