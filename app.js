// Space Weather Telemetry Station - Core Application Logic

// Application State
const state = {
    // Current telemetry readings
    speed: 400.0,      // Solar wind speed (km/s)
    density: 5.0,      // Proton density (p/cm3)
    bz: 0.0,           // IMF Bz index (nT)
    temperature: 150000.0, // plasma temp (K)
    time: null,        // timestamp of reading

    // Simulation overrides & controls
    manualSpeed: 400,
    manualBz: 0.0,
    isManualMode: false,

    // API stats
    apiStatus: 'CONNECTING', // CONNECTING, ONLINE, OFFLINE
};

// UI Elements
const stationTimeEl = document.getElementById('station-time');
const apiStatusEl = document.getElementById('api-status');

// Sliders and Display values
const speedSlider = document.getElementById('control-speed-slider');
const bzSlider = document.getElementById('control-bz-slider');
const speedSliderVal = document.getElementById('control-speed-val');
const bzSliderVal = document.getElementById('control-bz-val');

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

// Setup Slider Controllers (Overrides)
speedSlider.addEventListener('input', (e) => {
    state.isManualMode = true;
    state.manualSpeed = parseFloat(e.target.value);
    speedSliderVal.textContent = state.manualSpeed;
    
    // Propagate manually to visualizers
    overlaySpeed.textContent = `${state.manualSpeed.toFixed(1)} km/s`;
    
    // Render dynamic updates on table as manually overwritten
    valSpeed.textContent = `${state.manualSpeed.toFixed(0)}`;
    stateSpeed.textContent = 'OVERRIDE';
    stateSpeed.style.color = 'var(--warning-color)';
});

bzSlider.addEventListener('input', (e) => {
    state.isManualMode = true;
    state.manualBz = parseFloat(e.target.value);
    bzSliderVal.textContent = state.manualBz.toFixed(1);
    
    // Propagate
    overlayBz.textContent = `${state.manualBz.toFixed(2)} nT`;
    if (state.manualBz < 0) {
        overlayBz.className = 'value text-danger';
    } else if (state.manualBz > 0) {
        overlayBz.className = 'value text-success';
    } else {
        overlayBz.className = 'value';
    }

    valBz.textContent = state.manualBz.toFixed(2);
    stateBz.textContent = 'OVERRIDE';
    stateBz.style.color = 'var(--warning-color)';
});

// Particle Definition
class SolarParticle {
    constructor(width, height) {
        this.reset(width, height);
        // randomize starting position X along the screen width to bootstrap simulation
        this.x = Math.random() * width;
    }

    reset(width, height) {
        this.x = 0;
        this.y = Math.random() * height;
        this.originalY = this.y;
        this.alpha = 0.4 + Math.random() * 0.6;
        this.radius = 1 + Math.random() * 2;
    }

    update(width, height, speed, EarthCenter, magnetopauseSubsolar, bz) {
        // Speed scaling
        const step = (speed / 100) * 1.5;
        this.x += step;

        // Bending math around Earth's magnetopause
        const dx = EarthCenter.x - this.x;
        const dy = this.y - EarthCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Define a boundary curve (parabola/hyperbola) for magnetopause
        // magnetopause boundary starts at subsolar point and curves outward
        // Equation: x = subsolar_x - (y - center_y)^2 / curvature_constant
        const curvature = 350; // controls how broad the magnetospheric sheath is
        const boundaryX = magnetopauseSubsolar - (dy * dy) / curvature;

        // If particle crosses boundary, deflect it along the boundary
        if (this.x > boundaryX && dx > 0) {
            // Push particle outward along the curvature
            const pushDir = this.y > EarthCenter.y ? 1 : -1;
            this.y += step * 0.8 * pushDir;
            // Dampen X movement to look like compression sheath flow
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
    particleList.push(new SolarParticle(800, 500)); // Default sizing, will handle dynamically
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

    // Dynamic Variables (read from state / controls)
    const currentSpeed = state.isManualMode ? state.manualSpeed : state.speed;
    const currentBz = state.isManualMode ? state.manualBz : state.bz;

    // Get current client layout width/height
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    // Setup coordinates relative to layout size
    const EarthCenter = {
        x: w * 0.65,
        y: h * 0.5
    };
    const EarthRadius = 24;

    // Magnetopause subsolar compression point (determined by Wind Speed & Bz)
    // Strong wind compression decreases boundary distance
    // Negative Bz erodes magnetopause subsolar point (brings it closer to Earth)
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
        particle.update(w, h, currentSpeed, EarthCenter, magnetopauseSubsolar, currentBz);
        particle.draw(ctx);
    });

    // Draw Bow Shock & Magnetopause boundary line
    ctx.save();
    ctx.strokeStyle = 'rgba(51, 255, 51, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    // Magnetopause sheath path
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
    // Draw 7 concentric magnetic loops on both day-side and night-side
    ctx.save();
    ctx.strokeStyle = 'rgba(51, 255, 51, 0.7)';
    ctx.lineWidth = 1.2;

    const loops = [0.4, 0.7, 1.0, 1.3, 1.7, 2.1, 2.5];
    loops.forEach((scale, index) => {
        // Bz dynamically affects the tilt / symmetry of field lines (dipole tilt)
        const bzAngleSkew = (currentBz / 25) * 0.15; // skew control points

        // DAY-SIDE loops (Left side, compressed)
        ctx.beginPath();
        // Starts at north pole
        ctx.moveTo(EarthCenter.x, EarthCenter.y - EarthRadius);
        
        // Control point 1 pushes left towards the compressed magnetopause boundary
        const dayCompression = Math.max(30, (magnetopauseSubsolar - EarthCenter.x) * -0.65 * scale);
        const cp1x = EarthCenter.x - dayCompression;
        const cp1y = EarthCenter.y - (45 * scale) + (bzAngleSkew * 100);

        // Control point 2 pushes left and towards the south pole
        const cp2x = EarthCenter.x - dayCompression;
        const cp2y = EarthCenter.y + (45 * scale) + (bzAngleSkew * 100);

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, EarthCenter.x, EarthCenter.y + EarthRadius);
        ctx.stroke();

        // NIGHT-SIDE loops (Right side, stretched tail)
        ctx.beginPath();
        ctx.moveTo(EarthCenter.x, EarthCenter.y - EarthRadius);

        // Control points stretch far to the right (representing magnetotail)
        const tailLength = 220 * scale;
        const tcp1x = EarthCenter.x + (tailLength * 0.5);
        const tcp1y = EarthCenter.y - (60 * scale) - (bzAngleSkew * 80);

        const tcp2x = EarthCenter.x + tailLength;
        const tcp2y = EarthCenter.y + (bzAngleSkew * 80);

        ctx.bezierCurveTo(tcp1x, tcp1y, tcp2x, tcp2y, EarthCenter.x, EarthCenter.y + EarthRadius);
        ctx.stroke();
    });
    ctx.restore();

    // Draw Earth (Space Station focus)
    ctx.save();
    // Outer glow
    const shadowGrad = ctx.createRadialGradient(EarthCenter.x, EarthCenter.y, EarthRadius - 5, EarthCenter.x, EarthCenter.y, EarthRadius + 8);
    shadowGrad.addColorStop(0, 'rgba(3, 8, 4, 1)');
    shadowGrad.addColorStop(0.6, 'rgba(51, 255, 51, 0.3)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius + 8, 0, Math.PI * 2);
    ctx.fill();

    // Earth Sphere Core
    ctx.fillStyle = '#030804';
    ctx.strokeStyle = 'var(--primary-color)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw internal globe grids (vector latitude lines)
    ctx.strokeStyle = 'rgba(51, 255, 51, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius, -Math.PI / 6, Math.PI / 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(EarthCenter.x, EarthCenter.y, EarthRadius, 5 * Math.PI / 6, 7 * Math.PI / 6);
    ctx.stroke();

    // Vector Earth Axis
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

// Update DOM Telemetry Values
function updateTelemetryUI() {
    // If not in manual override mode, update sliders to match fetched NOAA state
    if (!state.isManualMode) {
        speedSlider.value = state.speed;
        speedSliderVal.textContent = Math.round(state.speed);
        bzSlider.value = state.bz;
        bzSliderVal.textContent = state.bz.toFixed(1);

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
    } else {
        // Manual override mode visual aids: update table for non-overridden metrics still
        valDensity.textContent = state.density.toFixed(2);
        valTemp.textContent = Math.round(state.temperature).toLocaleString();
    }
}

// Fallback dynamic simulator if API gets blocked (CORS)
function runSimulationTelemetry() {
    state.apiStatus = 'SIMULATED';
    apiStatusEl.textContent = 'SIM_MODE';
    apiStatusEl.className = 'status-connecting';

    // Walk state slightly to simulate active telemetry variations
    const timeNow = new Date().toISOString().replace('T', ' ').substring(11, 19);
    
    // Sim drift
    state.speed += (Math.random() - 0.5) * 12;
    state.speed = Math.max(300, Math.min(850, state.speed));

    state.density += (Math.random() - 0.5) * 0.8;
    state.density = Math.max(1.0, Math.min(22.0, state.density));

    state.bz += (Math.random() - 0.5) * 1.5;
    state.bz = Math.max(-15.0, Math.min(15.0, state.bz));

    state.temperature += (Math.random() - 0.5) * 15000;
    state.temperature = Math.max(50000, Math.min(350000, state.temperature));

    updateTelemetryUI();

    addLog(solarWindLog, `[SIM_RX] Speed: ${Math.round(state.speed)} km/s | Density: ${state.density.toFixed(2)} p/cm³ | Bz: ${state.bz.toFixed(2)} nT`, 'info');

    // Run alerts checks
    const alerts = checkSpaceWeatherAlerts(state.speed, state.bz);
    if (alerts.alertLevel !== 'G0') {
        addLog(alertsLogWindow, `[WARN] Geomagnetic Event detected! Rating: ${alerts.alertLevel} (${alerts.statusText})`, alerts.type);
    }
}

// Main poll function
async function pollNOAAData() {
    try {
        apiStatusEl.textContent = 'POLLING';
        apiStatusEl.className = 'status-connecting';

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
        console.warn('NOAA API connection failed. Reverting to local simulation telemetry loop:', error.message);
        addLog(solarWindLog, `[WARN] Connect failed. Reason: CORS/Blocked. Starting simulated receiver node...`, 'warning');
        
        // Initial simulated step
        runSimulationTelemetry();
        
        // Switch to simulation interval
        clearInterval(pollingInterval);
        pollingInterval = setInterval(runSimulationTelemetry, 15000); // Quick update loops for simulation preview
    }
}

// Launch telemetry schedule
let pollingInterval = setInterval(pollNOAAData, 60000);
// Initial trigger after 2 seconds to allow interface setup lines to display
setTimeout(pollNOAAData, 2000);

