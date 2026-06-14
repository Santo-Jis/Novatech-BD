import axios from '../api/axios';

let intervalId = null;
let alerted    = false;
let THRESHOLD  = 20;

export const BatteryMonitor = {
    async start() {
        if (!('getBattery' in navigator)) return;
        try {
            const battery = await navigator.getBattery();
            const check   = async () => {
                const level = Math.round(battery.level * 100);
                if (level <= THRESHOLD && !alerted && !battery.charging) {
                    try {
                        await axios.post('/battery/alert', { level });
                        alerted = true;
                        setTimeout(() => { alerted = false; }, 60 * 60 * 1000);
                    } catch { /* silent */ }
                }
                if (battery.charging) alerted = false;
            };
            check();
            intervalId = setInterval(check, 5 * 60 * 1000);
            battery.addEventListener('levelchange',    check);
            battery.addEventListener('chargingchange', check);
        } catch { /* not supported */ }
    },
    stop()              { if (intervalId) { clearInterval(intervalId); intervalId = null; } },
    setThreshold(pct)   { THRESHOLD = pct; },
};
