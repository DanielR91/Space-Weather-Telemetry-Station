# Space Weather Telemetry Station
### Authoritative Real-Time Magnetospheric Monitor

The **Space Weather Telemetry Station** is a specialized, high-fidelity monitoring terminal designed to track and visualize Earth's space weather conditions in real-time. Modeled with a retro green phosphor monospace CRT aesthetic, the station bridges direct scientific telemetry from the Space Weather Prediction Center (SWPC) to deliver clean, readable solar activity diagnostics.

🔗 **Access the Live Monitor Dashboard**: [Space Weather Telemetry Station](https://space-weather-telemetry-station.vercel.app)

---

## What It Does
The station acts as a continuous, automated window into Earth's magnetospheric shield. It tracks solar wind particles escaping the Sun's corona and monitors how they deform Earth's magnetic boundary lines. The system is designed to provide quick, high-contrast readability under any command center environment.

---

## Key Features

### 1. Vector Magnetospheric Field Simulation
* **60 FPS Vector Loop**: The left panel features an active simulation of Earth's magnetic dipole lines (Bezier structures) and the surrounding magnetopause barrier.
* **Particle Deflection**: Watch incoming solar wind streams deform and deflect around the bow shock in real-time.
* **Telemetry Reactivity**: The curvature, compression factor, and particle velocities in the canvas are directly bound to the incoming NOAA datastream. If solar wind speed increases or the magnetic Bz index drops, the magnetopause compressed shell visible in the simulation deforms accordingly.

### 2. NOAA SWPC Endpoint Bridge
* **Authoritative Datastreams**: Automatically queries NOAA's Real-time Solar Wind (RTSW) satellites every 60 seconds.
* **Telemetry State Register**: Monitors speed (Vw), proton density (Np), Interplanetary Magnetic Field (IMF) Bz coordinates, and plasma temperatures.
* **Handshake Status**: A diagnostic node indicator monitors data receipt status (`ONLINE`, `POLLING`, or `FEED STATUS: DISCONNECTED`).

### 3. Current Status Summary
* **Natural-Language Translator**: Right below the telemetry log streams, a dynamic translator reads raw telemetry vectors and summarizes them in plain English.
* **Visual Severity Badging**:
  * **STATUS: NOMINAL** (Low solar wind, stable northward Bz field)
  * **STATUS: UNSTABLE** (Moderate solar wind, unstable southward Bz field)
  * **STATUS: TACTICAL ALERT** (High-intensity solar storms, extreme compression warnings)

### 4. Historical Severity Registry
* **30-Day Event Records**: Tracks dates of the absolute latest geomagnetic events within the SWPC archives.
* **Scale Classification**: Evaluates alerts for Minor Storms (G1-G2), Strong Storms (G3-G4), and Extreme Storms (G5) to map the last observed date of impact.

### 5. Solar Cycle 25 Progress Tracker
* **Cycle Timeline Progress**: Calculates the exact elapsed duration of the active Solar Cycle 25 (covering Dec 2019 – Dec 2030).
* **Monospace Bar Progress**: Features a retro text progress bar block indicating how close the solar cycle is to its sustained solar maximum phase.

---

## How to Read the Dashboard

* **IMF Magnetic Index (Bz)**: Measured in nanoteslas (nT). A positive Bz indicates a magnetic field aligned northward, deflecting particles easily. A negative (southward) Bz merges with Earth's magnetic field, transferring energy into the atmosphere and triggering geomagnetic storms.
* **Wind Speed (Vw)**: Measures solar wind particle velocity in kilometers per second. Nominal speeds hover around 300–400 km/s. Speeds exceeding 700 km/s indicate active coronal mass ejections (CMEs).
* **Deflection Efficiency (Floating HUD)**: Calculated based on wind speed compression and Bz orientation. Lower percentages warn of incoming geomagnetic grid impacts.
