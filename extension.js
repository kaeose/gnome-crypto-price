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
            style: 'font-weight: bold; margin-bottom: 2px;'
        });
        this.widget.add_child(this.titleLabel);

        this.detailsLabel = new St.Label({
            text: ' ',
            style: 'font-size: 10px; color: #ccc; margin-bottom: 5px; font-family: monospace;'
        });
        this.widget.add_child(this.detailsLabel);

        // Constants
        this.WIDTH = 360;
        this.HEIGHT = 170;
        this.RIGHT_MARGIN = 60;
        this.BOTTOM_MARGIN = 20;

        // Drawing area container
        this.drawingArea = new St.Widget({
            width: this.WIDTH,
            height: this.HEIGHT, 
            style: 'background-color: rgba(0,0,0,0.3); border-radius: 4px;',
            reactive: true
        });
        this.widget.add_child(this.drawingArea);

        this.canvas = new Clutter.Canvas();
        this.canvas.set_size(this.WIDTH, this.HEIGHT);
        this.drawingArea.set_content(this.canvas);
        
        this._data = [];
        this._candles = [];
        this._min = 0;
        this._max = 0;
        this._maxVol = 0;
        this._interval = '1m';
        this._hoverIndex = -1;

        this.canvas.connect('draw', (canvas, cr, width, height) => {
            this._drawContent(cr, width, height);
        });

        this.drawingArea.connect('motion-event', (actor, event) => {
            this._handleMotion(event);
            return Clutter.EVENT_PROPAGATE;
        });

        this.drawingArea.connect('leave-event', () => {
            if (this._onHoverCallback) {
                this._onHoverCallback(-1);
            } else {
                this.setHover(-1);
            }
        });
    }

    setTitle(title) {
        this.titleLabel.set_text(title);
    }

    setInterval(interval) {
        this._interval = interval;
    }

    setData(data) {
        this._data = data;
        this._processData();
        this.canvas.invalidate();
    }

    _processData() {
        if (!this._data || this._data.length === 0) {
            this._candles = [];
            return;
        }

        let min = Infinity;
        let max = -Infinity;
        let maxVol = 0;

        this._candles = this._data.map(d => {
            const time = d[0];
            const open = parseFloat(d[1]);
            const high = parseFloat(d[2]);
            const low = parseFloat(d[3]);
            const close = parseFloat(d[4]);
            const vol = parseFloat(d[5]);

            if (low < min) min = low;
            if (high > max) max = high;
            if (vol > maxVol) maxVol = vol;

            return { time, open, high, low, close, vol };
        });

        this._min = min;
        this._max = max;
        this._maxVol = maxVol;
    }

    setOnHover(callback) {
        this._onHoverCallback = callback;
    }

    setHover(index) {
        if (this._hoverIndex === index) return;
        
        this._hoverIndex = index;
        
        if (index === -1 || !this._candles || index >= this._candles.length) {
            this.detailsLabel.set_text(' ');
            this.canvas.invalidate();
            return;
        }

        const c = this._candles[index];
        let timeStr = this._formatTime(c.time, true);
        
        // Hide time for daily or longer intervals
        if (['1d', '1w', '1M'].includes(this._interval)) {
            timeStr = timeStr.split(' ')[0]; // Take only the date part
        }

        // Format numbers for display
        const fmt = (n) => n > 1000 ? n.toFixed(1) : n.toFixed(2);
        const volFmt = (n) => {
            if (n >= 1000000) return (n/1000000).toFixed(2) + 'M';
            if (n >= 1000) return (n/1000).toFixed(2) + 'K';
            return n.toFixed(2);
        };

        const changePct = ((c.close - c.open) / c.open * 100).toFixed(2);
        const rangePct = ((c.high - c.low) / c.low * 100).toFixed(2);
        const sign = c.close >= c.open ? '+' : '';

        const txt = `${timeStr} | C:${fmt(c.close)} (${sign}${changePct}%) [${rangePct}%] V:${volFmt(c.vol)}`;
        this.detailsLabel.set_text(txt);
        this.canvas.invalidate();
    }

    _handleMotion(event) {
        if (!this._candles || this._candles.length === 0) return;

        const [x, y] = event.get_coords();
        const [success, localX, localY] = this.drawingArea.transform_stage_point(x, y);

        if (!success) return;

        const chartWidth = this.WIDTH - this.RIGHT_MARGIN;
        if (localX > chartWidth) return; // Mouse over Y-axis labels

        const count = this._candles.length;
        const candleWidth = chartWidth / count;
        
        let index = Math.floor(localX / candleWidth);
        if (index < 0) index = 0;
        if (index >= count) index = count - 1;

        if (this._onHoverCallback) {
            this._onHoverCallback(index);
        } else {
            this.setHover(index);
        }
    }

    _formatTime(timestamp, detailed = false) {
        const date = new Date(timestamp);
        const M = (date.getMonth() + 1).toString().padStart(2, '0');
        const D = date.getDate().toString().padStart(2, '0');
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const yy = date.getFullYear().toString().slice(-2);

        if (detailed) {
             return `${yy}-${M}-${D} ${h}:${m}`;
        }

        if (['1m', '5m', '15m', '30m'].includes(this._interval)) {
            return `${h}:${m}`;
        } else if (['1h', '4h'].includes(this._interval)) {
            return `${M}-${D} ${h}:${m}`;
        } else {
            return `${yy}-${M}-${D}`;
        }
    }

    _drawContent(cr, width, height) {
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        if (!this._candles || this._candles.length === 0) {
            cr.setSourceRGBA(1, 1, 1, 0.5);
            cr.setFontSize(14);
            const text = "Loading...";
            const extents = cr.textExtents(text);
            cr.moveTo((width - extents.width) / 2, (height + extents.height) / 2);
            cr.showText(text);
            return;
        }

        const chartHeight = height - this.BOTTOM_MARGIN;
        const chartWidth = width - this.RIGHT_MARGIN;
        
        const min = this._min;
        const max = this._max;
        const maxVol = this._maxVol;

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
            let text = priceVal.toFixed(2); 
            if (priceVal > 1000) text = priceVal.toFixed(0); 
            else if (priceVal > 1) text = priceVal.toFixed(2);

            cr.moveTo(chartWidth + 5, yPos + 4); 
            cr.showText(text);
        };

        // 1. Max Price (High)
        const yMax = chartHeight - ((max - visibleMin) / range) * chartHeight;
        drawYLabel(max, yMax, [0.4, 1, 0.4, 0.9]); // Light Greenish

        // 2. Min Price (Low)
        const yMin = chartHeight - ((min - visibleMin) / range) * chartHeight;
        drawYLabel(min, yMin, [1, 0.4, 0.4, 0.9]); // Light Reddish

        // 3. Current Price (Latest Close)
        const current = this._candles[this._candles.length - 1].close;
        const yCurrent = chartHeight - ((current - visibleMin) / range) * chartHeight;
        
        if (Math.abs(yCurrent - yMax) > 15 && Math.abs(yCurrent - yMin) > 15) {
             drawYLabel(current, yCurrent, [1, 1, 1, 0.9]);
        }

        // --- Draw Candles & Volume ---
        const count = this._candles.length;
        const candleWidth = chartWidth / count;
        const spacing = 2;
        const barWidth = Math.max(1, candleWidth - spacing);

        this._candles.forEach((c, i) => {
            const x = i * candleWidth + spacing / 2;
            const centerX = x + barWidth / 2;
            const isUp = c.close >= c.open;

            // --- Draw Volume ---
            if (maxVol > 0) {
                const volHeight = (c.vol / maxVol) * (chartHeight * 0.2); 
                const volY = chartHeight - volHeight;
                
                if (isUp) {
                    cr.setSourceRGBA(0, 1, 0, 0.3); 
                } else {
                    cr.setSourceRGBA(1, 0, 0, 0.3); 
                }
                
                cr.rectangle(x, volY, barWidth, volHeight);
                cr.fill();
            }

            // --- Draw Candle ---
            const yHigh = chartHeight - ((c.high - visibleMin) / range) * chartHeight;
            const yLow = chartHeight - ((c.low - visibleMin) / range) * chartHeight;
            const yOpen = chartHeight - ((c.open - visibleMin) / range) * chartHeight;
            const yClose = chartHeight - ((c.close - visibleMin) / range) * chartHeight;

            if (isUp) {
                cr.setSourceRGBA(0, 1, 0, 1); 
            } else {
                cr.setSourceRGBA(1, 0, 0, 1); 
            }

            cr.setLineWidth(1);

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

        // --- Draw Crosshair ---
        if (this._hoverIndex >= 0 && this._hoverIndex < this._candles.length) {
            const c = this._candles[this._hoverIndex];
            const x = this._hoverIndex * candleWidth + spacing / 2;
            const centerX = x + barWidth / 2;
            const yClose = chartHeight - ((c.close - visibleMin) / range) * chartHeight;

            cr.setLineWidth(1);
            cr.setSourceRGBA(1, 1, 1, 0.4); 
            
            // Vertical line
            cr.setDash([4, 4], 0);
            cr.moveTo(centerX, 0);
            cr.lineTo(centerX, chartHeight);
            cr.stroke();

            // Horizontal line (at Close price)
            cr.setDash([], 0); 
            cr.moveTo(0, yClose);
            cr.lineTo(chartWidth, yClose);
            cr.stroke();
        }

        // --- Draw X-Axis Time Labels ---
        if (this._candles.length > 0) {
            const startTime = this._formatTime(this._candles[0].time);
            const endTime = this._formatTime(this._candles[this._candles.length - 1].time);

            cr.setSourceRGBA(1, 1, 1, 0.8);
            cr.setFontSize(11);

            cr.moveTo(5, height - 5);
            cr.showText(startTime);

            const extents = cr.textExtents(endTime);
            cr.moveTo(chartWidth - extents.width - 5, height - 5);
            cr.showText(endTime);
        }
        
        // Vertical separator line
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
        this._currentInterval = '1m';
        this._intervalItems = new Map();
        this._intervalDots = new Map();
    }

    enable() {
        this._intervalItems = new Map();
        this._intervalDots = new Map();

        this._indicator = new PanelMenu.Button(0.5, this.metadata.name, false);

        this._box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        
        this._label = new St.Label({
            text: 'Loading...',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-family: monospace; padding-left: 5px; padding-right: 5px;'
        });

        this._box.add_child(this._label);
        this._indicator.add_child(this._box);

        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');

        this._soupSession = new Soup.Session();

        this._setupMenu();
        
        this._updatePrices();
    }

        _setupMenu() {
            // Interval Tabs
            const tabItem = new PopupMenu.PopupMenuSection();
            const tabBox = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                style: 'padding: 10px; spacing: 6px;'
            });
            tabItem.actor.add_child(tabBox);
            this._indicator.menu.addMenuItem(tabItem);
    
            const intervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
            
            for (let i = 0; i < intervals.length; i += 5) {
                const row = new St.BoxLayout({ x_expand: true, style: 'spacing: 6px;' });
                const rowIntervals = intervals.slice(i, i + 5);
                
                rowIntervals.forEach(interval => {
                    const btn = new St.Button({
                        x_expand: true,
                        can_focus: true,
                        style_class: 'button'
                    });

                    const btnContent = new St.BoxLayout({
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER
                    });

                    const label = new St.Label({
                        text: interval,
                        y_align: Clutter.ActorAlign.CENTER
                    });

                    const dot = new St.Widget({
                        width: 6,
                        height: 6,
                        visible: false,
                        style: 'background-color: #2ec27e; border-radius: 99px; margin-left: 4px; margin-bottom: 2px; vertical-align: middle;',
                        y_align: Clutter.ActorAlign.CENTER
                    });

                    btnContent.add_child(label);
                    btnContent.add_child(dot);
                    btn.set_child(btnContent);
    
                    btn.connect('clicked', () => {
                        this._currentInterval = interval;
                        this._updateTabStyles();
                        this._updateChartTitles();
    
                        if (this._klineCache && this._klineCache[interval]) {
                            if (this._btcChart) this._btcChart.setData(this._klineCache[interval].btc);
                            if (this._ethChart) this._ethChart.setData(this._klineCache[interval].eth);
                        } else {
                            if (this._btcChart) this._btcChart.setData([]);
                            if (this._ethChart) this._ethChart.setData([]);
                        }

                        this._updateCharts();
                    });
    
                    this._intervalItems.set(interval, btn);
                    this._intervalDots.set(interval, dot);
                    row.add_child(btn);
                });
                tabBox.add_child(row);
            }
    
            // Set initial styles
            this._updateTabStyles();
    
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    
            // BTC Chart
            this._btcChart = new ChartWidget(`BTC/USDT (${this._currentInterval})`);
            const btcItem = new PopupMenu.PopupMenuSection();
            btcItem.actor.add_child(this._btcChart.widget);
            this._indicator.menu.addMenuItem(btcItem);
    
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    
            // ETH Chart
            this._ethChart = new ChartWidget(`ETH/USDT (${this._currentInterval})`);
            const ethItem = new PopupMenu.PopupMenuSection();
            ethItem.actor.add_child(this._ethChart.widget);
            this._indicator.menu.addMenuItem(ethItem);

            // Synchronize Hover
            const sharedHover = (index) => {
                if (this._btcChart) this._btcChart.setHover(index);
                if (this._ethChart) this._ethChart.setHover(index);
            };
            this._btcChart.setOnHover(sharedHover);
            this._ethChart.setOnHover(sharedHover);
    
            // Fetch on open
            this._menuSignal = this._indicator.menu.connect('open-state-changed', (menu, open) => {
                if (open) {
                    this._updateCharts();
                }
            });
        }
    
        _updateTabStyles() {
            const ACTIVE_STYLE = 'padding: 4px 0; border-radius: 6px; background-color: #3584e4; color: white; font-weight: bold; border: 1px solid rgba(0,0,0,0.2);';
            const INACTIVE_STYLE = 'padding: 4px 0; border-radius: 6px; background-color: rgba(255, 255, 255, 0.1); color: #eee; font-weight: normal; border: 1px solid transparent;';
    
            this._intervalItems.forEach((btn, interval) => {
                if (interval === this._currentInterval) {
                    btn.set_style(ACTIVE_STYLE);
                } else {
                    btn.set_style(INACTIVE_STYLE);
                }
            });
        }
    _updateChartTitles() {
        if (this._btcChart) {
            this._btcChart.setTitle(`BTC/USDT (${this._currentInterval})`);
            this._btcChart.setInterval(this._currentInterval);
        }
        if (this._ethChart) {
            this._ethChart.setTitle(`ETH/USDT (${this._currentInterval})`);
            this._ethChart.setInterval(this._currentInterval);
        }
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
        this._intervalItems.clear();
        this._intervalItems = null;
        this._intervalDots.clear();
        this._intervalDots = null;
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

    async _fetchKlines(symbol, interval) {
        const url = `${BINANCE_KLINE_URL}?symbol=${symbol}&interval=${interval}&limit=60`;
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
        const interval = this._currentInterval;
        const dot = this._intervalDots ? this._intervalDots.get(interval) : null;
        
        if (dot) dot.show();

        try {
            const [btcData, ethData] = await Promise.all([
                this._fetchKlines('BTCUSDT', interval),
                this._fetchKlines('ETHUSDT', interval)
            ]);

            if (!this._klineCache) this._klineCache = {};
            this._klineCache[interval] = { btc: btcData, eth: ethData };

            if (this._currentInterval === interval) {
                if (this._btcChart) this._btcChart.setData(btcData);
                if (this._ethChart) this._ethChart.setData(ethData);
            }
        } catch (e) {
            global.log(`[CryptoPrice] Chart Error: ${e.message}`);
        } finally {
            if (dot) dot.hide();
        }
    }
}

function init() {
    return new CryptoPriceExtension();
}
