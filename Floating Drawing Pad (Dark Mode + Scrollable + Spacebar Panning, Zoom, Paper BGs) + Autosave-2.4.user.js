// ==UserScript==
// @name         Floating Drawing Pad (Dark Mode + Scrollable + Spacebar Panning, Zoom, Paper BGs) + Autosave
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Fabric.js drawing pad with scrollable large workspace, spacebar-drag panning, zoom (Ctrl+wheel), paper backgrounds (incl. dark), persistent UI, tools, paste-image, PNG export, and autosave to localStorage
// @match        https://leetcode.com/
// @match        https://leetcode.com/problems/*
// @match        https://leetcode.com/playground/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const cdns = [
    'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/4.6.0/fabric.min.js',
    'https://cdn.jsdelivr.net/npm/fabric@4.6.0/dist/fabric.min.js',
    'https://unpkg.com/fabric@4.6.0/dist/fabric.min.js'
  ];

  function loadFabric() {
    return new Promise((resolve, reject) => {
      function tryNext(i) {
        if (i >= cdns.length) return reject('All Fabric.js CDNs failed');
        const s = document.createElement('script');
        s.src = cdns[i];
        s.onload = () => resolve();
        s.onerror = () => tryNext(i + 1);
        document.head.appendChild(s);
      }
      tryNext(0);
    });
  }

  loadFabric().then(init).catch(err => console.error('Fabric.js load failed:', err));

  function init() {
    if (window.__tmDrawingPadInjected) return;
    window.__tmDrawingPadInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      #tm-draw-panel { position: fixed; background: rgba(255,255,255,0.95); border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.2); z-index: 999999999; display: flex; flex-direction: column; user-select: none; color: black; padding: 8px; resize: both; overflow: hidden; }
      #tm-draw-header { height: 36px; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: #f9f9f9; border-bottom: 1px solid #ddd; cursor: move; border-top-left-radius: 8px; border-top-right-radius: 8px; color: black; }
      #tm-draw-tools { display: flex; align-items: center; gap: 8px; padding: 4px 0; color: black; flex-wrap: wrap; }
      #tm-fav-colors .tm-color-btn { width: 20px; height: 20px; border-radius: 50%; padding: 0; border: 1px solid #888; cursor: pointer; }
      .tm-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      #tm-canvas-wrapper { flex: 1; border: 1px solid #ddd; border-radius: 4px; background: white; overflow: auto; position: relative; }
      #tm-canvas { background: white; display: block; }
      .tm-btn { border: 1px solid #888; background: #f5f5f5; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #333; box-shadow: 1px 1px 3px rgba(0,0,0,0.2); transition: all 0.1s ease; }
      .tm-btn:hover { background: #e0e0e0; box-shadow: 2px 2px 6px rgba(0,0,0,0.25); }
      .tm-btn:active { transform: translateY(1px); box-shadow: 1px 1px 3px rgba(0,0,0,0.2); }
      .tm-btn.selected { background: #d0e0ff; border-color: #4a90e2; color: #000; }
      #tm-paper, #tm-workspace { min-width: 140px; }
      .tm-sep { height: 20px; width: 1px; background: #d0d0d0; margin: 0 4px; }
    `;
    document.head.appendChild(style);

    const saved = JSON.parse(localStorage.getItem('tmDrawPanel')) || {};
    const savedPaperMode = localStorage.getItem('tmPaperMode') || 'dark';
    const savedWorkspace = JSON.parse(localStorage.getItem('tmWorkspace')) || { w: 3000, h: 2000 };

    // Per page storage so each problem or page has its own board
    const storageKey = `tmCanvasState:${location.pathname}`;

    // Simple throttle for autosave
    function throttle(fn, wait) {
      let t = 0, lastArgs = null, pending = false;
      return function throttled(...args) {
        lastArgs = args;
        if (pending) return;
        const now = Date.now();
        const later = Math.max(0, wait - (now - t));
        pending = true;
        setTimeout(() => {
          t = Date.now();
          pending = false;
          fn.apply(this, lastArgs);
        }, later);
      };
    }

    const panel = document.createElement('div');
    panel.id = 'tm-draw-panel';
    panel.style.left = saved.left || '1200px';
    panel.style.top = saved.top || '100px';
    panel.style.width = saved.width || '1410px';
    panel.style.height = saved.height || '1050px';

    panel.innerHTML = `
      <div id="tm-draw-header">
        <strong>Drawing Pad</strong>
        <button id="tm-toggle" class="tm-btn">Hide</button>
      </div>
      <div id="tm-draw-tools">
        <div class="tm-row">
          <button id="tm-pencil" class="tm-btn">Pencil</button>
          <button id="tm-eraser" class="tm-btn">Eraser</button>
          <button id="tm-text" class="tm-btn">Text</button>
          <div class="tm-sep"></div>
          <button id="tm-add-headings" class="tm-btn" title="Insert basic headings scaffold">Add Headings</button>
          <label>Color <input id="tm-color" type="color" value="#ffffff"></label>
          <span id="tm-fav-colors">
            <button class="tm-btn tm-color-btn" style="background:#ffffff" data-color="#ffffff" title="White"></button>
            <button class="tm-btn tm-color-btn" style="background:#80d8ff" data-color="#80d8ff" title="Light Blue"></button>
            <button class="tm-btn tm-color-btn" style="background:#ffd54f" data-color="#ffd54f" title="Amber"></button>
            <button class="tm-btn tm-color-btn" style="background:#c6ff00" data-color="#c6ff00" title="Lime"></button>
            <button class="tm-btn tm-color-btn" style="background:#ffab91" data-color="#ffab91" title="Peach"></button>
          </span>
          <label>Size <input id="tm-size" type="range" min="1" max="50" value="4"></label>
          <div class="tm-sep"></div>
          <select id="tm-paper" class="tm-btn" title="Background">
            <option value="dark">Paper: Dark</option>
            <option value="lined">Paper: Lined</option>
            <option value="grid">Paper: Grid</option>
            <option value="dots">Paper: Dots</option>
            <option value="none">Paper: None</option>
          </select>
          <div class="tm-sep"></div>
          <select id="tm-workspace" class="tm-btn" title="Workspace size (scrollable)">
            <option value="2000x1400">Workspace: 2000×1400</option>
            <option value="3000x2000">Workspace: 3000×2000</option>
            <option value="4000x3000">Workspace: 4000×3000</option>
            <option value="6000x4000">Workspace: 6000×4000</option>
            <option value="custom">Workspace: Custom…</option>
          </select>
          <button id="tm-zoom-reset" class="tm-btn" title="Reset zoom">Reset Zoom</button>
          <div class="tm-sep"></div>
          <button id="tm-undo" class="tm-btn">Undo</button>
          <button id="tm-redo" class="tm-btn" title="Redo not implemented">Redo</button>
          <div class="tm-sep"></div>
          <button id="tm-clear" class="tm-btn">Clear</button>
          <button id="tm-save" class="tm-btn">Save PNG</button>
          <button id="tm-save-board" class="tm-btn" title="Save board to browser storage">Save Board</button>
        </div>
      </div>
      <div id="tm-canvas-wrapper">
        <canvas id="tm-canvas"></canvas>
      </div>
    `;
    document.body.appendChild(panel);

    // Start hidden
    panel.style.display = 'none';

    // Floating "Draw" button
    const showBtn = document.createElement('button');
    showBtn.textContent = 'Draw';
    showBtn.className = 'tm-btn';
    showBtn.style.position = 'fixed';
    showBtn.style.right = '305px';
    showBtn.style.bottom = '20px';
    showBtn.style.zIndex = 999999999;
    document.body.appendChild(showBtn);

    function savePanelState() {
      localStorage.setItem('tmDrawPanel', JSON.stringify({
        left: panel.style.left,
        top: panel.style.top,
        width: panel.style.width,
        height: panel.style.height
      }));
      canvas.requestRenderAll();
    }

    // Draggable panel
    function makeDraggable(el, handle) {
      let isDown = false, startX, startY, origX, origY;
      handle.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = origX + dx + 'px';
        el.style.top = origY + dy + 'px';
      });
      window.addEventListener('mouseup', () => {
        if (isDown) savePanelState();
        isDown = false;
      });
    }

    const headerEl = panel.querySelector('#tm-draw-header');
    makeDraggable(panel, headerEl);

    const resizeObserver = new ResizeObserver(savePanelState);
    resizeObserver.observe(panel);

    const wrapperEl = document.getElementById('tm-canvas-wrapper');
    const canvasEl = document.getElementById('tm-canvas');
    const colorInput = document.getElementById('tm-color');
    const sizeInput = document.getElementById('tm-size');
    const clearBtn = document.getElementById('tm-clear');
    const saveBtn = document.getElementById('tm-save');
    const toggleBtn = document.getElementById('tm-toggle');
    const pencilBtn = document.getElementById('tm-pencil');
    const eraserBtn = document.getElementById('tm-eraser');
    const textBtn = document.getElementById('tm-text');
    const undoBtn = document.getElementById('tm-undo');
    const redoBtn = document.getElementById('tm-redo');
    const paperSelect = document.getElementById('tm-paper');
    const workspaceSelect = document.getElementById('tm-workspace');
    const zoomResetBtn = document.getElementById('tm-zoom-reset');
    const addHeadingsBtn = document.getElementById('tm-add-headings');
    const saveBoardBtn = document.getElementById('tm-save-board');

    // Double-click header to hide
    headerEl.addEventListener('dblclick', () => {
      panel.style.display = 'none';
      document.body.appendChild(showBtn);
    });

    const canvas = new fabric.Canvas(canvasEl, { isDrawingMode: true, backgroundColor: 'white' });

    // Persist canvas
    function saveCanvas() {
      try {
        const json = canvas.toJSON(['tmHeadings']);
        localStorage.setItem(storageKey, JSON.stringify(json));
      } catch (e) {
        console.warn('Save failed:', e);
      }
    }
    const saveCanvasThrottled = throttle(saveCanvas, 500);

    function loadCanvas() {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      try {
        canvas.loadFromJSON(JSON.parse(raw), () => {
          applyPaperBackground(true);
          canvas.renderAll();
          saveState();
        });
      } catch (e) {
        console.warn('Load failed:', e);
      }
    }

    // Paper BG helpers
    function makePaperDataURL(w, h, mode = 'lined') {
      const bg = document.createElement('canvas');
      bg.width = Math.max(2, Math.floor(w));
      bg.height = Math.max(2, Math.floor(h));
      const ctx = bg.getContext('2d');

      // Base tint
      ctx.fillStyle = '#FFFEFB';
      ctx.fillRect(0, 0, bg.width, bg.height);

      const lineSpacing = 28;
      const marginX = 64;

      if (mode === 'lined' || mode === 'grid' || mode === 'dots') {
        const grain = ctx.createLinearGradient(0, 0, 0, bg.height);
        grain.addColorStop(0, 'rgba(0,0,0,0.015)');
        grain.addColorStop(1, 'rgba(0,0,0,0.04)');
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, bg.width, bg.height);
      }

      if (mode === 'lined' || mode === 'grid') {
        ctx.strokeStyle = 'rgba(25, 118, 210, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = lineSpacing; y < bg.height; y += lineSpacing) {
          ctx.moveTo(0, Math.round(y) + 0.5);
          ctx.lineTo(bg.width, Math.round(y) + 0.5);
        }
        ctx.stroke();
      }

      if (mode === 'grid') {
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        for (let x = lineSpacing; x < bg.width; x += lineSpacing) {
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, bg.height);
        }
        ctx.stroke();
      }

      if (mode === 'dots') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        const r = 1;
        for (let y = lineSpacing; y < bg.height; y += lineSpacing) {
          for (let x = lineSpacing; x < bg.width; x += lineSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (mode === 'lined') {
        ctx.strokeStyle = 'rgba(220, 0, 0, 0.35)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(Math.round(marginX) + 0.5, 0);
        ctx.lineTo(Math.round(marginX) + 0.5, bg.height);
        ctx.stroke();
      }

      return bg.toDataURL('image/png');
    }

    let currentPaperMode = savedPaperMode;
    let lastBGSize = { w: 0, h: 0 };

    function applyPaperBackground(force = false) {
      const w = canvas.getWidth();
      const h = canvas.getHeight();
      if (!w || !h) return;

      if (currentPaperMode === 'dark') {
        canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
        canvas.setBackgroundColor('#1e1e1e');
        canvas.renderAll();
        lastBGSize = { w: 0, h: 0 };
        return;
      }

      if (currentPaperMode === 'none') {
        canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
        canvas.setBackgroundColor('white');
        canvas.renderAll();
        lastBGSize = { w: 0, h: 0 };
        return;
      }

      if (!force && lastBGSize.w === w && lastBGSize.h === h) {
        canvas.renderAll();
        return;
      }

      const url = makePaperDataURL(w, h, currentPaperMode);
      fabric.Image.fromURL(url, img => {
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
          originX: 'left',
          originY: 'top',
          left: 0,
          top: 0,
          scaleX: 1,
          scaleY: 1
        });
        lastBGSize = { w, h };
      }, { crossOrigin: 'anonymous' });
    }

    function setWorkspaceSize(w, h) {
      canvas.setWidth(w);
      canvas.setHeight(h);
      canvas.calcOffset();
      applyPaperBackground(true);
      localStorage.setItem('tmWorkspace', JSON.stringify({ w, h }));

      requestAnimationFrame(() => {
        wrapperEl.scrollLeft = Math.max(0, (w - wrapperEl.clientWidth) / 2);
        wrapperEl.scrollTop = Math.max(0, (h - wrapperEl.clientHeight) / 2);
      });
    }

    function initWorkspaceFromSaved() {
      setWorkspaceSize(savedWorkspace.w, savedWorkspace.h);
      const val = `${savedWorkspace.w}x${savedWorkspace.h}`;
      const opt = Array.from(workspaceSelect.options).find(o => o.value === val);
      workspaceSelect.value = opt ? val : 'custom';
    }

    function updatePanelLayoutOnly() {
      canvas.requestRenderAll();
    }

    // Show button handler
    showBtn.onclick = () => {
      panel.style.display = 'flex';
      requestAnimationFrame(() => {
        updatePanelLayoutOnly();
        applyPaperBackground(false);
        requestAnimationFrame(() => {
          wrapperEl.scrollLeft = Math.max(0, (canvas.getWidth() - wrapperEl.clientWidth) / 2);
          wrapperEl.scrollTop = Math.max(0, (canvas.getHeight() - wrapperEl.clientHeight) / 2);
        });
      });
      paperSelect.value = currentPaperMode;
      showBtn.remove();
    };

    // Open by default on specific playground URL
    if (window.location.href.includes('playground/3Du5jhPL')) {
      setTimeout(() => {
        if (panel.style.display === 'none') {
          showBtn.onclick();
        }
      }, 0);
    }

    // cursor helper
    function setCanvasCursor(css) {
      canvas.freeDrawingCursor = css;
      if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = css;
      canvasEl.style.cursor = css;
    }

    let pencilSize = 3;
    let eraserSize = 90;
    let currentTool = 'pencil';
    let lastColor = '#ffffff';
    colorInput.value = lastColor;

    // Basic state stack (undo only)
    let state = [];
    function saveState() {
      try { state.push(JSON.stringify(canvas.toJSON(['tmHeadings']))); } catch (e) { }
    }
    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);

    undoBtn.onclick = function () {
      if (state.length > 1) {
        canvas.clear();
        canvas.backgroundColor = (currentPaperMode === 'dark') ? '#1e1e1e' : 'white';
        canvas.loadFromJSON(state[state.length - 2], () => {
          canvas.renderAll();
          state.pop();
          applyPaperBackground(true);
          saveCanvas(); // keep storage aligned with undo
        });
      }
    };
    redoBtn.onclick = function () { alert('Redo not implemented yet'); };

    // Headings scaffold
    function addHeadings() {
      const exists = canvas.getObjects().some(o => o.tmHeadings);
      if (exists) {
        const tbExisting = canvas.getObjects().find(o => o.tmHeadings);
        canvas.setActiveObject(tbExisting);
        canvas.requestRenderAll();
        return;
      }
      const fillColor = (currentPaperMode === 'dark') ? '#eeeeee' : '#111111';
      const tb = new fabric.IText(
        'System Design\n\nRequirements\n- Functional:\n- Non-functional:\n\nHigh-level Architecture\n- Components:\n- Data Flow:\n\nAPIs\n- Read:\n- Write:\n\nData Model\n- Entities:\n\nScaling & Reliability\n- Sharding:\n- Caching:\n- Replication:\n- Consistency:\n\nBottlenecks & Trade-offs\n',
        { left: 120, top: 120, fontSize: 20, lineHeight: 1.25, fill: fillColor, fontFamily: 'monospace' }
      );
      tb.tmHeadings = true;
      canvas.add(tb);
      canvas.setActiveObject(tb);
      canvas.requestRenderAll();
      saveState();
      saveCanvasThrottled();
    }
    addHeadingsBtn.addEventListener('click', addHeadings);

    function getCurrentBGColor() {
      return currentPaperMode === 'dark' ? '#1e1e1e' : '#ffffff';
    }

    function setBrush(tool) {
      canvas.off('mouse:down');

      if (tool === 'pencil') {
        pencilBtn.classList.add('selected');
        eraserBtn.classList.remove('selected');
        textBtn.classList.remove('selected');
        canvas.isDrawingMode = true;

        const brush = new fabric.PencilBrush(canvas);
        brush.color = lastColor;
        brush.width = pencilSize;
        canvas.freeDrawingBrush = brush;

        const size = pencilSize * 2.2;
        const r = size / 2;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r - 0.5}" fill="none" stroke="${lastColor}" stroke-width="1"/></svg>`;
        const url = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${r} ${r}, auto`;
        setCanvasCursor(url);

      } else if (tool === 'eraser') {
        eraserBtn.classList.add('selected');
        pencilBtn.classList.remove('selected');
        textBtn.classList.remove('selected');
        canvas.isDrawingMode = true;

        const brush = new fabric.PencilBrush(canvas);
        brush.color = getCurrentBGColor();
        brush.width = eraserSize;
        canvas.freeDrawingBrush = brush;

        const size = eraserSize;
        const r = size / 2;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="black"/></svg>`;
        const url = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${r} ${r}, auto`;
        setCanvasCursor(url);

      } else if (tool === 'text') {
        pencilBtn.classList.remove('selected');
        eraserBtn.classList.remove('selected');
        textBtn.classList.add('selected');
        canvas.isDrawingMode = false;

        canvas.on('mouse:down', function (options) {
          if (options.target) return;
          const pointer = canvas.getPointer(options.e);
          const text = new fabric.IText('', {
            left: pointer.x,
            top: pointer.y,
            fontSize: 24,
            fill: lastColor
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          saveCanvasThrottled();
        });

        setCanvasCursor('text');
      }

      currentTool = tool;
      sizeInput.value = (tool === 'pencil') ? pencilSize : (tool === 'eraser') ? eraserSize : sizeInput.value;
    }

    // Tool buttons
    pencilBtn.onclick = () => setBrush('pencil');
    eraserBtn.onclick = () => setBrush('eraser');
    textBtn.onclick = () => setBrush('text');

    // Live updates
    sizeInput.oninput = () => {
      const size = parseInt(sizeInput.value, 10);
      if (currentTool === 'pencil') pencilSize = size;
      else if (currentTool === 'eraser') eraserSize = size;
      setBrush(currentTool);
    };
    colorInput.oninput = () => {
      lastColor = colorInput.value;
      if (currentTool === 'pencil' || currentTool === 'text') setBrush(currentTool);
    };
    document.querySelectorAll('.tm-color-btn').forEach(btn => btn.onclick = () => {
      lastColor = btn.getAttribute('data-color');
      colorInput.value = lastColor;
      if (currentTool === 'pencil' || currentTool === 'text') setBrush(currentTool);
    });

    // Paper mode
    paperSelect.value = currentPaperMode;
    paperSelect.addEventListener('change', () => {
      currentPaperMode = paperSelect.value;
      localStorage.setItem('tmPaperMode', currentPaperMode);
      applyPaperBackground(true);
      if (currentTool === 'eraser') setBrush('eraser');
      saveCanvasThrottled();
    });

    // Workspace selector
    function parseWH(val) {
      const [w, h] = val.split('x').map(n => parseInt(n, 10));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 100 && h > 100) return { w, h };
      return null;
    }
    workspaceSelect.addEventListener('change', () => {
      if (workspaceSelect.value === 'custom') {
        const input = prompt('Enter workspace size as WIDTHxHEIGHT (e.g., 5000x3000):', `${canvas.getWidth()}x${canvas.getHeight()}`);
        if (!input) { workspaceSelect.value = `${canvas.getWidth()}x${canvas.getHeight()}`; return; }
        const vals = parseWH(input.trim().toLowerCase());
        if (!vals) { alert('Invalid size format. Use WIDTHxHEIGHT (e.g., 5000x3000)'); return; }
        setWorkspaceSize(vals.w, vals.h);
        workspaceSelect.value = `${vals.w}x${vals.h}`;
      } else {
        const vals = parseWH(workspaceSelect.value);
        if (vals) setWorkspaceSize(vals.w, vals.h);
      }
      saveCanvasThrottled();
    });

    // Initialize
    setBrush('pencil');
    initWorkspaceFromSaved();
    applyPaperBackground(true);
    // Try restore after background and size are ready
    loadCanvas();
    // Push initial state so undo works after a fresh load
    saveState();

    // Clear
    clearBtn.onclick = () => {
      if (confirm('Clear drawing?')) {
        canvas.clear();
        canvas.backgroundColor = (currentPaperMode === 'dark') ? '#1e1e1e' : 'white';
        canvas.renderAll();
        saveState();
        applyPaperBackground(true);
        saveCanvas();
      }
    };

    // Save PNG
    saveBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = canvas.toDataURL({ format: 'png' });
      a.download = 'drawing.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    // Manual board save
    if (saveBoardBtn) {
      saveBoardBtn.onclick = saveCanvas;
    }

    toggleBtn.onclick = () => { panel.style.display = 'none'; document.body.appendChild(showBtn); };

    // Paste image as data URL so it persists in JSON
    window.addEventListener('paste', e => {
      if (!e.clipboardData) return;
      for (const item of e.clipboardData.items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = () => {
            const dataURL = reader.result;
            fabric.Image.fromURL(dataURL, img => {
              const maxW = canvas.width * 0.8, maxH = canvas.height * 0.8;
              if (img.width > maxW || img.height > maxH) img.scale(Math.min(maxW / img.width, maxH / img.height));
              img.left = (canvas.width - img.getScaledWidth()) / 2;
              img.top = (canvas.height - img.getScaledHeight()) / 2;
              canvas.add(img);
              canvas.setActiveObject(img);
              canvas.renderAll();
              saveState();
              saveCanvasThrottled();
              setBrush('text');
            }, { crossOrigin: 'anonymous' });
          };
          reader.readAsDataURL(blob);
        }
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      const allObjects = canvas.getObjects();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (allObjects.length > 0) {
          canvas.discardActiveObject();
          canvas.setActiveObject(new fabric.ActiveSelection(allObjects, { canvas: canvas }));
          canvas.requestRenderAll();
        }
        return;
      }
      if (e.key === 'Delete') {
        const active = canvas.getActiveObject();
        if (active) {
          if (active.type === 'activeSelection') active.forEachObject(obj => canvas.remove(obj));
          else canvas.remove(active);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          saveState();
          saveCanvasThrottled();
        }
      }
    });

    // Ensure new objects are selectable
    canvas.on('object:added', e => {
      const t = e?.target;
      if (t) t.set({ selectable: true, hasControls: true, lockMovementX: false, lockMovementY: false });
    });

    // Zoom with Ctrl + wheel
    let zoom = 1;
    function setZoom(z, anchor) {
      zoom = Math.max(0.2, Math.min(5, z));
      if (anchor) {
        const point = new fabric.Point(anchor.x, anchor.y);
        canvas.zoomToPoint(point, zoom);
      } else {
        canvas.setZoom(zoom);
      }
      canvas.requestRenderAll();
    }

    wrapperEl.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = canvas.upperCanvasEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const targetZoom = e.deltaY < 0 ? zoom * 1.1 : zoom / 1.1;
      setZoom(targetZoom, { x, y });
    }, { passive: false });

    zoomResetBtn.addEventListener('click', () => setZoom(1));

    // Panel viewport updates
    const wrapperResizeObserver = new ResizeObserver(() => {
      canvas.requestRenderAll();
    });
    wrapperResizeObserver.observe(wrapperEl);

    // Spacebar panning scaffolding. Keep disabled unless you uncomment the key handlers.
    let isSpaceDown = false;
    let isPanning = false;
    let panStart = { x: 0, y: 0, sl: 0, st: 0 };
    let prevCanvasModes = null;

    function enterPanMode() {
      prevCanvasModes = {
        isDrawingMode: canvas.isDrawingMode,
        selection: canvas.selection,
        skipTargetFind: canvas.skipTargetFind
      };
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.skipTargetFind = true;
      wrapperEl.style.cursor = 'grab';
    }

    function exitPanMode() {
      if (prevCanvasModes) {
        canvas.isDrawingMode = prevCanvasModes.isDrawingMode;
        canvas.selection = prevCanvasModes.selection;
        canvas.skipTargetFind = prevCanvasModes.skipTargetFind;
        prevCanvasModes = null;
      }
      wrapperEl.style.cursor = '';
      setBrush(currentTool);
    }

    // document.addEventListener('keydown', e => {
    //   if (e.code === 'Space' && !isSpaceDown) {
    //     isSpaceDown = true;
    //     e.preventDefault();
    //     enterPanMode();
    //   }
    // }, { passive: false });
    // document.addEventListener('keyup', e => {
    //   if (e.code === 'Space') {
    //     isSpaceDown = false;
    //     isPanning = false;
    //     exitPanMode();
    //   }
    // });

    // Start panning on mousedown inside wrapper while space held
    wrapperEl.addEventListener('mousedown', e => {
      if (!isSpaceDown) return;
      isPanning = true;
      panStart.x = e.clientX;
      panStart.y = e.clientY;
      panStart.sl = wrapperEl.scrollLeft;
      panStart.st = wrapperEl.scrollTop;
      wrapperEl.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      wrapperEl.scrollLeft = panStart.sl - dx;
      wrapperEl.scrollTop = panStart.st - dy;
    });

    window.addEventListener('mouseup', () => {
      if (!isPanning) return;
      isPanning = false;
      wrapperEl.style.cursor = isSpaceDown ? 'grab' : '';
    });

    // Autosave hooks
    canvas.on('object:added', saveCanvasThrottled);
    canvas.on('object:modified', saveCanvasThrottled);
    canvas.on('object:removed', saveCanvasThrottled);
    canvas.on('path:created', saveCanvasThrottled);
    canvas.on('text:changed', saveCanvasThrottled);
    window.addEventListener('beforeunload', saveCanvas);
  }
})();
