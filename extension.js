const St = imports.gi.St;
const GLib = imports.gi.GLib;
imports.gi.versions.Soup = '3.0';
const Soup = imports.gi.Soup;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const BINANCE_API_URL = 'https://api.binance.com/api/v3/ticker/price';
const UPDATE_INTERVAL_SECONDS = 5;

class CryptoPriceExtension {
    constructor() {
        this.uuid = Me.metadata.uuid;
        this.metadata = Me.metadata;
        this._indicator = null;
        this._box = null;
        this._label = null;
        this._soupSession = null;
        this._timeout = null;
    }

    enable() {
        // Create a PanelMenu Button
        // 0.0 aligns the menu to the left of the button (standard for status area)
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        // Create the layout for the button content
        this._box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        
        this._label = new St.Label({
            text: 'Loading...',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-family: monospace; padding-left: 5px; padding-right: 5px;'
        });

        this._box.add_child(this._label);
        this._indicator.add_child(this._box);

        // Add to the top panel
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._soupSession = new Soup.Session();
        
        // Start the update loop
        this._updatePrices();
    }

    disable() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
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
                    const responseString = decoder.decode(bytes.get_data());
                    const json = JSON.parse(responseString);
                    
                    if (!json.price) {
                        reject(new Error('Invalid response: missing price'));
                        return;
                    }

                    const price = parseFloat(json.price);
                    if (isNaN(price)) {
                         reject(new Error('Invalid price value'));
                         return;
                    }

                    resolve(price);
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
                
                // Visual feedback: simple fade-in effect
                this._label.opacity = 150;
                this._label.ease({
                    opacity: 255,
                    duration: 500,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        } catch (e) {
            global.log(`[${this.uuid}] Error fetching prices: ${e.message}`);
            if (this._label) {
                this._label.set_text('Error');
            }
        } finally {
            // Only schedule the next update if the session (extension) is still active
            if (this._soupSession) {
                this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_SECONDS, () => {
                    this._updatePrices();
                    return GLib.SOURCE_REMOVE; // Run once
                });
            }
        }
    }
}

function init() {
    return new CryptoPriceExtension();
}
