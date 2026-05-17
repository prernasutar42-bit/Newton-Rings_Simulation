/* ═══════════════════════════════════════════════════════
   NEWTON'S RINGS — script.js
   All logic inside initNewtonsLab()
   Prefixes: nw-  (IDs match index.html exactly)
═══════════════════════════════════════════════════════ */

function initNewtonsLab() {

  // ── DOM safety check ──────────────────────────────
  if (!document.getElementById('nw-canvas')) return;

  // ═════════════════════════════════════════════════
  // CONSTANTS & STATE
  // ═════════════════════════════════════════════════
  const NUM_RINGS   = 10;
  const WL_DEFAULT  = 589;   // nm
  const R_DEFAULT   = 100;   // cm
  const FOC_DEFAULT = 5.0;

  const S = {                // isolated state object
    running:    false,
    animId:     null,
    tick:       0,
    wl:         WL_DEFAULT,  // nm
    rCm:        R_DEFAULT,   // cm
    focus:      FOC_DEFAULT,
    microPos:   1200,        // 0–2400 → 0–24 mm
    recordings: {},          // { "3-left": 11.45, … }
    tableData:  [],          // [{n,x1,x2,dn,dn2,valid}]
    chartInst:  null,
  };

  for (let i = 1; i <= NUM_RINGS; i++)
    S.tableData.push({ n: i, x1: '', x2: '', dn: '', dn2: '', valid: false });

  // ═════════════════════════════════════════════════
  // HAMBURGER MENU
  // ═════════════════════════════════════════════════
  const hamburger  = document.getElementById('nw-hamburger');
  const mobileMenu = document.getElementById('nw-mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.style.maxHeight && mobileMenu.style.maxHeight !== '0px';
      if (open) {
        mobileMenu.style.maxHeight = '0px';
        hamburger.setAttribute('aria-expanded', 'false');
        // Reset bars
        document.getElementById('nw-ham-1').style.transform = '';
        document.getElementById('nw-ham-2').style.opacity  = '1';
        document.getElementById('nw-ham-3').style.transform = '';
      } else {
        mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
        hamburger.setAttribute('aria-expanded', 'true');
        // Animate to × shape
        document.getElementById('nw-ham-1').style.transform = 'translateY(7px) rotate(45deg)';
        document.getElementById('nw-ham-2').style.opacity  = '0';
        document.getElementById('nw-ham-3').style.transform = 'translateY(-7px) rotate(-45deg)';
      }
    });
  }

  // ═════════════════════════════════════════════════
  // TAB SWITCHING
  // ═════════════════════════════════════════════════
  document.querySelectorAll('.nw-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nw-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.nw-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add('active');
      if (tab.dataset.tab === 'nw-panel-graph') renderGraph();
      if (tab.dataset.tab === 'nw-panel-calc')  updateGivenPanel();
    });
  });

  // ═════════════════════════════════════════════════
  // UTILITIES
  // ═════════════════════════════════════════════════
  function wlToRGB(nm) {
    let r, g, b;
    if      (nm < 440) { r = -(nm-440)/(440-380); g = 0; b = 1; }
    else if (nm < 490) { r = 0; g = (nm-440)/50; b = 1; }
    else if (nm < 510) { r = 0; g = 1; b = -(nm-510)/20; }
    else if (nm < 580) { r = (nm-510)/70; g = 1; b = 0; }
    else if (nm < 645) { r = 1; g = -(nm-645)/65; b = 0; }
    else               { r = 1; g = 0; b = 0; }
    const fac = nm < 420 ? 0.3 + 0.7*(nm-380)/40
              : nm > 700 ? 0.3 + 0.7*(780-nm)/80 : 1;
    const g2 = 0.8;
    return `rgb(${Math.round(255*Math.pow(Math.max(0,r)*fac,g2))},${Math.round(255*Math.pow(Math.max(0,g)*fac,g2))},${Math.round(255*Math.pow(Math.max(0,b)*fac,g2))})`;
  }

  function ringDiameter(n) {
    const lmm = S.wl * 1e-6, Rmm = S.rCm * 10;
    return Math.sqrt(4 * lmm * Rmm * n);
  }

  function scatter(v, pct = 0.012) { return v * (1 + (Math.random() - 0.5) * pct); }

  function linReg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
    let sx=0,sy=0,sxy=0,sx2=0,sy2=0;
    xs.forEach((x,i)=>{ sx+=x; sy+=ys[i]; sxy+=x*ys[i]; sx2+=x*x; sy2+=ys[i]*ys[i]; });
    const m = (n*sxy - sx*sy)/(n*sx2 - sx*sx);
    const b = (sy - m*sx)/n;
    const yMean = sy/n;
    let sst=0, ssr=0;
    ys.forEach((y,i)=>{ sst+=(y-yMean)**2; ssr+=(y-(m*xs[i]+b))**2; });
    return { slope: m, intercept: b, r2: sst>0 ? 1-ssr/sst : 1 };
  }

  // ═════════════════════════════════════════════════
  // SLIDERS
  // ═════════════════════════════════════════════════
  const wlSlider    = document.getElementById('nw-wl-slider');
  const rSlider     = document.getElementById('nw-r-slider');
  const focusSlider = document.getElementById('nw-focus-slider');

  wlSlider.addEventListener('input', () => {
    S.wl = +wlSlider.value;
    document.getElementById('nw-wl-val').textContent = S.wl + ' nm';
    updateSpectrumCursor();
    updateReadouts();
    buildRingBadges();
  });
  rSlider.addEventListener('input', () => {
    S.rCm = +rSlider.value;
    document.getElementById('nw-r-val').textContent = S.rCm + ' cm';
    updateReadouts();
    buildRingBadges();
  });
  focusSlider.addEventListener('input', () => {
    S.focus = +focusSlider.value;
    document.getElementById('nw-focus-val').textContent = S.focus.toFixed(1);
  });

  function updateSpectrumCursor() {
    const pct = ((S.wl - 400) / 300) * 100;
    const cur = document.getElementById('nw-spectrum-cursor');
    cur.style.left = pct + '%';
    cur.style.background = wlToRGB(S.wl);
    cur.style.color = wlToRGB(S.wl);
  }
  updateSpectrumCursor();

  function updateReadouts() {
    document.getElementById('nw-ro-lambda').textContent = S.wl + ' nm';
    document.getElementById('nw-ro-radius').textContent = S.rCm + ' cm';
    document.getElementById('nw-ro-rings').textContent  = NUM_RINGS;
    document.getElementById('nw-ro-d1').textContent     = ringDiameter(1).toFixed(3) + ' mm';
  }
  updateReadouts();

  function buildRingBadges() {
    const el = document.getElementById('nw-ring-badges');
    el.innerHTML = '';
    for (let n = 1; n <= NUM_RINGS; n++) {
      const d = document.createElement('div');
      d.className = 'nw-ring-badge';
      d.innerHTML = `<span style="color:var(--laser)">n=${n}</span><br>${ringDiameter(n).toFixed(3)}mm`;
      el.appendChild(d);
    }
  }
  buildRingBadges();

  // ═════════════════════════════════════════════════
  // SIMULATION CANVAS
  // ═════════════════════════════════════════════════
  const simCanvas = document.getElementById('nw-canvas');
  const simCtx    = simCanvas.getContext('2d');
  const overlay   = document.getElementById('nw-overlay');
  const CW = simCanvas.width, CH = simCanvas.height;
  const CX = CW/2, CY = CH/2;
  const MAXR = CW/2 - 8;

  function drawSim(t) {
    simCtx.clearRect(0, 0, CW, CH);

    // Bg gradient
    const bg = simCtx.createRadialGradient(CX,CY,0,CX,CY,MAXR);
    bg.addColorStop(0,'rgba(20,30,50,1)');
    bg.addColorStop(1,'rgba(2,6,23,1)');
    simCtx.fillStyle = bg;
    simCtx.beginPath(); simCtx.arc(CX,CY,MAXR,0,Math.PI*2); simCtx.fill();

    // Pixel-level interference using ImageData
    const lmm = S.wl * 1e-6;
    const Rmm = S.rCm * 10;
    const refD = Math.sqrt(4 * lmm * Rmm * 10);
    const scale = (MAXR * 0.88) / (refD / 2); // px per mm

    const imgData = simCtx.getImageData(CX-MAXR, CY-MAXR, MAXR*2, MAXR*2);
    const data = imgData.data;
    const wRGB = wlToRGB(S.wl).match(/\d+/g).map(Number);
    const [wr, wg, wb] = wRGB;
    const focus = S.focus / 5.0;
    const pulse = 1 + 0.003 * Math.sin(t * 0.02);

    for (let py = 0; py < MAXR*2; py++) {
      for (let px = 0; px < MAXR*2; px++) {
        const dx = px - MAXR, dy = py - MAXR;
        const rpx = Math.sqrt(dx*dx + dy*dy);
        if (rpx > MAXR) continue;
        const r_mm = rpx / scale;
        const airGap = (r_mm * r_mm) / (2 * Rmm);
        const phase  = (2 * airGap / lmm) * Math.PI * 2;
        const N      = r_mm / (Math.sqrt(lmm * Rmm / 2) + 1e-10);
        const damp   = Math.exp(-N * 0.013 / focus);
        const I      = (1 - Math.cos(phase * pulse)) / 2 * damp;
        const idx    = (py * MAXR*2 + px) * 4;
        data[idx]   = Math.round(wr * I * 0.9);
        data[idx+1] = Math.round(wg * I * 0.9);
        data[idx+2] = Math.round(wb * I * 0.9);
        data[idx+3] = 255;
      }
    }
    simCtx.putImageData(imgData, CX-MAXR, CY-MAXR);

    // Central spot
    simCtx.fillStyle = 'rgba(6,182,212,0.7)';
    simCtx.beginPath(); simCtx.arc(CX, CY, 2.5, 0, Math.PI*2); simCtx.fill();

    // Ring n labels
    simCtx.font = '10px JetBrains Mono, monospace';
    simCtx.fillStyle = 'rgba(6,182,212,0.45)';
    simCtx.textAlign = 'center';
    for (let n = 1; n <= 10; n++) {
      const rpx2 = (ringDiameter(n)/2) * scale;
      if (rpx2 > MAXR) break;
      simCtx.fillText(n, CX + rpx2*0.707 + 5, CY - rpx2*0.707 - 3);
    }

    // Subtle crosshair
    simCtx.strokeStyle = 'rgba(6,182,212,0.07)';
    simCtx.lineWidth = 1;
    simCtx.setLineDash([4,6]);
    simCtx.beginPath(); simCtx.moveTo(CX,CY-MAXR); simCtx.lineTo(CX,CY+MAXR); simCtx.stroke();
    simCtx.beginPath(); simCtx.moveTo(CX-MAXR,CY); simCtx.lineTo(CX+MAXR,CY); simCtx.stroke();
    simCtx.setLineDash([]);
  }

  function animLoop() {
    if (!S.running) return;
    S.tick++;
    drawSim(S.tick);
    S.animId = requestAnimationFrame(animLoop);
  }

  const btnStart     = document.getElementById('nw-btn-start');
  const btnPause     = document.getElementById('nw-btn-pause');
  const btnResetSim  = document.getElementById('nw-btn-reset-sim');
  const statusText   = document.getElementById('nw-status-text');
  const ping         = document.getElementById('nw-ping');

  btnStart.addEventListener('click', () => {
    if (S.running) return;
    S.running = true;
    overlay.classList.add('hidden');
    btnStart.disabled = true;
    btnPause.disabled = false;
    statusText.textContent = 'Live';
    ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75';
    ping.nextElementSibling.className = 'relative inline-flex rounded-full h-2 w-2 bg-green-500';
    animLoop();
  });

  btnPause.addEventListener('click', () => {
    S.running = false;
    cancelAnimationFrame(S.animId);
    overlay.classList.remove('hidden');
    btnStart.disabled = false;
    btnPause.disabled = true;
    statusText.textContent = 'Paused';
    ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75';
    ping.nextElementSibling.className = 'relative inline-flex rounded-full h-2 w-2 bg-yellow-500';
  });

  btnResetSim.addEventListener('click', () => {
    S.running = false;
    cancelAnimationFrame(S.animId);
    S.tick = 0; S.wl = WL_DEFAULT; S.rCm = R_DEFAULT; S.focus = FOC_DEFAULT;
    wlSlider.value = WL_DEFAULT; rSlider.value = R_DEFAULT; focusSlider.value = FOC_DEFAULT;
    document.getElementById('nw-wl-val').textContent  = WL_DEFAULT + ' nm';
    document.getElementById('nw-r-val').textContent   = R_DEFAULT + ' cm';
    document.getElementById('nw-focus-val').textContent = FOC_DEFAULT.toFixed(1);
    updateSpectrumCursor(); updateReadouts(); buildRingBadges();
    overlay.classList.remove('hidden');
    btnStart.disabled = false; btnPause.disabled = true;
    statusText.textContent = 'Idle';
    ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75';
    ping.nextElementSibling.className = 'relative inline-flex rounded-full h-2 w-2 bg-red-500';
    drawSim(0);
  });

  drawSim(0); // static frame on load

  // ═════════════════════════════════════════════════
  // TRAVELLING MICROSCOPE
  // ═════════════════════════════════════════════════
  const eyeCanvas   = document.getElementById('nw-eyepiece');
  const eyeCtx      = eyeCanvas.getContext('2d');
  const microSlider = document.getElementById('nw-micro-pos');
  const EW = eyeCanvas.width, EH = eyeCanvas.height;
  const ECX = EW/2, ECY = EH/2;

  function pos2mm(pos) { return pos * 0.01; }   // 0–2400 → 0–24 mm

  function getReading(pos) {
    const total = parseFloat(pos2mm(pos).toFixed(3));
    const ms    = Math.floor(total * 2) / 2;
    const vs    = parseFloat((total - ms).toFixed(3));
    return { ms, vs, total };
  }

  function drawEyepiece() {
    eyeCtx.clearRect(0,0,EW,EH);
    eyeCtx.save();
    eyeCtx.beginPath(); eyeCtx.arc(ECX,ECY,EW/2-2,0,Math.PI*2); eyeCtx.clip();

    // Bg
    const bg = eyeCtx.createRadialGradient(ECX,ECY,0,ECX,ECY,EW/2);
    bg.addColorStop(0,'rgba(15,23,42,1)'); bg.addColorStop(1,'rgba(2,6,23,1)');
    eyeCtx.fillStyle = bg; eyeCtx.fillRect(0,0,EW,EH);

    const lmm = S.wl * 1e-6, Rmm = S.rCm * 10;
    const viewMm   = pos2mm(S.microPos);
    const centerMm = 12.0;
    const pxPerMm  = 34 * (S.focus / 5.0);
    const cxRing   = ECX + (centerMm - viewMm) * pxPerMm;
    const col      = wlToRGB(S.wl);

    for (let n = 1; n <= 15; n++) {
      const Dn  = Math.sqrt(4 * lmm * Rmm * n);
      const rn  = Dn / 2 * pxPerMm;
      const rp  = n > 1 ? Math.sqrt(4*lmm*Rmm*(n-1))/2 * pxPerMm : 0;
      const amp = Math.exp(-n * 0.06);

      if (n > 1) {
        eyeCtx.beginPath();
        eyeCtx.arc(cxRing, ECY, rn, 0, Math.PI*2);
        eyeCtx.arc(cxRing, ECY, rp, 0, Math.PI*2, true);
        eyeCtx.fillStyle = col.replace('rgb(','rgba(').replace(')',`,${amp*0.3})`);
        eyeCtx.fill('evenodd');
      }

      eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, rn, 0, Math.PI*2);
      eyeCtx.strokeStyle = 'rgba(0,0,0,0.92)';
      eyeCtx.lineWidth = Math.max(1.2, 3*(1-n*0.05));
      eyeCtx.stroke();
    }

    // Central dark spot
    eyeCtx.beginPath(); eyeCtx.arc(cxRing, ECY, 4, 0, Math.PI*2);
    eyeCtx.fillStyle = 'rgba(0,0,0,0.96)'; eyeCtx.fill();

    // Scale ruler
    eyeCtx.fillStyle = 'rgba(6,182,212,0.5)';
    eyeCtx.fillRect(8, EH-20, EW-16, 1);
    for (let m = 0; m <= 24; m += 0.5) {
      const xp = ECX + (m - viewMm) * pxPerMm;
      if (xp < 4 || xp > EW-4) continue;
      const isMm = (m === Math.round(m));
      eyeCtx.fillStyle = isMm ? 'rgba(6,182,212,0.8)' : 'rgba(6,182,212,0.35)';
      eyeCtx.fillRect(xp, EH-20-(isMm?8:4), 1, isMm?8:4);
      if (isMm) {
        eyeCtx.font = '9px JetBrains Mono, monospace';
        eyeCtx.fillStyle = 'rgba(6,182,212,0.55)';
        eyeCtx.textAlign = 'center';
        eyeCtx.fillText(m, xp, EH-24);
      }
    }

    // Vignette
    const vig = eyeCtx.createRadialGradient(ECX,ECY,EW*0.25,ECX,ECY,EW/2);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.55)');
    eyeCtx.fillStyle = vig; eyeCtx.fillRect(0,0,EW,EH);
    eyeCtx.restore();

    // Rim
    eyeCtx.beginPath(); eyeCtx.arc(ECX,ECY,EW/2-2,0,Math.PI*2);
    eyeCtx.strokeStyle = 'rgba(6,182,212,0.4)'; eyeCtx.lineWidth = 2; eyeCtx.stroke();
  }

  function refreshScaleDisplay() {
    const { ms, vs, total } = getReading(S.microPos);
    document.getElementById('nw-ms-val').textContent    = ms.toFixed(2);
    document.getElementById('nw-vs-val').textContent    = vs.toFixed(3);
    document.getElementById('nw-total-val').textContent = total.toFixed(3);
    document.getElementById('nw-cur-reading').textContent = total.toFixed(3) + ' mm';
    drawEyepiece();
  }

  microSlider.addEventListener('input', () => {
    S.microPos = +microSlider.value;
    refreshScaleDisplay();
  });

  document.getElementById('nw-mll').addEventListener('click', () => { S.microPos = Math.max(0, S.microPos-50);   microSlider.value = S.microPos; refreshScaleDisplay(); });
  document.getElementById('nw-ml' ).addEventListener('click', () => { S.microPos = Math.max(0, S.microPos-5);    microSlider.value = S.microPos; refreshScaleDisplay(); });
  document.getElementById('nw-mr' ).addEventListener('click', () => { S.microPos = Math.min(2400, S.microPos+5);  microSlider.value = S.microPos; refreshScaleDisplay(); });
  document.getElementById('nw-mrr').addEventListener('click', () => { S.microPos = Math.min(2400, S.microPos+50); microSlider.value = S.microPos; refreshScaleDisplay(); });

  refreshScaleDisplay();

  // Record reading
  document.getElementById('nw-btn-record').addEventListener('click', () => {
    const ring = +document.getElementById('nw-obs-ring').value;
    const side = document.querySelector('input[name="nw-side"]:checked').value;
    const { total } = getReading(S.microPos);
    S.recordings[`${ring}-${side}`] = total;
    renderRecordedList();
    // Auto-push to table if both sides done
    const lv = S.recordings[`${ring}-left`], rv = S.recordings[`${ring}-right`];
    if (lv !== undefined && rv !== undefined) {
      const row = S.tableData.find(r => r.n === ring);
      if (row) { row.x1 = lv.toFixed(3); row.x2 = rv.toFixed(3); calcRow(row); }
      refreshTableRows();
    }
  });

  function renderRecordedList() {
    const el = document.getElementById('nw-rec-list');
    el.innerHTML = '';
    for (let n = 1; n <= NUM_RINGS; n++) {
      const lv = S.recordings[`${n}-left`], rv = S.recordings[`${n}-right`];
      if (lv === undefined && rv === undefined) continue;
      const d = document.createElement('div');
      d.className = 'nw-rec-item';
      d.innerHTML = `<span>Ring ${n}</span><span class="l">L: ${lv !== undefined ? lv.toFixed(3) : '—'}</span><span class="r">R: ${rv !== undefined ? rv.toFixed(3) : '—'}</span>`;
      el.appendChild(d);
    }
  }

  // ═════════════════════════════════════════════════
  // OBSERVATION TABLE
  // ═════════════════════════════════════════════════
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
      tr.className = 'nw-row-in';
      tr.id = `nw-tr-${i}`;
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

      document.getElementById(`nw-x1-${i}`).addEventListener('input', e => {
        S.tableData[i].x1 = e.target.value; calcRow(S.tableData[i]); updateRowUI(i); updateTableStats();
      });
      document.getElementById(`nw-x2-${i}`).addEventListener('input', e => {
        S.tableData[i].x2 = e.target.value; calcRow(S.tableData[i]); updateRowUI(i); updateTableStats();
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
    document.getElementById('nw-valid-count').textContent   = `${valid} / ${NUM_RINGS} valid`;
    document.getElementById('nw-completeness').textContent  = `${Math.round(valid/NUM_RINGS*100)}% complete`;
  }

  buildTable();

  document.getElementById('nw-btn-autofill').addEventListener('click', () => {
    const lmm = S.wl*1e-6, Rmm = S.rCm*10, base = 12.0;
    S.tableData.forEach(row => {
      const Dn = Math.sqrt(4*lmm*Rmm*row.n);
      row.x1 = scatter(base - Dn/2, 0.01).toFixed(3);
      row.x2 = scatter(base + Dn/2, 0.01).toFixed(3);
      calcRow(row);
    });
    refreshTableRows();
  });

  document.getElementById('nw-btn-reset-table').addEventListener('click', () => {
    if (!confirm('Clear all recorded data?')) return;
    S.tableData.forEach(r => { r.x1=''; r.x2=''; r.dn=''; r.dn2=''; r.valid=false; });
    S.recordings = {};
    refreshTableRows();
    renderRecordedList();
  });

  document.getElementById('nw-btn-plot').addEventListener('click', () => {
    // Switch to graph tab
    document.querySelectorAll('.nw-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nw-panel').forEach(p => p.classList.remove('active'));
    const graphTab = document.querySelector('[data-tab="nw-panel-graph"]');
    if (graphTab) { graphTab.classList.add('active'); document.getElementById('nw-panel-graph').classList.add('active'); }
    renderGraph();
  });

  // ═════════════════════════════════════════════════
  // GRAPH
  // ═════════════════════════════════════════════════
  function renderGraph() {
    const valid = S.tableData.filter(r => r.valid);
    const slopeEl = document.getElementById('nw-g-slope');
    const intEl   = document.getElementById('nw-g-int');
    const r2El    = document.getElementById('nw-g-r2');
    const ptsEl   = document.getElementById('nw-g-pts');

    if (valid.length < 2) {
      if (S.chartInst) { S.chartInst.destroy(); S.chartInst = null; }
      [slopeEl,intEl,r2El,ptsEl].forEach(e=>{ if(e) e.textContent='—'; });
      return;
    }

    const xs = valid.map(r => r.n);
    const ys = valid.map(r => parseFloat(r.dn2));
    const { slope, intercept, r2 } = linReg(xs, ys);
    const xMax = Math.max(...xs) + 1;
    const bfLine = [ {x:0,y:intercept}, {x:xMax,y:slope*xMax+intercept} ];

    if (S.chartInst) { S.chartInst.destroy(); S.chartInst = null; }
    const ctx = document.getElementById('nw-chart').getContext('2d');

    S.chartInst = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Dₙ² (measured)',
            data: valid.map(r => ({ x: r.n, y: parseFloat(r.dn2) })),
            backgroundColor: 'rgba(6,182,212,0.9)',
            borderColor: 'rgba(6,182,212,1)',
            pointRadius: 7, pointHoverRadius: 10,
          },
          {
            label: 'Best-fit Line',
            data: bfLine, type: 'line', showLine: true,
            borderColor: 'rgba(251,146,60,0.9)',
            backgroundColor: 'transparent',
            borderWidth: 2.5, borderDash: [6,4],
            pointRadius: 0, tension: 0,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutCubic' },
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { family: 'Inter', size: 12 }, usePointStyle: true } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.95)',
            borderColor: 'rgba(6,182,212,0.5)', borderWidth: 1,
            titleColor: '#06b6d4', bodyColor: '#f8fafc',
            padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => ` n=${ctx.parsed.x}, Dₙ²=${ctx.parsed.y.toFixed(6)} mm²` }
          }
        },
        scales: {
          x: {
            title: { display:true, text:'Ring Number (n)', color:'#94a3b8', font:{size:12} },
            ticks: { color:'#94a3b8', stepSize:1 },
            grid: { color:'rgba(255,255,255,0.06)' },
          },
          y: {
            title: { display:true, text:'Dₙ² (mm²)', color:'#94a3b8', font:{size:12} },
            ticks: { color:'#94a3b8' },
            grid: { color:'rgba(255,255,255,0.06)' },
          }
        }
      }
    });

    slopeEl.textContent = slope.toFixed(6) + ' mm²';
    intEl.textContent   = intercept.toFixed(6);
    r2El.textContent    = r2.toFixed(5);
    ptsEl.textContent   = valid.length;
  }

  // ═════════════════════════════════════════════════
  // CALCULATIONS
  // ═════════════════════════════════════════════════
  function updateGivenPanel() {
    document.getElementById('nw-given-lambda').textContent = S.wl + ' nm';
    document.getElementById('nw-given-r').textContent      = S.rCm + ' cm';
  }

  document.getElementById('nw-btn-calc').addEventListener('click', runCalc);

  function runCalc() {
    updateGivenPanel();
    const valid = S.tableData.filter(r => r.valid);
    const stepsEl  = document.getElementById('nw-calc-steps');
    const resultEl = document.getElementById('nw-result-display');
    const errPanel = document.getElementById('nw-error-panel');
    const errList  = document.getElementById('nw-error-list');
    stepsEl.innerHTML = ''; errList.innerHTML = '';
    errPanel.style.display = 'none';

    const errors = [];
    if (valid.length < 3) errors.push('Need at least 3 valid observations to compute R.');
    S.tableData.forEach((row, i) => {
      if ((row.x1!==''||row.x2!=='') && !row.valid)
        errors.push(`Row ${i+1} (Ring ${row.n}): x₂ must be greater than x₁.`);
    });
    if (errors.length) {
      errPanel.style.display = 'block';
      errors.forEach(e => { const d=document.createElement('div'); d.className='nw-error-item bg-red-900/20 border border-red-500/20 rounded-lg p-2 text-red-400 text-xs'; d.textContent=e; errList.appendChild(d); });
    }
    if (valid.length < 2) {
      stepsEl.innerHTML = `<div class="text-center py-10 text-slate-500 text-sm border border-dashed border-white/10 rounded-xl">⚠ Fill at least 3 rows in the Observation Table first.</div>`;
      resultEl.innerHTML = `<p class="text-slate-500 text-sm">Insufficient data</p>`;
      return;
    }

    const xs = valid.map(r => r.n);
    const ys = valid.map(r => parseFloat(r.dn2));
    const { slope, intercept, r2 } = linReg(xs, ys);
    const lmm     = S.wl * 1e-6;
    const Rcalc   = slope / (4 * lmm);        // mm
    const RcalcCm = Rcalc / 10;
    const errPct  = Math.abs(RcalcCm - S.rCm) / S.rCm * 100;

    function addStep(title, html) {
      const d = document.createElement('div');
      d.className = 'nw-calc-step';
      d.innerHTML = `<div class="nw-step-title">${title}</div><div class="nw-step-body">${html}</div>`;
      stepsEl.appendChild(d);
    }

    addStep('Step 1 — Given', `
      λ = <span class="nw-eq">${S.wl} nm</span> = <span class="nw-val">${lmm.toExponential(4)} mm</span><br>
      Set R = <span class="nw-eq">${S.rCm} cm</span> = <span class="nw-val">${S.rCm*10} mm</span>
    `);

    addStep('Step 2 — Measured Diameters', valid.map(r =>
      `n=<span class="nw-eq">${r.n}</span> → Dₙ=<span class="nw-val">${r.dn}mm</span>, Dₙ²=<span class="nw-val">${r.dn2}mm²</span>`
    ).join('<br>'));

    addStep('Step 3 — Linear Regression (Dₙ² vs n)', `
      Slope = <span class="nw-val">${slope.toFixed(6)} mm²</span><br>
      Intercept = <span class="nw-val">${intercept.toFixed(6)}</span><br>
      R² = <span class="${r2>0.99?'nw-res':'nw-val'}">${r2.toFixed(5)}</span>
      ${r2>0.99 ? '&nbsp;✓ Excellent' : '&nbsp;⚠ Check readings'}
    `);

    addStep('Step 4 — Apply Formula', `
      R = Slope / (4λ)<br>
      R = <span class="nw-val">${slope.toFixed(6)}</span> / (4 × <span class="nw-val">${lmm.toExponential(4)}</span>)<br>
      R = <span class="nw-res">${Rcalc.toFixed(2)} mm</span> = <span class="nw-res">${RcalcCm.toFixed(3)} cm</span>
    `);

    addStep('Step 5 — Verification', `
      Calculated R = <span class="nw-res">${RcalcCm.toFixed(3)} cm</span><br>
      Set R (slider) = <span class="nw-val">${S.rCm} cm</span><br>
      % Error = <span class="${errPct<5?'nw-res':'nw-val'}">${errPct.toFixed(2)} %</span>
      ${errPct<5 ? '&nbsp;✓ Within limit' : '&nbsp;⚠ High error'}
    `);

    // Alternative (last vs first)
    if (valid.length >= 2) {
      const f = valid[0], l = valid[valid.length-1];
      const Ralt = (parseFloat(l.dn2)-parseFloat(f.dn2)) / (4*lmm*(l.n-f.n));
      addStep('Step 6 — Alternative (Point Method)', `
        R = (D<sub>${l.n}</sub>² − D<sub>${f.n}</sub>²) / (4λ × ${l.n-f.n})<br>
        R = <span class="nw-res">${(Ralt/10).toFixed(3)} cm</span>
      `);
    }

    resultEl.innerHTML = `
      <div class="flex flex-col items-center gap-3 py-2">
        <p class="text-xs text-slate-400 uppercase tracking-widest">Radius of Curvature</p>
        <div class="nw-result-big">${RcalcCm.toFixed(3)}</div>
        <p class="text-sm text-slate-400">cm &nbsp;|&nbsp; ${Rcalc.toFixed(2)} mm</p>
        <div class="text-xs font-['JetBrains_Mono'] text-slate-400 text-center leading-relaxed">
          Slope = ${slope.toFixed(6)} mm²<br>
          λ = ${S.wl} nm &nbsp;|&nbsp; R² = ${r2.toFixed(5)}
        </div>
        <span class="nw-result-badge">${errPct<5 ? '✓ EXPERIMENT SUCCESS' : '⚠ CHECK READINGS'}</span>
      </div>
    `;
  }
} // end initNewtonsLab
