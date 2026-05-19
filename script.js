/* ═══════════════════════════════════════════════════════
   NEWTON'S RINGS — script.js  (Physics-accurate v3)
   All logic inside initNewtonsLab()
   Prefix: nw-
═══════════════════════════════════════════════════════ */

function initNewtonsLab() {

  if (!document.getElementById('nw-canvas')) return;

  // ═══════════════════════════════════════════════════
  // CONSTANTS & STATE
  // ═══════════════════════════════════════════════════
  const NUM_RINGS   = 10;
  const WL_DEFAULT  = 589;   // nm
  const R_DEFAULT   = 100;   // cm
  const FOC_DEFAULT = 5.0;

  // Physics reference: at λ=589nm, R=100cm → D10 ≈ 4.857 mm
  // We set the canvas viewport so D10 fills ~88% of the canvas at defaults.
  // VIEWPORT_MM is the physical diameter (mm) shown in the canvas at all times.
  // It scales with √(λ·R) so rings always fill the view proportionally.
  const REF_LMM = WL_DEFAULT * 1e-6;  // mm
  const REF_RMM = R_DEFAULT  * 10;    // mm
  const REF_D10 = Math.sqrt(4 * REF_LMM * REF_RMM * 10); // ≈ 4.857 mm

  const S = {
    running:    false,
    animId:     null,
    tick:       0,
    wl:         WL_DEFAULT,
    rCm:        R_DEFAULT,
    focus:      FOC_DEFAULT,
    microPos:   1200,        // 0–2400 maps to 0–24 mm on stage
    recordings: {},
    tableData:  [],
    chartInst:  null,
  };

  for (let i = 1; i <= NUM_RINGS; i++)
    S.tableData.push({ n: i, x1: '', x2: '', dn: '', dn2: '', valid: false });

  // ─── Core physics helpers ──────────────────────────
  // Dn = √(4λRn)  (λ and R both in mm)
  function ringRadius(n) {
    return Math.sqrt(4 * S.wl * 1e-6 * S.rCm * 10 * n) / 2; // mm
  }

  // Physical extent of the pattern: use D10 as reference
  function patternD10() {
    return Math.sqrt(4 * S.wl * 1e-6 * S.rCm * 10 * 10); // mm
  }

  // ═══════════════════════════════════════════════════
  // HAMBURGER
  // ═══════════════════════════════════════════════════
  const hamburger  = document.getElementById('nw-hamburger');
  const mobileMenu = document.getElementById('nw-mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.style.maxHeight && mobileMenu.style.maxHeight !== '0px';
      mobileMenu.style.maxHeight = open ? '0px' : mobileMenu.scrollHeight + 'px';
      hamburger.setAttribute('aria-expanded', String(!open));
      document.getElementById('nw-ham-1').style.transform = open ? '' : 'translateY(7px) rotate(45deg)';
      document.getElementById('nw-ham-2').style.opacity   = open ? '1' : '0';
      document.getElementById('nw-ham-3').style.transform = open ? '' : 'translateY(-7px) rotate(-45deg)';
    });
  }

  // ═══════════════════════════════════════════════════
  // TAB SWITCHING
  // ═══════════════════════════════════════════════════
  document.querySelectorAll('.nw-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nw-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.nw-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add('active');
      if (tab.dataset.tab === 'nw-panel-graph') renderGraph();
      if (tab.dataset.tab === 'nw-panel-calc')  updateGivenPanel();
      // Redraw eyepiece when switching to microscope tab
      if (tab.dataset.tab === 'nw-panel-micro') drawEyepiece();
    });
  });

  // ═══════════════════════════════════════════════════
  // WAVELENGTH → RGB
  // ═══════════════════════════════════════════════════
  function wlToRGB(nm) {
    let r, g, b;
    if      (nm < 440) { r = -(nm-440)/(440-380); g = 0; b = 1; }
    else if (nm < 490) { r = 0; g = (nm-440)/50;  b = 1; }
    else if (nm < 510) { r = 0; g = 1; b = -(nm-510)/20; }
    else if (nm < 580) { r = (nm-510)/70; g = 1; b = 0; }
    else if (nm < 645) { r = 1; g = -(nm-645)/65; b = 0; }
    else               { r = 1; g = 0; b = 0; }
    const fac = nm < 420 ? 0.3 + 0.7*(nm-380)/40
              : nm > 700 ? 0.3 + 0.7*(780-nm)/80 : 1;
    const g2 = 0.8;
    return [
      Math.round(255 * Math.pow(Math.max(0,r)*fac, g2)),
      Math.round(255 * Math.pow(Math.max(0,g)*fac, g2)),
      Math.round(255 * Math.pow(Math.max(0,b)*fac, g2)),
    ];
  }

  // ═══════════════════════════════════════════════════
  // SLIDERS — update state AND redraw immediately
  // ═══════════════════════════════════════════════════
  const wlSlider    = document.getElementById('nw-wl-slider');
  const rSlider     = document.getElementById('nw-r-slider');
  const focusSlider = document.getElementById('nw-focus-slider');

  wlSlider.addEventListener('input', () => {
    S.wl = +wlSlider.value;
    document.getElementById('nw-wl-val').textContent = S.wl + ' nm';
    updateSpectrumCursor();
    updateReadouts();
    buildRingBadges();
    if (!S.running) drawSim(S.tick); // redraw immediately when paused
    drawEyepiece();
  });

  rSlider.addEventListener('input', () => {
    S.rCm = +rSlider.value;
    document.getElementById('nw-r-val').textContent = S.rCm + ' cm';
    updateReadouts();
    buildRingBadges();
    if (!S.running) drawSim(S.tick);
    drawEyepiece();
  });

  focusSlider.addEventListener('input', () => {
    S.focus = +focusSlider.value;
    document.getElementById('nw-focus-val').textContent = S.focus.toFixed(1);
    if (!S.running) drawSim(S.tick);
    drawEyepiece();
  });

  function updateSpectrumCursor() {
    const pct = ((S.wl - 400) / 300) * 100;
    const cur = document.getElementById('nw-spectrum-cursor');
    const [r,g,b] = wlToRGB(S.wl);
    cur.style.left       = pct + '%';
    cur.style.background = `rgb(${r},${g},${b})`;
    cur.style.boxShadow  = `0 0 8px rgb(${r},${g},${b})`;
  }
  updateSpectrumCursor();

  function updateReadouts() {
    document.getElementById('nw-ro-lambda').textContent = S.wl + ' nm';
    document.getElementById('nw-ro-radius').textContent = S.rCm + ' cm';
    document.getElementById('nw-ro-rings').textContent  = NUM_RINGS;
    document.getElementById('nw-ro-d1').textContent     = (ringRadius(1)*2).toFixed(4) + ' mm';
  }
  updateReadouts();

  function buildRingBadges() {
    const el = document.getElementById('nw-ring-badges');
    el.innerHTML = '';
    for (let n = 1; n <= NUM_RINGS; n++) {
      const d = document.createElement('div');
      d.className = 'nw-ring-badge';
      d.innerHTML = `<span style="color:var(--laser)">n=${n}</span><br>${(ringRadius(n)*2).toFixed(4)}mm`;
      el.appendChild(d);
    }
  }
  buildRingBadges();

  // ═══════════════════════════════════════════════════
  // SIMULATION CANVAS  — physics-accurate scaling
  // ═══════════════════════════════════════════════════
  const simCanvas = document.getElementById('nw-canvas');
  const simCtx    = simCanvas.getContext('2d');
  const overlay   = document.getElementById('nw-overlay');
  const CW = simCanvas.width, CH = simCanvas.height;
  const CX = CW/2, CY = CH/2;
  const MAXR_PX = CW/2 - 8;  // usable canvas radius in pixels

  /*
   * PHYSICS-ACCURATE SCALING STRATEGY
   * ───────────────────────────────────
   * We keep a FIXED physical viewport: the canvas always represents a circle
   * of diameter VIEWPORT_MM on the glass plate.  VIEWPORT_MM is set once at
   * the reference parameters (λ=589 nm, R=100 cm) so that ring-10 sits at
   * ~88 % of the canvas radius.
   *
   * VIEWPORT_MM = 2 * REF_D10 / 0.88     (constant — never changes)
   * pxPerMm     = (2 * MAXR_PX) / VIEWPORT_MM   (constant — never changes)
   *
   * Because the viewport is FIXED in physical mm, when λ or R changes:
   *   • ringRadius(n) = √(4λRn)/2  grows or shrinks
   *   • Each ring is drawn at ringRadius(n) * pxPerMm pixels from centre
   *   • So rings visually expand / contract exactly as physics dictates
   *
   * The interference phase is computed from actual physical coordinates
   * (r_mm = rpx / pxPerMm), so the fringe pattern is always consistent.
   */
  const VIEWPORT_MM = (REF_D10 / 0.88);          // physical mm shown across half-canvas
  const PX_PER_MM   = (MAXR_PX) / VIEWPORT_MM;   // fixed conversion — set once

  function getPxPerMm() {
    return PX_PER_MM;   // FIXED viewport → rings grow/shrink visually with λ and R
  }

  function drawSim(t) {
    simCtx.clearRect(0, 0, CW, CH);

    const lmm    = S.wl * 1e-6;
    const Rmm    = S.rCm * 10;
    const pxPerMm = getPxPerMm();  // fixed viewport anchor

    // Background
    const bg = simCtx.createRadialGradient(CX,CY,0,CX,CY,MAXR_PX);
    bg.addColorStop(0,'rgba(20,30,50,1)');
    bg.addColorStop(1,'rgba(2,6,23,1)');
    simCtx.fillStyle = bg;
    simCtx.beginPath(); simCtx.arc(CX,CY,MAXR_PX,0,Math.PI*2); simCtx.fill();

    // Pixel-level interference — physically correct
    const imgData = simCtx.getImageData(CX-MAXR_PX, CY-MAXR_PX, MAXR_PX*2, MAXR_PX*2);
    const data    = imgData.data;
    const [wr,wg,wb] = wlToRGB(S.wl);
    const focus  = Math.max(0.5, S.focus / 5.0);
    const pulse  = 1 + 0.003 * Math.sin(t * 0.02);

    for (let py = 0; py < MAXR_PX*2; py++) {
      for (let px = 0; px < MAXR_PX*2; px++) {
        const dx = px - MAXR_PX, dy = py - MAXR_PX;
        const rpx = Math.sqrt(dx*dx + dy*dy);
        if (rpx > MAXR_PX) continue;

        // Convert pixel → physical mm on the glass plate
        const r_mm = rpx / pxPerMm;

        // Air-gap formula: t = r² / (2R)
        const airGap = (r_mm * r_mm) / (2 * Rmm);

        // Phase difference: δ = 2π·(2t)/λ  (factor 2 for double-path + π for reflection)
        const phase = (2 * airGap / lmm) * Math.PI * 2;

        // Fringe order N = r / √(λR/2)  (proportional to ring number)
        const N    = r_mm / (Math.sqrt(lmm * Rmm / 2) + 1e-12);
        const damp = Math.exp(-N * 0.014 / focus);

        // Intensity: I = I₀(1 - cos δ)/2
        const I = (1 - Math.cos(phase * pulse)) / 2 * damp;

        const idx = (py * MAXR_PX*2 + px) * 4;
        data[idx]   = Math.round(wr * I * 0.92);
        data[idx+1] = Math.round(wg * I * 0.92);
        data[idx+2] = Math.round(wb * I * 0.92);
        data[idx+3] = 255;
      }
    }
    simCtx.putImageData(imgData, CX-MAXR_PX, CY-MAXR_PX);

    // Central dark spot
    simCtx.fillStyle = 'rgba(6,182,212,0.6)';
    simCtx.beginPath(); simCtx.arc(CX,CY,2.5,0,Math.PI*2); simCtx.fill();

    // Crosshair
    simCtx.strokeStyle = 'rgba(6,182,212,0.07)';
    simCtx.lineWidth = 1; simCtx.setLineDash([4,6]);
    simCtx.beginPath(); simCtx.moveTo(CX,CY-MAXR_PX); simCtx.lineTo(CX,CY+MAXR_PX); simCtx.stroke();
    simCtx.beginPath(); simCtx.moveTo(CX-MAXR_PX,CY); simCtx.lineTo(CX+MAXR_PX,CY); simCtx.stroke();
    simCtx.setLineDash([]);
  }

  function animLoop() {
    if (!S.running) return;
    S.tick++;
    drawSim(S.tick);
    S.animId = requestAnimationFrame(animLoop);
  }

  const btnStart    = document.getElementById('nw-btn-start');
  const btnPause    = document.getElementById('nw-btn-pause');
  const btnResetSim = document.getElementById('nw-btn-reset-sim');
  const statusText  = document.getElementById('nw-status-text');
  const ping        = document.getElementById('nw-ping');

  function setPingColor(color) {
    const colors = { green:'green', yellow:'yellow', red:'red' };
    const c = colors[color] || 'red';
    ping.className = `animate-ping absolute inline-flex h-full w-full rounded-full bg-${c}-400 opacity-75`;
    ping.nextElementSibling.className = `relative inline-flex rounded-full h-2 w-2 bg-${c}-500`;
  }

  btnStart.addEventListener('click', () => {
    if (S.running) return;
    S.running = true;
    overlay.classList.add('hidden');
    btnStart.disabled = true; btnPause.disabled = false;
    statusText.textContent = 'Live'; setPingColor('green');
    animLoop();
  });

  btnPause.addEventListener('click', () => {
    S.running = false; cancelAnimationFrame(S.animId);
    overlay.classList.remove('hidden');
    btnStart.disabled = false; btnPause.disabled = true;
    statusText.textContent = 'Paused'; setPingColor('yellow');
  });

  btnResetSim.addEventListener('click', () => {
    S.running = false; cancelAnimationFrame(S.animId); S.tick = 0;
    S.wl = WL_DEFAULT; S.rCm = R_DEFAULT; S.focus = FOC_DEFAULT;
    wlSlider.value = WL_DEFAULT; rSlider.value = R_DEFAULT; focusSlider.value = FOC_DEFAULT;
    document.getElementById('nw-wl-val').textContent    = WL_DEFAULT + ' nm';
    document.getElementById('nw-r-val').textContent     = R_DEFAULT + ' cm';
    document.getElementById('nw-focus-val').textContent = FOC_DEFAULT.toFixed(1);
    updateSpectrumCursor(); updateReadouts(); buildRingBadges();
    overlay.classList.remove('hidden');
    btnStart.disabled = false; btnPause.disabled = true;
    statusText.textContent = 'Idle'; setPingColor('red');
    drawSim(0);
  });

  drawSim(0); // initial static frame

  // ═══════════════════════════════════════════════════
  // TRAVELLING MICROSCOPE — physics-accurate eyepiece
  // ═══════════════════════════════════════════════════
  const eyeCanvas   = document.getElementById('nw-eyepiece');
  const eyeCtx      = eyeCanvas.getContext('2d');
  const microSlider = document.getElementById('nw-micro-pos');
  const EW = eyeCanvas.width, EH = eyeCanvas.height;
  const ECX = EW/2, ECY = EH/2;

  // The microscope stage spans 0–24 mm physical width.
  // The ring pattern is centred at 12.0 mm on this stage.
  const STAGE_CENTER_MM = 12.0;

  function pos2mm(pos) { return pos * 0.01; }  // 0–2400 → 0–24 mm

  function getReading(pos) {
    const total = parseFloat(pos2mm(pos).toFixed(3));
    const ms    = Math.floor(total * 2) / 2;
    const vs    = parseFloat((total - ms).toFixed(3));
    return { ms, vs, total };
  }

  // Eyepiece pixel scale — shares the same fixed physical viewport as the main canvas.
  function getEyePxPerMm() {
    // Use the SAME fixed physical viewport as the main simulation canvas.
    // PX_PER_MM is constant, so when λ or R changes, ringRadius(n) grows/shrinks
    // and rings appear proportionally larger/smaller in the eyepiece too.
    // Focus slider adds a pure magnification zoom (does not alter physics).
    const baseScale  = PX_PER_MM * (EW / CW);
    const zoomFactor = 0.7 + (S.focus / 5.0) * 0.6;  // 0.7× → 1.3× zoom range
    return baseScale * zoomFactor;
  }

  function drawEyepiece() {
    eyeCtx.clearRect(0,0,EW,EH);
    eyeCtx.save();
    eyeCtx.beginPath(); eyeCtx.arc(ECX,ECY,EW/2-2,0,Math.PI*2); eyeCtx.clip();

    // Background
    const bg = eyeCtx.createRadialGradient(ECX,ECY,0,ECX,ECY,EW/2);
    bg.addColorStop(0,'rgba(15,23,42,1)'); bg.addColorStop(1,'rgba(2,6,23,1)');
    eyeCtx.fillStyle = bg; eyeCtx.fillRect(0,0,EW,EH);

    const pxPerMm   = getEyePxPerMm();
    const viewMm    = pos2mm(S.microPos);
    const cxRing    = ECX + (STAGE_CENTER_MM - viewMm) * pxPerMm;
    const [wr,wg,wb] = wlToRGB(S.wl);
    const lmm = S.wl * 1e-6, Rmm = S.rCm * 10;

    for (let n = 1; n <= 20; n++) {
      const rn_mm = ringRadius(n);
      const rn_px = rn_mm * pxPerMm;
      const rp_px = n > 1 ? ringRadius(n-1) * pxPerMm : 0;

      // Skip if entirely outside the circular viewport
      const leftEdge  = cxRing - rn_px;
      const rightEdge = cxRing + rn_px;
      if (rightEdge < 0 || leftEdge > EW) continue;

      const amp = Math.exp(-n * 0.055);

      // ── Bright annulus fill ──────────────────────────
      if (n > 1 && rp_px > 0) {
        eyeCtx.beginPath();
        eyeCtx.arc(cxRing, ECY, rn_px, 0, Math.PI*2);
        eyeCtx.arc(cxRing, ECY, rp_px, 0, Math.PI*2, true);
        eyeCtx.fillStyle = `rgba(${wr},${wg},${wb},${amp*0.55})`;
        eyeCtx.fill('evenodd');
      }

      // ── Wide soft glow halo (outermost — blurry spread) ──
      if (n > 1 && rp_px > 0) {
        const midR      = (rn_px + rp_px) / 2;
        const bandWidth = rn_px - rp_px;
        eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, midR, 0, Math.PI*2);
        eyeCtx.strokeStyle = `rgba(${wr},${wg},${wb},${amp*0.18})`;
        eyeCtx.lineWidth   = bandWidth * 3.2;
        eyeCtx.stroke();

        // Medium glow
        eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, midR, 0, Math.PI*2);
        eyeCtx.strokeStyle = `rgba(${wr},${wg},${wb},${amp*0.30})`;
        eyeCtx.lineWidth   = bandWidth * 1.6;
        eyeCtx.stroke();
      }

      // ── Crisp bright inner rim (peak intensity edge) ──
      if (n > 1 && rp_px > 0) {
        const rimR = rp_px + (rn_px - rp_px) * 0.25;
        eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, rimR, 0, Math.PI*2);
        eyeCtx.strokeStyle = `rgba(${wr},${wg},${wb},${Math.min(0.95, amp*1.1)})`;
        eyeCtx.lineWidth   = Math.max(1, 2.5 * amp);
        eyeCtx.stroke();
      }

      // ── Dark ring on top (keeps fringes sharp) ──────
      eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, rn_px, 0, Math.PI*2);
      eyeCtx.strokeStyle = 'rgba(0,0,0,0.94)';
      eyeCtx.lineWidth   = Math.max(1.5, 4*(1-n*0.04));
      eyeCtx.stroke();
    }

    // Central dark spot
    eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, 5, 0, Math.PI*2);
    eyeCtx.fillStyle = 'rgba(0,0,0,0.96)'; eyeCtx.fill();

    // Scale ruler at bottom
    eyeCtx.fillStyle = 'rgba(6,182,212,0.45)';
    eyeCtx.fillRect(8, EH-20, EW-16, 1);
    for (let m = 0; m <= 24; m += 0.5) {
      const xp = ECX + (m - viewMm) * pxPerMm;
      if (xp < 4 || xp > EW-4) continue;
      const isMm = (m === Math.round(m));
      eyeCtx.fillStyle = isMm ? 'rgba(6,182,212,0.8)' : 'rgba(6,182,212,0.3)';
      eyeCtx.fillRect(xp, EH-20-(isMm?8:4), 1, isMm?8:4);
      if (isMm) {
        eyeCtx.font = '8px JetBrains Mono, monospace';
        eyeCtx.fillStyle = 'rgba(6,182,212,0.5)';
        eyeCtx.textAlign = 'center';
        eyeCtx.fillText(m, xp, EH-24);
      }
    }

    // Vignette
    const vig = eyeCtx.createRadialGradient(ECX,ECY,EW*0.28,ECX,ECY,EW/2);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.6)');
    eyeCtx.fillStyle = vig; eyeCtx.fillRect(0,0,EW,EH);
    eyeCtx.restore();

    // Rim glow
    eyeCtx.beginPath(); eyeCtx.arc(ECX,ECY,EW/2-2,0,Math.PI*2);
    eyeCtx.strokeStyle = 'rgba(6,182,212,0.45)'; eyeCtx.lineWidth = 2; eyeCtx.stroke();
  }

  function refreshScaleDisplay() {
    const { ms, vs, total } = getReading(S.microPos);
    document.getElementById('nw-ms-val').textContent      = ms.toFixed(2);
    document.getElementById('nw-vs-val').textContent      = vs.toFixed(3);
    document.getElementById('nw-total-val').textContent   = total.toFixed(3);
    document.getElementById('nw-cur-reading').textContent = total.toFixed(3) + ' mm';
    drawEyepiece();
  }

  microSlider.addEventListener('input', () => {
    S.microPos = +microSlider.value; refreshScaleDisplay();
  });
  document.getElementById('nw-mll').addEventListener('click', () => { S.microPos = Math.max(0,     S.microPos-50);  microSlider.value = S.microPos; refreshScaleDisplay(); });
  document.getElementById('nw-ml' ).addEventListener('click', () => { S.microPos = Math.max(0,     S.microPos-5);   microSlider.value = S.microPos; refreshScaleDisplay(); });
  document.getElementById('nw-mr' ).addEventListener('click', () => { S.microPos = Math.min(2400,  S.microPos+5);   microSlider.value = S.microPos; refreshScaleDisplay(); });
  document.getElementById('nw-mrr').addEventListener('click', () => { S.microPos = Math.min(2400,  S.microPos+50);  microSlider.value = S.microPos; refreshScaleDisplay(); });

  refreshScaleDisplay();

  // ═══════════════════════════════════════════════════
  // RECORD READING
  // Stores reading immediately. Pushes to table whenever
  // both L and R exist (even if added in separate sessions).
  // ═══════════════════════════════════════════════════
  document.getElementById('nw-btn-record').addEventListener('click', () => {
    const ring = +document.getElementById('nw-obs-ring').value;
    const side = document.querySelector('input[name="nw-side"]:checked').value;
    const { total } = getReading(S.microPos);

    S.recordings[`${ring}-${side}`] = total;
    renderRecordedList();

    // Always push whatever we have to the table (partial is fine, marks invalid)
    const lv = S.recordings[`${ring}-left`];
    const rv = S.recordings[`${ring}-right`];
    const row = S.tableData.find(r => r.n === ring);
    if (row) {
      if (lv !== undefined) row.x1 = lv.toFixed(3);
      if (rv !== undefined) row.x2 = rv.toFixed(3);
      calcRow(row);
    }
    refreshTableRows();

    // Visual feedback: briefly highlight the recorded side label
    const btn = document.getElementById('nw-btn-record');
    const orig = btn.textContent;
    btn.textContent = `✓ Ring ${ring} ${side === 'left' ? 'L' : 'R'} saved`;
    setTimeout(() => { btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg> Record Reading'; }, 1200);

    // Auto-advance ring selector if both sides are done
    if (lv !== undefined && rv !== undefined && ring < NUM_RINGS) {
      document.getElementById('nw-obs-ring').value = ring + 1;
      // Switch to left side for next ring
      document.querySelector('input[name="nw-side"][value="left"]').checked = true;
    }
  });

  function renderRecordedList() {
    const el = document.getElementById('nw-rec-list');
    el.innerHTML = '';
    let hasAny = false;
    for (let n = 1; n <= NUM_RINGS; n++) {
      const lv = S.recordings[`${n}-left`], rv = S.recordings[`${n}-right`];
      if (lv === undefined && rv === undefined) continue;
      hasAny = true;
      const d = document.createElement('div');
      d.className = 'nw-rec-item';
      const lOk = lv !== undefined ? `<span class="l">L: ${lv.toFixed(3)}</span>` : `<span style="color:#475569">L: —</span>`;
      const rOk = rv !== undefined ? `<span class="r">R: ${rv.toFixed(3)}</span>` : `<span style="color:#475569">R: —</span>`;
      const both = (lv !== undefined && rv !== undefined) ? '✓' : '…';
      d.innerHTML = `<span>Ring ${n} <span style="color:${both==='✓'?'#4ade80':'#fb923c'}">${both}</span></span>${lOk}${rOk}`;
      el.appendChild(d);
    }
    if (!hasAny) {
      el.innerHTML = '<p class="text-xs text-slate-500 text-center py-3">No readings recorded yet.</p>';
    }
  }

  // ═══════════════════════════════════════════════════
  // OBSERVATION TABLE
  // ═══════════════════════════════════════════════════
  function calcRow(row) {
    const x1 = parseFloat(row.x1), x2 = parseFloat(row.x2);
    if (!isNaN(x1) && !isNaN(x2) && x2 > x1) {
      const dn = x2 - x1;
      row.dn   = dn.toFixed(4);
      row.dn2  = (dn*dn).toFixed(6);
      row.valid = true;
    } else { row.dn = ''; row.dn2 = ''; row.valid = false; }
  }

  function buildTable() {
    const tbody = document.getElementById('nw-table-body');
    tbody.innerHTML = '';
    S.tableData.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.className = 'nw-row-in'; tr.id = `nw-tr-${i}`;
      tr.innerHTML = `
        <td>${i+1}</td>
        <td><strong style="color:var(--laser)">${row.n}</strong></td>
        <td><input type="number" step="0.001" class="nw-td-input" id="nw-x1-${i}" value="${row.x1}" placeholder="0.000"></td>
        <td><input type="number" step="0.001" class="nw-td-input" id="nw-x2-${i}" value="${row.x2}" placeholder="0.000"></td>
        <td class="nw-td-calc" id="nw-dn-${i}">${row.dn||'—'}</td>
        <td class="nw-td-calc" id="nw-dn2-${i}">${row.dn2||'—'}</td>
        <td id="nw-st-${i}"><span class="nw-status empty">—</span></td>
      `;
      tbody.appendChild(tr);

      // Allow user to freely edit table values
      document.getElementById(`nw-x1-${i}`).addEventListener('input', e => {
        S.tableData[i].x1 = e.target.value;
        // Sync back to recordings so they stay consistent
        S.recordings[`${row.n}-left`] = parseFloat(e.target.value);
        calcRow(S.tableData[i]); updateRowUI(i); updateTableStats();
      });
      document.getElementById(`nw-x2-${i}`).addEventListener('input', e => {
        S.tableData[i].x2 = e.target.value;
        S.recordings[`${row.n}-right`] = parseFloat(e.target.value);
        calcRow(S.tableData[i]); updateRowUI(i); updateTableStats();
      });
    });
    updateTableStats();
  }

  function updateRowUI(i) {
    const row = S.tableData[i];
    document.getElementById(`nw-dn-${i}`).textContent  = row.dn  || '—';
    document.getElementById(`nw-dn2-${i}`).textContent = row.dn2 || '—';
    document.getElementById(`nw-x1-${i}`).classList.toggle('invalid', row.x1!=='' && !row.valid);
    document.getElementById(`nw-x2-${i}`).classList.toggle('invalid', row.x2!=='' && !row.valid);
    const hasData = row.x1!=='' || row.x2!=='';
    const cls = row.valid ? 'ok' : hasData ? 'err' : 'empty';
    const txt = row.valid ? '✓ OK' : hasData ? '✗ Err' : '—';
    document.getElementById(`nw-st-${i}`).innerHTML = `<span class="nw-status ${cls}">${txt}</span>`;
  }

  function refreshTableRows() {
    S.tableData.forEach((row, i) => {
      const x1el = document.getElementById(`nw-x1-${i}`);
      const x2el = document.getElementById(`nw-x2-${i}`);
      if (x1el) x1el.value = row.x1;
      if (x2el) x2el.value = row.x2;
      updateRowUI(i);
    });
    updateTableStats();
  }

  function updateTableStats() {
    const valid = S.tableData.filter(r => r.valid).length;
    document.getElementById('nw-valid-count').textContent  = `${valid} / ${NUM_RINGS} valid`;
    document.getElementById('nw-completeness').textContent = `${Math.round(valid/NUM_RINGS*100)}% complete`;
  }

  buildTable();

  // Auto-fill uses current λ and R
  document.getElementById('nw-btn-autofill').addEventListener('click', () => {
    const base = STAGE_CENTER_MM;
    S.tableData.forEach(row => {
      const Dn = ringRadius(row.n) * 2;
      const x1 = scatter(base - Dn/2, 0.008);
      const x2 = scatter(base + Dn/2, 0.008);
      row.x1 = x1.toFixed(3); row.x2 = x2.toFixed(3);
      S.recordings[`${row.n}-left`]  = x1;
      S.recordings[`${row.n}-right`] = x2;
      calcRow(row);
    });
    refreshTableRows();
    renderRecordedList();
  });

  document.getElementById('nw-btn-reset-table').addEventListener('click', () => {
    if (!confirm('Clear all recorded data?')) return;
    S.tableData.forEach(r => { r.x1=''; r.x2=''; r.dn=''; r.dn2=''; r.valid=false; });
    S.recordings = {};
    refreshTableRows();
    renderRecordedList();
  });

  // Plot button → switch to graph tab and render
  document.getElementById('nw-btn-plot').addEventListener('click', () => {
    document.querySelectorAll('.nw-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nw-panel').forEach(p => p.classList.remove('active'));
    const gt = document.querySelector('[data-tab="nw-panel-graph"]');
    if (gt) { gt.classList.add('active'); document.getElementById('nw-panel-graph').classList.add('active'); }
    renderGraph();
  });

  function scatter(v, pct) { return v * (1 + (Math.random() - 0.5) * pct); }

  // ═══════════════════════════════════════════════════
  // GRAPH
  // ═══════════════════════════════════════════════════
  function linReg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
    let sx=0,sy=0,sxy=0,sx2=0;
    xs.forEach((x,i)=>{ sx+=x; sy+=ys[i]; sxy+=x*ys[i]; sx2+=x*x; });
    const m = (n*sxy-sx*sy)/(n*sx2-sx*sx);
    const b = (sy-m*sx)/n;
    const yMean = sy/n;
    let sst=0, ssr=0;
    ys.forEach((y,i)=>{ sst+=(y-yMean)**2; ssr+=(y-(m*xs[i]+b))**2; });
    return { slope:m, intercept:b, r2: sst>0?1-ssr/sst:1 };
  }

  function renderGraph() {
    const valid = S.tableData.filter(r => r.valid);
    const slopeEl=document.getElementById('nw-g-slope'), intEl=document.getElementById('nw-g-int'),
          r2El=document.getElementById('nw-g-r2'),       ptsEl=document.getElementById('nw-g-pts');
    if (valid.length < 2) {
      if (S.chartInst) { S.chartInst.destroy(); S.chartInst = null; }
      [slopeEl,intEl,r2El,ptsEl].forEach(e=>{ if(e) e.textContent='—'; });
      return;
    }
    const xs = valid.map(r => r.n);
    const ys = valid.map(r => parseFloat(r.dn2));
    const { slope, intercept, r2 } = linReg(xs, ys);
    const xMax = Math.max(...xs) + 1;
    if (S.chartInst) { S.chartInst.destroy(); S.chartInst = null; }
    const ctx = document.getElementById('nw-chart').getContext('2d');
    S.chartInst = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Dₙ² (measured)', data: valid.map(r=>({x:r.n,y:parseFloat(r.dn2)})),
            backgroundColor:'rgba(6,182,212,0.9)', borderColor:'rgba(6,182,212,1)', pointRadius:7, pointHoverRadius:10 },
          { label: 'Best-fit Line', data:[{x:0,y:intercept},{x:xMax,y:slope*xMax+intercept}],
            type:'line', showLine:true, borderColor:'rgba(251,146,60,0.9)', backgroundColor:'transparent',
            borderWidth:2.5, borderDash:[6,4], pointRadius:0, tension:0 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        animation:{ duration:600, easing:'easeOutCubic' },
        plugins:{
          legend:{ labels:{ color:'#cbd5e1', font:{family:'Inter',size:12}, usePointStyle:true } },
          tooltip:{
            backgroundColor:'rgba(15,23,42,0.95)', borderColor:'rgba(6,182,212,0.5)', borderWidth:1,
            titleColor:'#06b6d4', bodyColor:'#f8fafc', padding:10, cornerRadius:8,
            callbacks:{ label: ctx => ` n=${ctx.parsed.x}, Dₙ²=${ctx.parsed.y.toFixed(6)} mm²` }
          }
        },
        scales:{
          x:{ title:{display:true,text:'Ring Number (n)',color:'#94a3b8',font:{size:12}}, ticks:{color:'#94a3b8',stepSize:1}, grid:{color:'rgba(255,255,255,0.06)'} },
          y:{ title:{display:true,text:'Dₙ² (mm²)',color:'#94a3b8',font:{size:12}}, ticks:{color:'#94a3b8'}, grid:{color:'rgba(255,255,255,0.06)'} }
        }
      }
    });
    slopeEl.textContent = slope.toFixed(6)+' mm²';
    intEl.textContent   = intercept.toFixed(6);
    r2El.textContent    = r2.toFixed(5);
    ptsEl.textContent   = valid.length;
  }

  // ═══════════════════════════════════════════════════
  // CALCULATIONS
  // ═══════════════════════════════════════════════════
  function updateGivenPanel() {
    document.getElementById('nw-given-lambda').textContent = S.wl + ' nm';
    document.getElementById('nw-given-r').textContent      = S.rCm + ' cm';
  }

  document.getElementById('nw-btn-calc').addEventListener('click', () => {
    updateGivenPanel();
    const valid    = S.tableData.filter(r => r.valid);
    const stepsEl  = document.getElementById('nw-calc-steps');
    const resultEl = document.getElementById('nw-result-display');
    const errPanel = document.getElementById('nw-error-panel');
    const errList  = document.getElementById('nw-error-list');
    stepsEl.innerHTML = ''; errList.innerHTML = ''; errPanel.style.display = 'none';

    const errors = [];
    if (valid.length < 3) errors.push('Need at least 3 valid observations to compute R.');
    S.tableData.forEach((row,i) => {
      if ((row.x1!==''||row.x2!=='') && !row.valid)
        errors.push(`Row ${i+1} (Ring ${row.n}): x₂ must be greater than x₁.`);
    });
    if (errors.length) {
      errPanel.style.display = 'block';
      errors.forEach(e => {
        const d = document.createElement('div');
        d.className = 'bg-red-900/20 border border-red-500/20 rounded-lg p-2 text-red-400 text-xs';
        d.textContent = e; errList.appendChild(d);
      });
    }
    if (valid.length < 2) {
      stepsEl.innerHTML = `<div class="text-center py-10 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl">⚠ Fill at least 3 rows in the Observation Table first.</div>`;
      resultEl.innerHTML = `<p class="text-slate-500 text-sm">Insufficient data</p>`;
      return;
    }

    const xs   = valid.map(r => r.n);
    const ys   = valid.map(r => parseFloat(r.dn2));
    const { slope, intercept, r2 } = linReg(xs, ys);
    const lmm  = S.wl * 1e-6;
    const Rcalc = slope / (4 * lmm);
    const RcalcCm = Rcalc / 10;
    const errPct = Math.abs(RcalcCm - S.rCm) / S.rCm * 100;

    function addStep(title, html) {
      const d = document.createElement('div'); d.className = 'nw-calc-step';
      d.innerHTML = `<div class="nw-step-title">${title}</div><div class="nw-step-body">${html}</div>`;
      stepsEl.appendChild(d);
    }

    addStep('Step 1 — Given', `λ = <span class="nw-eq">${S.wl} nm</span> = <span class="nw-val">${lmm.toExponential(4)} mm</span><br>Set R = <span class="nw-eq">${S.rCm} cm</span> = <span class="nw-val">${S.rCm*10} mm</span>`);
    addStep('Step 2 — Measured Diameters', valid.map(r => `n=<span class="nw-eq">${r.n}</span> → Dₙ=<span class="nw-val">${r.dn}mm</span>, Dₙ²=<span class="nw-val">${r.dn2}mm²</span>`).join('<br>'));
    addStep('Step 3 — Linear Regression (Dₙ² vs n)', `Slope = <span class="nw-val">${slope.toFixed(6)} mm²</span><br>Intercept = <span class="nw-val">${intercept.toFixed(6)}</span><br>R² = <span class="${r2>0.99?'nw-res':'nw-val'}">${r2.toFixed(5)}</span> ${r2>0.99?'&nbsp;✓ Excellent':'&nbsp;⚠ Check readings'}`);
    addStep('Step 4 — Apply Formula', `R = Slope / (4λ)<br>R = <span class="nw-val">${slope.toFixed(6)}</span> / (4 × <span class="nw-val">${lmm.toExponential(4)}</span>)<br>R = <span class="nw-res">${Rcalc.toFixed(2)} mm</span> = <span class="nw-res">${RcalcCm.toFixed(3)} cm</span>`);
    addStep('Step 5 — Verification', `Calculated R = <span class="nw-res">${RcalcCm.toFixed(3)} cm</span><br>Set R = <span class="nw-val">${S.rCm} cm</span><br>% Error = <span class="${errPct<5?'nw-res':'nw-val'}">${errPct.toFixed(2)}%</span> ${errPct<5?'&nbsp;✓ Within limit':'&nbsp;⚠ High error'}`);

    if (valid.length >= 2) {
      const f=valid[0], l=valid[valid.length-1];
      const Ralt = (parseFloat(l.dn2)-parseFloat(f.dn2))/(4*lmm*(l.n-f.n));
      addStep('Step 6 — Alternative (Point Method)', `R = (D${l.n}² − D${f.n}²) / (4λ × ${l.n-f.n})<br>R = <span class="nw-res">${(Ralt/10).toFixed(3)} cm</span>`);
    }

    resultEl.innerHTML = `
      <div class="flex flex-col items-center gap-3 py-2">
        <p class="text-xs text-slate-400 uppercase tracking-widest">Radius of Curvature</p>
        <div class="nw-result-big">${RcalcCm.toFixed(3)}</div>
        <p class="text-sm text-slate-400">cm &nbsp;|&nbsp; ${Rcalc.toFixed(2)} mm</p>
        <div class="text-xs font-['JetBrains_Mono'] text-slate-400 text-center leading-relaxed">
          Slope = ${slope.toFixed(6)} mm²<br>λ = ${S.wl} nm &nbsp;|&nbsp; R² = ${r2.toFixed(5)}
        </div>
        <span class="nw-result-badge">${errPct<5?'✓ EXPERIMENT SUCCESS':'⚠ CHECK READINGS'}</span>
      </div>`;
  });

} // end initNewtonsLab
