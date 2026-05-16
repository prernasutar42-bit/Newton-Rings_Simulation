/* ═══════════════════════════════════════════════════════════════
   NEWTON'S RINGS VIRTUAL LAB — SCRIPT
   Fully isolated inside initNewtonsLab()
   Prefix: newton-
═══════════════════════════════════════════════════════════════ */

function initNewtonsLab() {
  // ── DOM Safety Check ────────────────────────────────────────
  if (!document.getElementById('newton-canvas')) return;

  // ════════════════════════════════════════════════════════════
  // CONSTANTS & STATE
  // ════════════════════════════════════════════════════════════
  const LAMBDA_DEFAULT = 589;   // nm
  const R_DEFAULT      = 100;   // cm
  const FOCUS_DEFAULT  = 5.0;
  const NUM_RINGS      = 10;

  const state = {
    running:    false,
    animId:     null,
    time:       0,
    wavelength: LAMBDA_DEFAULT, // nm
    radiusCm:   R_DEFAULT,      // cm
    focus:      FOCUS_DEFAULT,
    microPos:   1200,           // 0..2400 in "microscope units"
    recordings: {},             // { "3-left": 11.45, "3-right": 14.67 }
    tableData:  [],             // [{n, x1, x2, dn, dn2, valid}]
    chartInst:  null,
  };

  // Pre-populate tableData
  for (let i = 1; i <= NUM_RINGS; i++) {
    state.tableData.push({ n: i, x1: '', x2: '', dn: '', dn2: '', valid: false });
  }

  // ════════════════════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════════════════════
  function wavelengthToRGB(nm) {
    let r, g, b;
    if      (nm >= 380 && nm < 440) { r = -(nm-440)/(440-380); g = 0; b = 1; }
    else if (nm >= 440 && nm < 490) { r = 0; g = (nm-440)/(490-440); b = 1; }
    else if (nm >= 490 && nm < 510) { r = 0; g = 1; b = -(nm-510)/(510-490); }
    else if (nm >= 510 && nm < 580) { r = (nm-510)/(580-510); g = 1; b = 0; }
    else if (nm >= 580 && nm < 645) { r = 1; g = -(nm-645)/(645-580); b = 0; }
    else if (nm >= 645 && nm <= 780) { r = 1; g = 0; b = 0; }
    else { r = 0; g = 0; b = 0; }
    const gamma = 0.8;
    let factor;
    if      (nm >= 380 && nm < 420) factor = 0.3 + 0.7*(nm-380)/(420-380);
    else if (nm >= 420 && nm < 701) factor = 1.0;
    else if (nm >= 701 && nm <= 780) factor = 0.3 + 0.7*(780-nm)/(780-700);
    else factor = 0;
    r = Math.round(255 * Math.pow(r * factor, gamma));
    g = Math.round(255 * Math.pow(g * factor, gamma));
    b = Math.round(255 * Math.pow(b * factor, gamma));
    return `rgb(${r},${g},${b})`;
  }

  // Ring diameters: Dn² = 4λRn  (λ in mm, R in mm)
  function ringDiameter(n) {
    const lambda_mm = state.wavelength * 1e-6; // nm → mm
    const R_mm = state.radiusCm * 10;          // cm → mm
    return Math.sqrt(4 * lambda_mm * R_mm * n);
  }

  // Ideal Dn² values (for autofill + display)
  function idealDn2(n) {
    const lambda_mm = state.wavelength * 1e-6;
    const R_mm = state.radiusCm * 10;
    return 4 * lambda_mm * R_mm * n;
  }

  // Add small realistic scatter
  function scatter(val, pct = 0.015) {
    return val * (1 + (Math.random() - 0.5) * pct);
  }

  // Linear regression
  function linReg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
    let sx=0, sy=0, sxy=0, sx2=0, sy2=0;
    for (let i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; sxy+=xs[i]*ys[i]; sx2+=xs[i]*xs[i]; sy2+=ys[i]*ys[i]; }
    const slope = (n*sxy - sx*sy) / (n*sx2 - sx*sx);
    const intercept = (sy - slope*sx) / n;
    const yMean = sy/n;
    let ssTot=0, ssRes=0;
    for(let i=0;i<n;i++){
      ssTot += (ys[i]-yMean)**2;
      ssRes += (ys[i]-(slope*xs[i]+intercept))**2;
    }
    const r2 = ssTot>0 ? 1 - ssRes/ssTot : 1;
    return { slope, intercept, r2 };
  }

  // ════════════════════════════════════════════════════════════
  // TAB SWITCHING
  // ════════════════════════════════════════════════════════════
  const tabs     = document.querySelectorAll('.newton-tab');
  const panels   = document.querySelectorAll('.newton-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = tab.dataset.tab;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');

      // If switching to graph tab, render graph
      if (panelId === 'newton-tab-graph') renderGraph();
      // If switching to calc tab, update given panel
      if (panelId === 'newton-tab-calc') updateGivenPanel();
    });
  });

  // ════════════════════════════════════════════════════════════
  // SLIDERS
  // ════════════════════════════════════════════════════════════
  const wlSlider     = document.getElementById('newton-wavelength-slider');
  const wlVal        = document.getElementById('newton-wavelength-val');
  const rSlider      = document.getElementById('newton-radius-slider');
  const rVal         = document.getElementById('newton-radius-val');
  const focusSlider  = document.getElementById('newton-focus-slider');
  const focusVal     = document.getElementById('newton-focus-val');

  function updateSliderFill(input) {
    const min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
    const pct = ((val - min) / (max - min)) * 100;
    input.style.setProperty('--val', pct + '%');
  }

  wlSlider.addEventListener('input', () => {
    state.wavelength = parseInt(wlSlider.value);
    wlVal.textContent = state.wavelength + ' nm';
    updateSliderFill(wlSlider);
    updateColorPreview();
    updateReadouts();
    buildRingBadges();
  });

  rSlider.addEventListener('input', () => {
    state.radiusCm = parseInt(rSlider.value);
    rVal.textContent = state.radiusCm + ' cm';
    updateSliderFill(rSlider);
    updateReadouts();
    buildRingBadges();
  });

  focusSlider.addEventListener('input', () => {
    state.focus = parseFloat(focusSlider.value);
    focusVal.textContent = state.focus.toFixed(1);
    updateSliderFill(focusSlider);
  });

  // Initialize fills
  [wlSlider, rSlider, focusSlider].forEach(s => updateSliderFill(s));

  function updateColorPreview() {
    const preview = document.getElementById('newton-color-preview');
    const nm = state.wavelength;
    const pct = ((nm - 400) / 300) * 100;
    preview.style.setProperty('--pos', pct + '%');
    preview.style.setProperty('--wl-color', wavelengthToRGB(nm));
  }
  updateColorPreview();

  function updateReadouts() {
    document.getElementById('newton-ro-lambda').textContent = state.wavelength + ' nm';
    document.getElementById('newton-ro-radius').textContent = state.radiusCm + ' cm';
    document.getElementById('newton-ro-rings').textContent = NUM_RINGS;
    const d1 = ringDiameter(1).toFixed(3);
    document.getElementById('newton-ro-d1').textContent = d1 + ' mm';
  }
  updateReadouts();

  // ════════════════════════════════════════════════════════════
  // RING BADGES (inspector)
  // ════════════════════════════════════════════════════════════
  function buildRingBadges() {
    const list = document.getElementById('newton-ring-list');
    list.innerHTML = '';
    for (let n = 1; n <= NUM_RINGS; n++) {
      const d = ringDiameter(n).toFixed(3);
      const b = document.createElement('div');
      b.className = 'newton-ring-badge';
      b.innerHTML = `<span style="color:var(--cyan)">n=${n}</span><br><span style="font-size:10px">D=${d}mm</span>`;
      list.appendChild(b);
    }
  }
  buildRingBadges();

  // ════════════════════════════════════════════════════════════
  // SIMULATION CANVAS
  // ════════════════════════════════════════════════════════════
  const simCanvas  = document.getElementById('newton-canvas');
  const simCtx     = simCanvas.getContext('2d');
  const overlay    = document.getElementById('newton-canvas-overlay');
  const CX         = simCanvas.width / 2;
  const CY         = simCanvas.height / 2;
  const MAX_R_PX   = simCanvas.width / 2 - 10;

  function drawSimulation(t) {
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);

    // Background — dark glass plate
    const bgGrad = simCtx.createRadialGradient(CX, CY, 0, CX, CY, MAX_R_PX);
    bgGrad.addColorStop(0,   'rgba(20,30,50,1)');
    bgGrad.addColorStop(0.5, 'rgba(10,18,30,1)');
    bgGrad.addColorStop(1,   'rgba(5,10,18,1)');
    simCtx.fillStyle = bgGrad;
    simCtx.beginPath();
    simCtx.arc(CX, CY, MAX_R_PX, 0, Math.PI * 2);
    simCtx.fill();

    // Outer boundary circle
    simCtx.strokeStyle = 'rgba(0,229,255,0.15)';
    simCtx.lineWidth = 1;
    simCtx.beginPath();
    simCtx.arc(CX, CY, MAX_R_PX, 0, Math.PI * 2);
    simCtx.stroke();

    // Compute ring radii in pixels
    const lambda_mm = state.wavelength * 1e-6;
    const R_mm = state.radiusCm * 10;
    const rings = [];
    for (let n = 1; n <= 20; n++) {
      const D_mm = Math.sqrt(4 * lambda_mm * R_mm * n);
      // Scale: D_mm for ring 10 maps to ~MAX_R_PX
      const refD = Math.sqrt(4 * lambda_mm * R_mm * 10);
      const rpx = (D_mm / refD) * (MAX_R_PX * 0.88);
      if (rpx > MAX_R_PX + 20) break;
      rings.push({ n, rpx, D_mm });
    }

    // Draw rings from outside in using concentric fills
    // Create image data for pixel-level accuracy
    const imageData = simCtx.getImageData(CX - MAX_R_PX, CY - MAX_R_PX, MAX_R_PX*2, MAX_R_PX*2);
    const data = imageData.data;
    const wRGB = wavelengthToRGB(state.wavelength);
    const match = wRGB.match(/\d+/g);
    const wr = parseInt(match[0]), wg = parseInt(match[1]), wb = parseInt(match[2]);

    const focus = state.focus / 5.0; // normalize 0..2
    const pulseFactor = 1 + 0.003 * Math.sin(t * 0.02); // subtle breathing

    for (let py = 0; py < MAX_R_PX * 2; py++) {
      for (let px = 0; px < MAX_R_PX * 2; px++) {
        const dx = px - MAX_R_PX;
        const dy = py - MAX_R_PX;
        const r  = Math.sqrt(dx*dx + dy*dy);
        if (r > MAX_R_PX) continue;

        // Map r back to mm: r_mm = r_px * (refD_mm / (MAX_R_PX * 0.88))
        const refD = Math.sqrt(4 * lambda_mm * R_mm * 10);
        const r_mm = (r / (MAX_R_PX * 0.88)) * (refD / 2);

        // Air gap: t = r² / (2R)
        const airGap = (r_mm * r_mm) / (2 * R_mm);

        // Phase difference (dark rings when 2t = mλ, i.e. 2t/λ = integer)
        const phase = (2 * airGap / lambda_mm) * Math.PI * 2;

        // Intensity (dark fringe → 0, bright → 1)
        // cos²(phase/2) with slight damping for outer rings
        const N = r_mm / (Math.sqrt(lambda_mm * R_mm / 2) + 0.001);
        const damping = Math.exp(-N * 0.012 / focus);
        const I = (1 - Math.cos(phase * pulseFactor)) / 2 * damping;

        const idx = (py * MAX_R_PX * 2 + px) * 4;
        // Combine tinted light color with intensity
        data[idx]   = Math.round(wr * I * 0.9);
        data[idx+1] = Math.round(wg * I * 0.9);
        data[idx+2] = Math.round(wb * I * 0.9);
        data[idx+3] = 255;
      }
    }
    simCtx.putImageData(imageData, CX - MAX_R_PX, CY - MAX_R_PX);

    // Central dark spot label
    simCtx.fillStyle = 'rgba(0,229,255,0.5)';
    simCtx.beginPath();
    simCtx.arc(CX, CY, 2, 0, Math.PI * 2);
    simCtx.fill();

    // Ring number labels for first 10 rings
    simCtx.font = '10px Share Tech Mono';
    simCtx.fillStyle = 'rgba(0,229,255,0.4)';
    simCtx.textAlign = 'center';
    rings.slice(0, 10).forEach(({ n, rpx }) => {
      simCtx.fillText(n, CX + rpx * 0.707 + 6, CY - rpx * 0.707 - 2);
    });

    // Crosshair lines (subtle)
    simCtx.strokeStyle = 'rgba(0,229,255,0.08)';
    simCtx.lineWidth = 1;
    simCtx.setLineDash([4, 6]);
    simCtx.beginPath(); simCtx.moveTo(CX, CY - MAX_R_PX); simCtx.lineTo(CX, CY + MAX_R_PX); simCtx.stroke();
    simCtx.beginPath(); simCtx.moveTo(CX - MAX_R_PX, CY); simCtx.lineTo(CX + MAX_R_PX, CY); simCtx.stroke();
    simCtx.setLineDash([]);
  }

  function animLoop() {
    if (!state.running) return;
    state.time++;
    drawSimulation(state.time);
    state.animId = requestAnimationFrame(animLoop);
  }

  // Buttons
  const btnStart = document.getElementById('newton-btn-start');
  const btnPause = document.getElementById('newton-btn-pause');
  const btnReset = document.getElementById('newton-btn-reset-sim');
  const statusDot  = document.getElementById('newton-status-dot');
  const statusText = document.getElementById('newton-status-text');

  btnStart.addEventListener('click', () => {
    if (state.running) return;
    state.running = true;
    overlay.classList.add('hidden');
    btnStart.disabled = true;
    btnPause.disabled = false;
    statusDot.className = 'newton-status-dot';
    statusText.textContent = 'RUNNING';
    animLoop();
  });

  btnPause.addEventListener('click', () => {
    state.running = false;
    cancelAnimationFrame(state.animId);
    overlay.classList.remove('hidden');
    overlay.querySelector('span').textContent = 'SIMULATION PAUSED';
    btnStart.disabled = false;
    btnPause.disabled = true;
    statusDot.className = 'newton-status-dot paused';
    statusText.textContent = 'PAUSED';
  });

  btnReset.addEventListener('click', () => {
    state.running = false;
    cancelAnimationFrame(state.animId);
    state.time = 0;
    state.wavelength = LAMBDA_DEFAULT;
    state.radiusCm = R_DEFAULT;
    state.focus = FOCUS_DEFAULT;
    wlSlider.value = LAMBDA_DEFAULT;
    rSlider.value = R_DEFAULT;
    focusSlider.value = FOCUS_DEFAULT;
    wlVal.textContent = LAMBDA_DEFAULT + ' nm';
    rVal.textContent = R_DEFAULT + ' cm';
    focusVal.textContent = FOCUS_DEFAULT.toFixed(1);
    [wlSlider, rSlider, focusSlider].forEach(s => updateSliderFill(s));
    updateColorPreview();
    updateReadouts();
    buildRingBadges();
    overlay.classList.remove('hidden');
    overlay.querySelector('span').textContent = 'SIMULATION PAUSED';
    btnStart.disabled = false;
    btnPause.disabled = true;
    statusDot.className = 'newton-status-dot stopped';
    statusText.textContent = 'RESET';
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);
    // Draw static frame
    drawSimulation(0);
    setTimeout(() => {
      statusDot.className = 'newton-status-dot stopped';
      statusText.textContent = 'READY';
    }, 1200);
  });

  // Draw initial static frame
  drawSimulation(0);

  // ════════════════════════════════════════════════════════════
  // TRAVELLING MICROSCOPE
  // ════════════════════════════════════════════════════════════
  const eyeCanvas  = document.getElementById('newton-eyepiece');
  const eyeCtx     = eyeCanvas.getContext('2d');
  const microSlider = document.getElementById('newton-micro-slider');
  const msValEl    = document.getElementById('newton-ms-val');
  const vsValEl    = document.getElementById('newton-vs-val');
  const totalValEl = document.getElementById('newton-total-val');
  const currentReadEl = document.getElementById('newton-current-reading');

  // Map microPos (0..2400) to mm reading (0..24 mm)
  function microPosTomm(pos) {
    return pos * 0.01; // 0..24 mm
  }

  function getMSVS(pos) {
    const total = microPosTomm(pos);
    const ms = Math.floor(total * 2) / 2; // 0.5mm divisions
    const vs = parseFloat((total - ms).toFixed(3));
    return { ms, vs, total: parseFloat(total.toFixed(3)) };
  }

  function drawEyepiece() {
    const EW = eyeCanvas.width, EH = eyeCanvas.height;
    const ECX = EW / 2, ECY = EH / 2;
    eyeCtx.clearRect(0, 0, EW, EH);

    // Clip to circle
    eyeCtx.save();
    eyeCtx.beginPath();
    eyeCtx.arc(ECX, ECY, EW/2 - 2, 0, Math.PI*2);
    eyeCtx.clip();

    // Background
    const bgG = eyeCtx.createRadialGradient(ECX, ECY, 0, ECX, ECY, EW/2);
    bgG.addColorStop(0, 'rgba(15,25,40,1)');
    bgG.addColorStop(1, 'rgba(5,10,18,1)');
    eyeCtx.fillStyle = bgG;
    eyeCtx.fillRect(0, 0, EW, EH);

    // Draw rings in viewport centered around microPos
    // Viewport: microPos in mm is the x-center of view
    // 1 pixel = 0.05 mm at zoom level
    const pixPerMm = 35 * (state.focus / 5.0);
    const viewCenterMm = microPosTomm(state.microPos);

    const lambda_mm = state.wavelength * 1e-6;
    const R_mm = state.radiusCm * 10;
    const centerMm = 12.0; // center of ring pattern is at mm=12

    for (let n = 1; n <= 15; n++) {
      const Dn = Math.sqrt(4 * lambda_mm * R_mm * n);
      const rn = Dn / 2;
      // Left and right edges of ring n (dark ring edges are approximations)
      // We'll draw the dark ring of radius rn from center (12 mm)
      // In the eyepiece, x-position of ring arc at given rn
      // The ring center in eyepiece x coords:
      const ringCenterPx = ECX + (centerMm - viewCenterMm) * pixPerMm;

      // We draw a band of width ~0.5px * ringWidth
      const innerR = rn - 0.15;
      const outerR = rn + 0.15;

      // Draw as filled arc on a 2D canvas: rings are circles around ringCenterPx, ECY
      // Dark ring = very dark circle stroke
      const intensity = Math.exp(-n * 0.06);
      const col = wavelengthToRGB(state.wavelength);

      // Bright fill between dark rings
      if (n > 1) {
        const prevDn = Math.sqrt(4 * lambda_mm * R_mm * (n-1));
        const prevR = prevDn / 2;
        eyeCtx.beginPath();
        eyeCtx.arc(ringCenterPx, ECY, rn * pixPerMm, 0, Math.PI*2);
        eyeCtx.arc(ringCenterPx, ECY, prevR * pixPerMm, 0, Math.PI*2, true);
        eyeCtx.fillStyle = col.replace('rgb', 'rgba').replace(')', `,${intensity * 0.35})`);
        eyeCtx.fill('evenodd');
      }

      // Dark ring
      eyeCtx.beginPath();
      eyeCtx.arc(ringCenterPx, ECY, rn * pixPerMm, 0, Math.PI*2);
      eyeCtx.strokeStyle = `rgba(0,0,0,0.9)`;
      eyeCtx.lineWidth = Math.max(1.5, 3 * (1 - n * 0.05));
      eyeCtx.stroke();
    }

    // Central dark spot
    eyeCtx.beginPath();
    eyeCtx.arc(ECX + (centerMm - viewCenterMm) * pixPerMm, ECY, 4, 0, Math.PI*2);
    eyeCtx.fillStyle = 'rgba(0,0,0,0.95)';
    eyeCtx.fill();

    // Scale ruler at bottom
    eyeCtx.fillStyle = 'rgba(0,229,255,0.6)';
    eyeCtx.fillRect(10, EH - 22, EW - 20, 1);
    for (let m = 0; m <= 24; m += 0.5) {
      const xPx = ECX + (m - viewCenterMm) * pixPerMm;
      if (xPx < 5 || xPx > EW - 5) continue;
      const isMm = m === Math.round(m);
      eyeCtx.fillStyle = isMm ? 'rgba(0,229,255,0.8)' : 'rgba(0,229,255,0.4)';
      eyeCtx.fillRect(xPx, EH - 22 - (isMm ? 8 : 4), 1, isMm ? 8 : 4);
      if (isMm) {
        eyeCtx.font = '9px Share Tech Mono';
        eyeCtx.fillStyle = 'rgba(0,229,255,0.5)';
        eyeCtx.textAlign = 'center';
        eyeCtx.fillText(m.toFixed(0), xPx, EH - 26);
      }
    }

    // Grain / vignette
    const vigG = eyeCtx.createRadialGradient(ECX, ECY, EW*0.25, ECX, ECY, EW/2);
    vigG.addColorStop(0, 'rgba(0,0,0,0)');
    vigG.addColorStop(1, 'rgba(0,0,0,0.55)');
    eyeCtx.fillStyle = vigG;
    eyeCtx.fillRect(0, 0, EW, EH);

    eyeCtx.restore();

    // Outer ring glow
    eyeCtx.beginPath();
    eyeCtx.arc(ECX, ECY, EW/2 - 2, 0, Math.PI*2);
    eyeCtx.strokeStyle = 'rgba(0,229,255,0.35)';
    eyeCtx.lineWidth = 2;
    eyeCtx.stroke();
  }

  function updateScaleDisplay() {
    const { ms, vs, total } = getMSVS(state.microPos);
    msValEl.textContent   = ms.toFixed(2) + ' mm';
    vsValEl.textContent   = vs.toFixed(3) + ' mm';
    totalValEl.textContent = total.toFixed(3) + ' mm';
    currentReadEl.textContent = total.toFixed(3) + ' mm';
    drawEyepiece();
  }

  microSlider.addEventListener('input', () => {
    state.microPos = parseInt(microSlider.value);
    updateSliderFill(microSlider);
    updateScaleDisplay();
  });

  updateSliderFill(microSlider);
  updateScaleDisplay();

  // Move buttons
  document.getElementById('newton-move-ll').addEventListener('click', () => {
    state.microPos = Math.max(0, state.microPos - 50);
    microSlider.value = state.microPos;
    updateSliderFill(microSlider);
    updateScaleDisplay();
  });
  document.getElementById('newton-move-l').addEventListener('click', () => {
    state.microPos = Math.max(0, state.microPos - 5);
    microSlider.value = state.microPos;
    updateSliderFill(microSlider);
    updateScaleDisplay();
  });
  document.getElementById('newton-move-r').addEventListener('click', () => {
    state.microPos = Math.min(2400, state.microPos + 5);
    microSlider.value = state.microPos;
    updateSliderFill(microSlider);
    updateScaleDisplay();
  });
  document.getElementById('newton-move-rr').addEventListener('click', () => {
    state.microPos = Math.min(2400, state.microPos + 50);
    microSlider.value = state.microPos;
    updateSliderFill(microSlider);
    updateScaleDisplay();
  });

  // Record reading
  document.getElementById('newton-btn-record-reading').addEventListener('click', () => {
    const ring = parseInt(document.getElementById('newton-obs-ring').value);
    const side = document.querySelector('input[name="newton-side"]:checked').value;
    const { total } = getMSVS(state.microPos);
    const key = `${ring}-${side}`;
    state.recordings[key] = total;
    renderRecordedList();
    // Auto-push to table if both sides recorded
    const lKey = `${ring}-left`, rKey = `${ring}-right`;
    if (state.recordings[lKey] !== undefined && state.recordings[rKey] !== undefined) {
      const row = state.tableData.find(r => r.n === ring);
      if (row) {
        row.x1 = state.recordings[lKey].toFixed(3);
        row.x2 = state.recordings[rKey].toFixed(3);
        calcRow(row);
      }
      refreshTable();
    }
  });

  function renderRecordedList() {
    const list = document.getElementById('newton-recorded-list');
    list.innerHTML = '';
    for (let n = 1; n <= NUM_RINGS; n++) {
      const lKey = `${n}-left`, rKey = `${n}-right`;
      const lv = state.recordings[lKey], rv = state.recordings[rKey];
      if (lv !== undefined || rv !== undefined) {
        const div = document.createElement('div');
        div.className = 'newton-recorded-item';
        div.innerHTML = `<span>Ring ${n}</span>
          <span class="side-l">L: ${lv !== undefined ? lv.toFixed(3) : '—'}</span>
          <span class="side-r">R: ${rv !== undefined ? rv.toFixed(3) : '—'}</span>`;
        list.appendChild(div);
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // OBSERVATION TABLE
  // ════════════════════════════════════════════════════════════
  function calcRow(row) {
    const x1 = parseFloat(row.x1), x2 = parseFloat(row.x2);
    if (!isNaN(x1) && !isNaN(x2) && x2 > x1) {
      const dn = Math.abs(x2 - x1);
      row.dn  = dn.toFixed(4);
      row.dn2 = (dn * dn).toFixed(6);
      row.valid = true;
    } else {
      row.dn = ''; row.dn2 = ''; row.valid = false;
    }
  }

  function buildTable() {
    const tbody = document.getElementById('newton-table-body');
    tbody.innerHTML = '';
    state.tableData.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.id = `newton-tr-${i}`;
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><strong style="color:var(--cyan)">${row.n}</strong></td>
        <td>
          <input type="number" step="0.001" class="newton-table-input"
            id="newton-x1-${i}" value="${row.x1}" placeholder="0.000"
            aria-label="Left reading row ${i+1}" />
        </td>
        <td>
          <input type="number" step="0.001" class="newton-table-input"
            id="newton-x2-${i}" value="${row.x2}" placeholder="0.000"
            aria-label="Right reading row ${i+1}" />
        </td>
        <td class="newton-table-calc" id="newton-dn-${i}">${row.dn || '—'}</td>
        <td class="newton-table-calc" id="newton-dn2-${i}">${row.dn2 || '—'}</td>
        <td id="newton-status-${i}">
          <span class="newton-table-status ${row.valid ? 'valid' : (row.x1 || row.x2 ? 'invalid' : 'empty')}">
            ${row.valid ? '✓ OK' : (row.x1 || row.x2 ? '✗ ERR' : '—')}
          </span>
        </td>
      `;
      tbody.appendChild(tr);

      // Listeners
      document.getElementById(`newton-x1-${i}`).addEventListener('input', (e) => {
        state.tableData[i].x1 = e.target.value;
        calcRow(state.tableData[i]);
        updateRowCalc(i);
        updateTableStats();
      });
      document.getElementById(`newton-x2-${i}`).addEventListener('input', (e) => {
        state.tableData[i].x2 = e.target.value;
        calcRow(state.tableData[i]);
        updateRowCalc(i);
        updateTableStats();
      });
    });
    updateTableStats();
  }

  function updateRowCalc(i) {
    const row = state.tableData[i];
    document.getElementById(`newton-dn-${i}`).textContent  = row.dn  || '—';
    document.getElementById(`newton-dn2-${i}`).textContent = row.dn2 || '—';
    const x1el = document.getElementById(`newton-x1-${i}`);
    const x2el = document.getElementById(`newton-x2-${i}`);
    x1el.classList.toggle('invalid', !!row.x1 && !row.valid);
    x2el.classList.toggle('invalid', !!row.x2 && !row.valid);
    const statusEl = document.getElementById(`newton-status-${i}`);
    statusEl.innerHTML = `<span class="newton-table-status ${row.valid ? 'valid' : (row.x1 || row.x2 ? 'invalid' : 'empty')}">
      ${row.valid ? '✓ OK' : (row.x1 || row.x2 ? '✗ ERR' : '—')}
    </span>`;
  }

  function refreshTable() {
    state.tableData.forEach((row, i) => {
      const x1el = document.getElementById(`newton-x1-${i}`);
      const x2el = document.getElementById(`newton-x2-${i}`);
      if (x1el) x1el.value = row.x1;
      if (x2el) x2el.value = row.x2;
      updateRowCalc(i);
    });
    updateTableStats();
  }

  function updateTableStats() {
    const valid = state.tableData.filter(r => r.valid).length;
    const filled = state.tableData.filter(r => r.x1 !== '' || r.x2 !== '').length;
    document.getElementById('newton-table-valid-count').textContent = `${valid} / ${NUM_RINGS} valid`;
    document.getElementById('newton-table-completeness').textContent = `${Math.round(valid / NUM_RINGS * 100)}% complete`;
  }

  buildTable();

  // Auto-fill
  document.getElementById('newton-btn-auto-fill').addEventListener('click', () => {
    const lambda_mm = state.wavelength * 1e-6;
    const R_mm = state.radiusCm * 10;
    const baseCenter = 12.0;
    state.tableData.forEach(row => {
      const Dn = Math.sqrt(4 * lambda_mm * R_mm * row.n);
      const x1 = scatter(baseCenter - Dn / 2, 0.01);
      const x2 = scatter(baseCenter + Dn / 2, 0.01);
      row.x1 = x1.toFixed(3);
      row.x2 = x2.toFixed(3);
      calcRow(row);
    });
    refreshTable();
  });

  // Reset table
  document.getElementById('newton-btn-reset-table').addEventListener('click', () => {
    state.tableData.forEach(row => {
      row.x1 = ''; row.x2 = ''; row.dn = ''; row.dn2 = ''; row.valid = false;
    });
    state.recordings = {};
    refreshTable();
    renderRecordedList();
  });

  // Plot button
  document.getElementById('newton-btn-plot').addEventListener('click', () => {
    // Switch to graph tab
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    const graphTab = document.querySelector('[data-tab="newton-tab-graph"]');
    const graphPanel = document.getElementById('newton-tab-graph');
    if (graphTab) graphTab.classList.add('active');
    if (graphPanel) graphPanel.classList.add('active');
    renderGraph();
  });

  // ════════════════════════════════════════════════════════════
  // GRAPH
  // ════════════════════════════════════════════════════════════
  function renderGraph() {
    const validRows = state.tableData.filter(r => r.valid);
    if (validRows.length < 2) {
      if (state.chartInst) { state.chartInst.destroy(); state.chartInst = null; }
      document.getElementById('newton-graph-slope').textContent = '—';
      document.getElementById('newton-graph-intercept').textContent = '—';
      document.getElementById('newton-graph-r2').textContent = '—';
      document.getElementById('newton-graph-points').textContent = '0';
      return;
    }

    const xs = validRows.map(r => r.n);
    const ys = validRows.map(r => parseFloat(r.dn2));
    const { slope, intercept, r2 } = linReg(xs, ys);

    // Best-fit line points
    const xMin = 0, xMax = Math.max(...xs) + 1;
    const bfData = [
      { x: xMin, y: slope * xMin + intercept },
      { x: xMax, y: slope * xMax + intercept },
    ];

    // Destroy previous chart
    if (state.chartInst) { state.chartInst.destroy(); state.chartInst = null; }

    const chartCtx = document.getElementById('newton-chart').getContext('2d');
    state.chartInst = new Chart(chartCtx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Dₙ² (measured)',
            data: validRows.map(r => ({ x: r.n, y: parseFloat(r.dn2) })),
            backgroundColor: 'rgba(0,229,255,0.85)',
            borderColor: 'rgba(0,229,255,1)',
            pointRadius: 7,
            pointHoverRadius: 10,
            pointStyle: 'circle',
          },
          {
            label: 'Best-fit Line',
            data: bfData,
            type: 'line',
            borderColor: 'rgba(255,112,67,0.9)',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            borderDash: [6, 3],
            pointRadius: 0,
            tension: 0,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: 'rgba(224,240,255,0.7)',
              font: { family: 'Rajdhani', size: 13 },
              usePointStyle: true,
            }
          },
          tooltip: {
            backgroundColor: 'rgba(10,20,36,0.95)',
            borderColor: 'rgba(0,229,255,0.3)',
            borderWidth: 1,
            titleColor: '#00e5ff',
            bodyColor: '#e0f0ff',
            titleFont: { family: 'Share Tech Mono', size: 12 },
            bodyFont:  { family: 'Share Tech Mono', size: 12 },
            callbacks: {
              label: ctx => {
                if (ctx.dataset.label.includes('Best')) {
                  return ` Fit: ${ctx.parsed.y.toFixed(4)} mm²`;
                }
                return ` n=${ctx.parsed.x}, Dₙ²=${ctx.parsed.y.toFixed(6)} mm²`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Ring Number (n)',
              color: 'rgba(0,229,255,0.7)',
              font: { family: 'Orbitron', size: 12 },
            },
            ticks: { color: 'rgba(224,240,255,0.5)', font: { family: 'Share Tech Mono' }, stepSize: 1 },
            grid: { color: 'rgba(0,229,255,0.07)' },
            border: { color: 'rgba(0,229,255,0.2)' },
          },
          y: {
            title: {
              display: true,
              text: 'Dₙ² (mm²)',
              color: 'rgba(0,229,255,0.7)',
              font: { family: 'Orbitron', size: 12 },
            },
            ticks: { color: 'rgba(224,240,255,0.5)', font: { family: 'Share Tech Mono' } },
            grid: { color: 'rgba(0,229,255,0.07)' },
            border: { color: 'rgba(0,229,255,0.2)' },
          }
        }
      }
    });

    document.getElementById('newton-graph-slope').textContent = slope.toFixed(6) + ' mm²';
    document.getElementById('newton-graph-intercept').textContent = intercept.toFixed(6);
    document.getElementById('newton-graph-r2').textContent = r2.toFixed(5);
    document.getElementById('newton-graph-points').textContent = validRows.length;
  }

  // ════════════════════════════════════════════════════════════
  // CALCULATIONS
  // ════════════════════════════════════════════════════════════
  function updateGivenPanel() {
    document.getElementById('newton-given-lambda').textContent = state.wavelength + ' nm';
    document.getElementById('newton-given-radius').textContent = state.radiusCm + ' cm';
  }

  document.getElementById('newton-btn-calculate').addEventListener('click', () => {
    runCalculations();
  });

  function runCalculations() {
    updateGivenPanel();
    const validRows = state.tableData.filter(r => r.valid);
    const stepsEl = document.getElementById('newton-calc-steps');
    const resultEl = document.getElementById('newton-result-display');
    const errorPanel = document.getElementById('newton-error-panel');
    const errorList = document.getElementById('newton-error-list');

    // Clear
    stepsEl.innerHTML = '';
    errorList.innerHTML = '';
    errorPanel.style.display = 'none';

    // Validation
    const errors = [];
    if (validRows.length < 3) errors.push('Need at least 3 valid observations to calculate R');
    state.tableData.forEach((row, i) => {
      if ((row.x1 !== '' || row.x2 !== '') && !row.valid) {
        errors.push(`Row ${i+1} (Ring ${row.n}): x₂ must be greater than x₁`);
      }
    });

    if (errors.length) {
      errorPanel.style.display = 'block';
      errors.forEach(e => {
        const div = document.createElement('div');
        div.className = 'newton-error-item';
        div.textContent = e;
        errorList.appendChild(div);
      });
    }

    if (validRows.length < 2) {
      stepsEl.innerHTML = `<div class="newton-calc-placeholder">⚠ Insufficient data. Fill at least 3 rows in the Observation Table first.</div>`;
      resultEl.innerHTML = `<div class="newton-result-placeholder">Insufficient data</div>`;
      return;
    }

    const xs = validRows.map(r => r.n);
    const ys = validRows.map(r => parseFloat(r.dn2));
    const { slope, intercept, r2 } = linReg(xs, ys);

    const lambda_nm  = state.wavelength;
    const lambda_mm  = lambda_nm * 1e-6;
    const lambda_cm  = lambda_mm * 0.1;
    const R_calc_mm  = slope / (4 * lambda_mm);
    const R_calc_cm  = R_calc_mm / 10;

    // Steps
    function step(title, body) {
      const div = document.createElement('div');
      div.className = 'newton-calc-step';
      div.innerHTML = `<div class="newton-calc-step-title">${title}</div><div class="newton-calc-step-body">${body}</div>`;
      stepsEl.appendChild(div);
    }

    step('STEP 1 — Given', `
      λ = <span class="eq">${lambda_nm} nm</span>
          = <span class="val">${lambda_mm.toExponential(4)} mm</span><br>
      Set R = <span class="eq">${state.radiusCm} cm</span>
            = <span class="val">${state.radiusCm * 10} mm</span>
    `);

    step('STEP 2 — Diameter Values (Dₙ²)', validRows.map(r =>
      `n = <span class="eq">${r.n}</span> → Dₙ = <span class="val">${r.dn} mm</span>, Dₙ² = <span class="val">${r.dn2} mm²</span>`
    ).join('<br>'));

    step('STEP 3 — Linear Regression (Dₙ² vs n)', `
      Fitting: <span class="eq">Dₙ² = slope × n + intercept</span><br>
      <br>
      Slope (m) = <span class="val">${slope.toFixed(6)} mm²</span><br>
      Intercept = <span class="val">${intercept.toFixed(6)} mm²</span><br>
      R² = <span class="${r2 > 0.99 ? 'res' : 'val'}">${r2.toFixed(5)}</span>
      ${r2 > 0.99 ? '&nbsp;✓ Excellent fit' : '&nbsp;⚠ Check readings'}
    `);

    step('STEP 4 — Apply Formula', `
      Formula: <span class="eq">R = Slope / (4λ)</span><br>
      <br>
      R = <span class="val">${slope.toFixed(6)}</span> / (4 × <span class="val">${lambda_mm.toExponential(4)}</span>)<br>
      R = <span class="val">${slope.toFixed(6)}</span> / <span class="val">${(4 * lambda_mm).toExponential(4)}</span><br>
      <br>
      R = <span class="res">${R_calc_mm.toFixed(2)} mm</span>
        = <span class="res">${R_calc_cm.toFixed(3)} cm</span>
    `);

    const error_pct = Math.abs(R_calc_cm - state.radiusCm) / state.radiusCm * 100;
    step('STEP 5 — Verification', `
      Calculated R = <span class="res">${R_calc_cm.toFixed(3)} cm</span><br>
      Set R (slider) = <span class="val">${state.radiusCm} cm</span><br>
      Error = <span class="${error_pct < 5 ? 'res' : 'val'}">${error_pct.toFixed(2)} %</span>
      ${error_pct < 5 ? '&nbsp;✓ Within acceptable range' : '&nbsp;⚠ High error — check readings'}
    `);

    step('STEP 6 — Alternative (Point Method)', (() => {
      if (validRows.length < 2) return 'Insufficient data';
      // Use last and first valid ring: Dm² - Dn² = 4λR(m-n)
      const last = validRows[validRows.length - 1];
      const first = validRows[0];
      const dm2 = parseFloat(last.dn2), dn2 = parseFloat(first.dn2);
      const m = last.n, n = first.n;
      const R_alt_mm = (dm2 - dn2) / (4 * lambda_mm * (m - n));
      const R_alt_cm = R_alt_mm / 10;
      return `
        Using rings m=${m} and n=${first.n}:<br>
        R = (D<sub>m</sub>² − D<sub>n</sub>²) / (4λ(m−n))<br>
        R = (<span class="val">${dm2.toFixed(6)}</span> − <span class="val">${dn2.toFixed(6)}</span>)
            / (4 × <span class="val">${lambda_mm.toExponential(3)}</span> × <span class="val">${m-n}</span>)<br>
        R = <span class="res">${R_alt_cm.toFixed(3)} cm</span>
      `;
    })());

    // Result
    resultEl.innerHTML = `
      <div class="newton-result-main">
        <div style="font-size:13px;color:var(--text-muted);letter-spacing:2px;font-family:var(--font-title)">RADIUS OF CURVATURE</div>
        <div class="newton-result-value">${R_calc_cm.toFixed(3)}</div>
        <div class="newton-result-unit">cm</div>
        <div class="newton-result-sub">
          = ${R_calc_mm.toFixed(2)} mm<br>
          Slope = ${slope.toFixed(6)} mm²<br>
          λ = ${lambda_nm} nm = ${lambda_mm.toExponential(4)} mm<br>
          R² = ${r2.toFixed(5)}
        </div>
        <div class="newton-result-badge">${error_pct < 5 ? '✓ EXPERIMENT SUCCESS' : '⚠ CHECK READINGS'}</div>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════
  // KEYBOARD ACCESSIBILITY
  // ════════════════════════════════════════════════════════════
  document.querySelectorAll('.newton-move-btn').forEach(btn => {
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } });
  });

} // end initNewtonsLab
