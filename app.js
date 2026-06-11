// Space Weather Telemetry Station - Core Application Logic

// Application State
const state = {
    // Current telemetry readings
    speed: 400.0,          // Solar wind speed (km/s)
    density: 5.0,          // Proton density (p/cm3)
    bz: 0.0,               // IMF Bz index (nT)
    temperature: 150000.0, // Plasma temperature (K)
    time: null,            // Timestamp of reading

    // API stats
    apiStatus: 'CONNECTING', // CONNECTING, ONLINE, DISCONNECTED
};

// UI Elements
const stationTimeEl = document.getElementById('station-time');
const apiStatusEl = document.getElementById('api-status');

// Overlay elements
const overlayBz = document.getElementById('overlay-bz');
const overlaySpeed = document.getElementById('overlay-speed');
const overlayDeflection = document.getElementById('overlay-deflection');
const overlayFps = document.getElementById('overlay-fps');

// Table values
const valSpeed = document.getElementById('val-speed');
const valDensity = document.getElementById('val-density');
const valBz = document.getElementById('val-bz');
const valTemp = document.getElementById('val-temp');

// Table states
const stateSpeed = document.getElementById('state-speed');
const stateDensity = document.getElementById('state-density');
const stateBz = document.getElementById('state-bz');
const stateTemp = document.getElementById('state-temp');

// Logs windows
const solarWindLog = document.getElementById('solar-wind-log');
const alertsLogWindow = document.getElementById('alerts-log-window');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Canvas Initialization
const canvas = document.getElementById('magnetosphere-canvas');
const ctx = canvas.getContext('2d');

let lastFrameTime = performance.now();
let fpsCount = 0;
let fpsDisplay = 60.0;
let particleList = [];

// Initialize Canvas Size
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Time Update Loop
function updateStationTime() {
    const now = new Date();
    stationTimeEl.textContent = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}
setInterval(updateStationTime, 1000);
updateStationTime();

// Add logs helper
function addLog(windowEl, message, type = 'info') {
    const line = document.createElement('div');
    line.className = 'log-line';
    const timestamp = new Date().toISOString().replace('T', ' ').substring(11, 19);
    
    if (type === 'dim') line.classList.add('text-dim');
    else if (type === 'warning') line.classList.add('text-warning');
    else if (type === 'danger') line.classList.add('text-danger');
    else if (type === 'success') line.classList.add('text-success');
    
    line.textContent = `[${timestamp}] ${message}`;
    windowEl.appendChild(line);
    windowEl.scrollTop = windowEl.scrollHeight;
    
    // Keep window logs clean limit to 100
    while (windowEl.children.length > 100) {
        windowEl.removeChild(windowEl.firstChild);
    }
}

// Tab Switching Routing
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        
        addLog(solarWindLog, `Navigated view mode: [${tabId.toUpperCase()}]`, 'dim');
    });
});

// Particle Definition
class SolarParticle {
    constructor(width, height) {
        this.reset(width, height);
        // Randomize starting position X along the screen width
        this.x = Math.random() * width;
    }

    reset(width, height) {
        this.x = 0;
        this.y = Math.random() * height;
        this.originalY = this.y;
        this.alpha = 0.4 + Math.random() * 0.6;
        this.radius = 1 + Math.random() * 2;
    }

    update(width, height, speed, EarthCenter, magnetopauseSubsolar) {
        // Speed scaling
        const step = (speed / 100) * 1.5;
        this.x += step;

        // Bending math around Earth's magnetopause
        const dx = EarthCenter.x - this.x;
        const dy = this.y - EarthCenter.y;

        // Define a boundary curve (parabola/hyperbola) for magnetopause
        const curvature = 350; // controls how broad the magnetospheric sheath is
        const boundaryX = magnetopauseSubsolar - (dy * dy) / curvature;

        // If particle crosses boundary, deflect it along the boundary
        if (this.x > boundaryX && dx > 0) {
            const pushDir = this.y > EarthCenter.y ? 1 : -1;
            this.y += step * 0.8 * pushDir;
            this.x += step * 0.2;
        }

        // Reset if goes off canvas
        if (this.x > width || this.y < 0 || this.y > height) {
            this.reset(width, height);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = `rgba(51, 255, 51, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Instantiate particles
const MAX_PARTICLES = 120;
for (let i = 0; i < MAX_PARTICLES; i++) {
    particleList.push(new SolarParticle(800, 500));
}

// 60FPS Simulation Loop
function animationLoop(timestamp) {
    // Calculate FPS
    const elapsed = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    fpsCount++;
    if (timestamp % 1000 < elapsed) {
        fpsDisplay = fpsCount;
        fpsCount = 0;
        overlayFps.textContent = fpsDisplay.toFixed(1);
    }

    // Dynamic Variables (read strictly from NOAA-updated state)
    const currentSpeed = state.speed;
    const currentBz = state.bz;

    // Get current client layout width/height
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    // Setup coordinates relative to layout size
    const EarthCenter = {
        x: w * 0.65,
        y: h * 0.5
    };
    const EarthRadius = 24;

    // Magnetopause subsolar compression point
    const compressionFactor = (currentSpeed - 400) / 600; // range 0 to 1
    const erosionFactor = currentBz < 0 ? (Math.abs(currentBz) / 25) * 30 : 0;
    const baseSubsolarDistance = 140; // normal distance in pixels
    const magnetopauseSubsolar = EarthCenter.x - (baseSubsolarDistance - (compressionFactor * 40) - erosionFactor);

    // Dynamic Deflection Efficiency label indicator
    const deflectionEff = Math.max(0, 100 - (compressionFactor * 30) - (currentBz < 0 ? Math.abs(currentBz) * 2.5 : 0));
    overlayDeflection.textContent = `${deflectionEff.toFixed(1)}%`;
    if (deflectionEff < 65) {
        overlayDeflection.className = 'value text-danger';
    } else if (deflectionEff < 85) {
        overlayDeflection.className = 'value text-warning';
    } else {
        overlayDeflection.className = 'value';
    }

    // Clear Canvas with trace trace-fade look
    ctx.fillStyle = 'rgba(3, 8, 4, 0.25)';
    ctx.fillRect(0, 0, w, h);

    // Draw Vector Coordinate Grid Lines (Retro Phosphor look)
    ctx.strokeStyle = 'rgba(0, 71, 6, 0.25)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    
    // Vertical grid lines
    for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    // Horizontal grid lines
    for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Update & Draw Solar Wind Particles
    particleList.forEach(particle => {
        particle.update(w, h, currentSpeed, EarthCenter, magnetopauseSubsolar);
        particle.draw(ctx);
    });

    // Draw Bow Shock & Magnetopause boundary line
    ctx.save();
    ctx.strokeStyle = 'rgba(51, 255, 51, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let dy = -h * 0.5; dy < h * 0.5; dy += 5) {
        const yCoord = EarthCenter.y + dy;
        const curvature = 320;
        const xCoord = magnetopauseSubsolar - (dy * dy) / curvature;
        if (dy === -h * 0.5) ctx.moveTo(xCoord, yCoord);
        else ctx.lineTo(xCoord, yCoord);
    }
    ctx.stroke();
    ctx.restore();

    // Draw Earth Magnetosphere Vector Lines (Bezier loops)
    ctx.save();
    ctx.strokeStyle = 'rgba(51, 255, 51, 0.7)';
    ctx.lineWidth = 1.2;

    const loops = [0.4, 0.7, 1.0, 1.3, 1.7, 2.1, 2.5];
    loops.forEach((scale) => {
        const bzAngleSkew = (currentBz / 25) * 0.15; // skew control points

        // DAY-SIDE loops (Left side, compressed)
        ctx.beginPath();
        ctx.moveTo(EarthCenter.x, EarthCenter.y - EarthRadius);
        
        const dayCompression = Math.max(30, (magnetopauseSubsolar - EarthCenter.x) * -0.65 * scale);
        const cp1x = EarthCenter.x - dayCompression;
        const cp1y = EarthCenter.y - (45 * scale) + (bzAngleSkew * 100);

        const cp2x = EarthCenter.x - dayCompression;
        const cp2y = EarthCenter.y + (45 * scale) + (bzAngleSkew * 100);

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, EarthCenter.x, EarthCenter.y + EarthRadius);
        ctx.stroke();

        // NIGHT-SIDE loops (Right side, stretched tail)
        ctx.beginPath();
        ctx.moveTo(EarthCenter.x, EarthCenter.y - EarthRadius);

        const tailLength = 220 * scale;
        const tcp1x = EarthCenter.x + (tailLength * 0.5);
        const tcp1y = EarthCenter.y - (60 * scale) - (bzAngleSkew * 80);

        const tcp2x = EarthCenter.x + tailLength;
        const tcp2y = EarthCenter.y + (bzAngleSkew * 80);

        ctx.bezierCurveTo(tcp1x, tcp1y, tcp2x, tcp2y, EarthCenter.x, EarthCenter.y + EarthRadius);
        ctx.stroke();
    });
    ctx.restore();

    // Draw Earth
    ctx.save();
    const shadowGrad = ctx.createRadialGradient(EarthCenter.x, EarthCenter.y, EarthRadius - 5, EarthCenter.x, EarthCenter.y, EarthRadius + 8);
    shadowGrad.addColorStop(0, 'rgba(3, 8, 4, 1)');
    shadowGrad.addColorStop(0.6, 'rgba(51, 255, 51, 0.3)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#030804';
    ctx.strokeStyle = 'var(--primary-color)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(51, 255, 51, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius, -Math.PI / 6, Math.PI / 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius, 5 * Math.PI / 6, 7 * Math.PI / 6);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(51, 255, 51, 0.6)';
    ctx.beginPath();
    ctx.moveTo(EarthCenter.x, EarthCenter.y - EarthRadius - 6);
    ctx.lineTo(EarthCenter.x, EarthCenter.y + EarthRadius + 6);
    ctx.stroke();

    ctx.restore();

    requestAnimationFrame(animationLoop);
}

// Start animation loop
requestAnimationFrame(animationLoop);

addLog(solarWindLog, "Canvas animation renderer loaded at 60 FPS.", "success");
addLog(solarWindLog, "Vector overlays online. Awaiting data bridge activation.", "info");

// --- NOAA API Bridge & Telemetry Parser ---

const PLASMA_URL = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json';
const MAG_URL = 'https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json';

// Detect alert state
function checkSpaceWeatherAlerts(speed, bz) {
    let alertLevel = 'G0';
    let statusText = 'STABLE';
    let type = 'success';

    if (bz <= -20 || speed >= 900) {
        alertLevel = 'G5';
        statusText = 'EXTREME GEOMAGNETIC STORM';
        type = 'danger';
    } else if (bz <= -10 || speed >= 700) {
        alertLevel = 'G3';
        statusText = 'STRONG GEOMAGNETIC STORM';
        type = 'danger';
    } else if (bz <= -5 || speed >= 500) {
        alertLevel = 'G1';
        statusText = 'MINOR GEOMAGNETIC STORM';
        type = 'warning';
    }

    return { alertLevel, statusText, type };
}

// Map value state descriptions
function getValueState(value, type) {
    if (type === 'speed') {
        if (value > 750) return { text: 'CRITICAL', color: 'var(--danger-color)' };
        if (value > 500) return { text: 'ELEVATED', color: 'var(--warning-color)' };
        return { text: 'NOMINAL', color: 'var(--primary-color)' };
    }
    if (type === 'density') {
        if (value > 15) return { text: 'HIGH', color: 'var(--warning-color)' };
        return { text: 'NOMINAL', color: 'var(--primary-color)' };
    }
    if (type === 'bz') {
        if (value < -10) return { text: 'ACTIVE', color: 'var(--danger-color)' };
        if (value < -4) return { text: 'UNSTABLE', color: 'var(--warning-color)' };
        return { text: 'STABLE', color: 'var(--primary-color)' };
    }
    return { text: 'NOMINAL', color: 'var(--primary-color)' };
}

// Update Dynamic Status Translation summary block
function updateStatusSummary(speed, density, bz) {
    const badge = document.getElementById('status-summary-badge');
    const textEl = document.getElementById('status-summary-text');
    if (!badge || !textEl) return;

    let severity = 'NOMINAL';
    let severityClass = 'status-nominal';
    let summaryText = '';

    if (state.apiStatus === 'DISCONNECTED') {
        severity = 'DISCONNECTED';
        severityClass = 'status-tactical';
        summaryText = `CRITICAL: NOAA telemetry stream connection lost. Visual system holding on last recorded parameters (${Math.round(speed)} km/s | Bz: ${bz.toFixed(1)} nT). Re-establishing receiver handshake...`;
    } else if (bz <= -10 || speed >= 700) {
        severity = 'TACTICAL ALERT';
        severityClass = 'status-tactical';
        summaryText = `CRITICAL: Severe magnetospheric compression detected. Solar wind speed is extremely high at ${Math.round(speed)} km/s with a strong southward IMF Bz field of ${bz.toFixed(1)} nT. Deflection efficiency is severely degraded.`;
    } else if (bz <= -5 || speed >= 500) {
        severity = 'UNSTABLE';
        severityClass = 'status-unstable';
        summaryText = `WARNING: Space weather environment is unstable. Increased solar wind velocity of ${Math.round(speed)} km/s and a southward Bz field of ${bz.toFixed(1)} nT are inducing moderate magnetospheric erosion.`;
    } else {
        severity = 'NOMINAL';
        severityClass = 'status-nominal';
        summaryText = `Solar wind conditions are nominal at ${Math.round(speed)} km/s with a stable magnetic Bz index of ${bz.toFixed(1)} nT. Particle deflection arrays and geomagnetic margins are holding steady at normal capacity.`;
    }

    badge.textContent = `STATUS: ${severity}`;
    badge.className = `summary-badge ${severityClass}`;
    textEl.textContent = summaryText;
}

// Update DOM Telemetry Values
function updateTelemetryUI() {
    overlaySpeed.textContent = `${state.speed.toFixed(1)} km/s`;
    overlayBz.textContent = `${state.bz.toFixed(2)} nT`;
    
    if (state.bz < 0) {
        overlayBz.className = 'value text-danger';
    } else if (state.bz > 0) {
        overlayBz.className = 'value text-success';
    } else {
        overlayBz.className = 'value';
    }

    valSpeed.textContent = Math.round(state.speed);
    valDensity.textContent = state.density.toFixed(2);
    valBz.textContent = state.bz.toFixed(2);
    valTemp.textContent = Math.round(state.temperature).toLocaleString();

    // States & Colors
    const speedState = getValueState(state.speed, 'speed');
    stateSpeed.textContent = speedState.text;
    stateSpeed.style.color = speedState.color;

    const densityState = getValueState(state.density, 'density');
    stateDensity.textContent = densityState.text;
    stateDensity.style.color = densityState.color;

    const bzState = getValueState(state.bz, 'bz');
    stateBz.textContent = bzState.text;
    stateBz.style.color = bzState.color;

    stateTemp.textContent = 'NOMINAL';
    stateTemp.style.color = 'var(--primary-color)';

    // Update the dynamic status summary
    updateStatusSummary(state.speed, state.density, state.bz);
}

// Main poll function
async function pollNOAAData() {
    try {
        if (state.apiStatus !== 'DISCONNECTED') {
            apiStatusEl.textContent = 'POLLING';
            apiStatusEl.className = 'status-connecting';
        }

        // Fetch plasma stream
        const plasmaResponse = await fetch(PLASMA_URL);
        if (!plasmaResponse.ok) throw new Error('Plasma endpoint unreachable');
        const plasmaData = await plasmaResponse.json();

        // Fetch magnetic field stream
        const magResponse = await fetch(MAG_URL);
        if (!magResponse.ok) throw new Error('Magnetometer endpoint unreachable');
        const magData = await magResponse.json();

        // Check if structure matches array of arrays
        if (!Array.isArray(plasmaData) || plasmaData.length < 2 || !Array.isArray(magData) || magData.length < 2) {
            throw new Error('Invalid JSON structure returned');
        }

        // Map column headers
        const plasmaHeaders = plasmaData[0];
        const speedIdx = plasmaHeaders.indexOf('speed');
        const densityIdx = plasmaHeaders.indexOf('density');
        const tempIdx = plasmaHeaders.indexOf('temperature');
        const timeIdx = plasmaHeaders.indexOf('time_tag');

        const magHeaders = magData[0];
        const bzIdx = magHeaders.indexOf('bz');
        const magTimeIdx = magHeaders.indexOf('time_tag');

        // Extract latest items (last rows)
        const latestPlasma = plasmaData[plasmaData.length - 1];
        
        // Match magnetometer reading with the latest plasma timestamp if possible,
        // otherwise default to the latest magnetometer reading
        const targetTime = latestPlasma[timeIdx];
        let matchedMag = magData[magData.length - 1];

        for (let i = magData.length - 1; i >= 1; i--) {
            if (magData[i][magTimeIdx] === targetTime) {
                matchedMag = magData[i];
                break;
            }
        }

        // Set state values
        state.speed = parseFloat(latestPlasma[speedIdx]) || 400.0;
        state.density = parseFloat(latestPlasma[densityIdx]) || 5.0;
        state.temperature = parseFloat(latestPlasma[tempIdx]) || 150000.0;
        state.bz = parseFloat(matchedMag[bzIdx]) || 0.0;
        state.time = targetTime;

        state.apiStatus = 'ONLINE';
        apiStatusEl.textContent = 'ONLINE';
        apiStatusEl.className = 'status-active';

        updateTelemetryUI();

        // Write to telemetry log window
        addLog(solarWindLog, `[NOAA_RX] Time: ${state.time.substring(11, 16)} | Speed: ${Math.round(state.speed)} km/s | Bz: ${state.bz.toFixed(1)} nT`, 'success');

        // Check alerts
        const alerts = checkSpaceWeatherAlerts(state.speed, state.bz);
        if (alerts.alertLevel !== 'G0') {
            addLog(alertsLogWindow, `[ALERT] SWPC detector triggered: ${alerts.alertLevel} - ${alerts.statusText}`, alerts.type);
        } else {
            addLog(alertsLogWindow, `[MONITOR] Deflection margins nominal (Bz: ${state.bz.toFixed(1)} nT | Vw: ${Math.round(state.speed)} km/s)`, 'dim');
        }

    } catch (error) {
        console.warn('NOAA API connection failed. Freezing telemetry on last state:', error.message);
        
        state.apiStatus = 'DISCONNECTED';
        apiStatusEl.textContent = 'FEED STATUS: DISCONNECTED';
        apiStatusEl.className = 'status-error';

        addLog(solarWindLog, `[ERROR] Connection failed. Holding vectors on last state (${Math.round(state.speed)} km/s, ${state.bz.toFixed(1)} nT).`, 'danger');
        
        // Update table indicators to reflect warning/unknown hold status
        stateSpeed.textContent = 'HOLDING';
        stateSpeed.style.color = 'var(--warning-color)';
        stateDensity.textContent = 'HOLDING';
        stateDensity.style.color = 'var(--warning-color)';
        stateBz.textContent = 'HOLDING';
        stateBz.style.color = 'var(--warning-color)';
        stateTemp.textContent = 'HOLDING';
        stateTemp.style.color = 'var(--warning-color)';

        // Update the dynamic status summary under disconnected state
        updateStatusSummary(state.speed, state.density, state.bz);
    }
}

// Launch telemetry schedule (60s loop)
let pollingInterval = setInterval(pollNOAAData, 60000);
// Initial trigger after 2 seconds to allow interface setup lines to display
setTimeout(pollNOAAData, 2000);

// --- Historical severity registry parser ---
async function fetchAlertHistory() {
    try {
        const response = await fetch('https://services.swpc.noaa.gov/products/alerts.json');
        if (!response.ok) throw new Error('Alert history unreachable');
        const alerts = await response.json();

        let lastMinor = null;
        let lastStrong = null;
        let lastExtreme = null;

        for (const alert of alerts) {
            const msg = alert.message || '';
            const dateStr = alert.issue_datetime ? alert.issue_datetime.substring(0, 10) : '';

            // Check Extreme (G5)
            if (!lastExtreme && (msg.includes('G5') || /NOAA Scale:\s*G5/i.test(msg))) {
                lastExtreme = dateStr;
            }
            // Check Strong (G3, G4)
            if (!lastStrong && (msg.includes('G3') || msg.includes('G4') || /NOAA Scale:\s*G[34]/i.test(msg))) {
                lastStrong = dateStr;
            }
            // Check Minor (G1, G2)
            if (!lastMinor && (msg.includes('G1') || msg.includes('G2') || /NOAA Scale:\s*G[12]/i.test(msg))) {
                lastMinor = dateStr;
            }

            // If we found all three, we can break early
            if (lastMinor && lastStrong && lastExtreme) break;
        }

        document.getElementById('hist-minor').textContent = lastMinor || 'NO ACTIVE RECORDS (30D)';
        document.getElementById('hist-strong').textContent = lastStrong || 'NO ACTIVE RECORDS (30D)';
        document.getElementById('hist-extreme').textContent = lastExtreme || 'NO ACTIVE RECORDS (30D)';

    } catch (error) {
        console.warn('Failed to retrieve NOAA alert history:', error.message);
        document.getElementById('hist-minor').textContent = 'NO ACTIVE RECORDS (30D)';
        document.getElementById('hist-strong').textContent = 'NO ACTIVE RECORDS (30D)';
        document.getElementById('hist-extreme').textContent = 'NO ACTIVE RECORDS (30D)';
    }
}

// Trigger alert history fetch on boot
setTimeout(fetchAlertHistory, 1000);

// --- Solar Cycle 25 Timeline Calculator ---
function calculateSolarCycleProgress() {
    const startDate = new Date('2019-12-01T00:00:00Z');
    const endDate = new Date('2030-12-31T23:59:59Z');
    const now = new Date();

    const totalDuration = endDate - startDate;
    const elapsed = now - startDate;
    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));

    const percentage = (progress * 100).toFixed(1);
    
    // Draw 10-segment text progress bar
    const segments = 10;
    const filled = Math.round(progress * segments);
    const barString = '[' + '='.repeat(filled) + '-'.repeat(segments - filled) + ']';

    const barEl = document.getElementById('cycle-progress-bar');
    const valEl = document.getElementById('cycle-progress-val');
    if (barEl && valEl) {
        barEl.textContent = barString;
        valEl.textContent = `${percentage}%`;
    }
}

// Trigger cycle timeline progress calculation
calculateSolarCycleProgress();


