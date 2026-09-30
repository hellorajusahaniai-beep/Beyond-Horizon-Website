(() => {
    // Global error listener to capture and log any unhandled errors
    window.addEventListener('error', (e) => {
        console.error('Captured window error:', e.message, 'at', e.filename, ':', e.lineno, ':', e.colno, e.error ? e.error.stack : '');
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Captured unhandled promise rejection:', e.reason);
    });

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafScheduled = false;


    /**
     * Unified StageSequenceController
     * Manages a single full-bleed canvas, zero-artifact optical globalAlpha cross-dissolves
     * between Sequence 1 and Sequence 2, independent step states, high-DPI scaling,
     * and responsive overlay gradients on a single pinned stage.
     * 
     * 60fps Scroll Optimization Features:
     * - Zero DOM reads during scroll frames (cached timeline bounds, DPR, and draw coordinates)
     * - Decoupled scroll handler & rAF rendering loop
     * - Frame draw caching (skips redundant redraws when targetIdx is unchanged)
     * - Instant nearest-decoded-neighbour fallback with console logging
     * - effectiveDPR calculated once on resize/orientationchange
     */
    class StageSequenceController {
        constructor() {
            this.wrapper = document.getElementById('stage-scroll-wrapper');
            this.stickyPanel = document.getElementById('stage-sticky-panel');
            this.panelSeq1 = document.getElementById('stage-panel-seq1');
            this.panelSeq2 = document.getElementById('stage-panel-seq2');
            this.canvas1 = document.getElementById('stage-canvas-1');
            this.canvas2 = document.getElementById('stage-canvas-2');
            this.gradientOverlay = document.getElementById('stage-gradient-overlay');
            this.stepCounter = document.getElementById('stage-step-counter');
            this.stepCounterText = document.getElementById('stage-counter-text');

            this.loader = document.getElementById('stage-loader');
            this.loaderBarFill = document.getElementById('loader-bar-fill');
            this.loaderText = document.getElementById('loader-text');

            // Text Blocks
            this.seq1TextBlock = document.getElementById('hero-text-block');
            this.seq1Steps = this.seq1TextBlock ? Array.from(this.seq1TextBlock.querySelectorAll('.text-step')) : [];
            this.stepDots = Array.from(document.querySelectorAll('.step-dots .step-dot'));

            this.seq2Container = document.getElementById('seq2-text-container');
            this.seq2Steps = this.seq2Container ? Array.from(this.seq2Container.querySelectorAll('.seq2-step')) : [];

            this.ctx1 = this.canvas1 ? this.canvas1.getContext('2d', { alpha: true }) : null;
            this.ctx2 = this.canvas2 ? this.canvas2.getContext('2d', { alpha: true }) : null;

            // Frame Configurations
            this.seq1Config = {
                landscapeFrames: 140,
                portraitFrames: 90,
                startFrame: 1,
                landscapeBase: 'images',
                portraitBase: 'images-portrait',
                filePrefix: 'frame_',
                focalX: 0.58,
                focalY: 0.40,
                stepRanges: [0.33, 0.67] // Steps: 0.00-0.33, 0.33-0.67, 0.67-1.00
            };

            this.seq2Config = {
                landscapeFrames: 148,
                portraitFrames: 96,
                startFrame: 1,
                landscapeBase: 'images-2',
                portraitBase: 'images-2-portrait',
                filePrefix: 'frame_',
                focalX: 0.50,
                focalY: 0.40,
                stepRanges: [0.333, 0.667] // Steps: 0.00-0.333 (Services), 0.333-0.667 (Stats), 0.667-1.00 (Clients)
            };

            this.seq1Frames = [];
            this.seq2Frames = [];
            this.seq1LoadedCount = 0;
            this.seq2LoadedCount = 0;
            this.decodedCount = 0;
            this.isLoaderDismissed = false;
            this.isPreloadStarted = false;

            this.seq1CurrentStep = -1;
            this.seq2CurrentStep = -1;
            this.activeZone = 1; // 1: Seq1, 2: Slide Handoff, 3: Seq2, 4: Outro

            // Cached Timeline & Geometry (Computed on resize / orientationchange)
            this.cachedVw = window.innerWidth || 1;
            this.cachedVh = window.innerHeight || 1;
            this.cachedIsPortrait = (this.cachedVw / this.cachedVh) < 1.0;
            this.cachedIsMobile = this.cachedVw < 768;
            this.effectiveDpr = 1;
            this.canvasW = 0;
            this.canvasH = 0;

            // Timeline Bounds:
            // Zone 1 (Seq 1 Scrub): 0 -> 2.40vh
            // Zone 2 (Slide Handoff ~70vh): 2.40vh -> 3.10vh (Midpoint at 2.75vh)
            // Zone 3 (Seq 2 Scrub): 3.10vh -> 6.70vh (3.60vh duration)
            this.zone1End = 2.40 * this.cachedVh;
            this.zone2Start = 2.40 * this.cachedVh;
            this.zone2Duration = 0.70 * this.cachedVh;
            this.zone2End = this.zone2Start + this.zone2Duration; // 3.10vh
            this.zone2Midpoint = this.zone2Start + (this.zone2Duration / 2); // 2.75vh
            this.zone3Start = this.zone2End; // 3.10vh
            this.zone3Duration = 3.60 * this.cachedVh;
            this.zone3End = this.zone3Start + this.zone3Duration; // 6.70vh
            this.zoneOutroThreshold = this.zone3End + (0.5 * this.cachedVh);

            this.seq1Total = this.cachedIsPortrait ? this.seq1Config.portraitFrames : this.seq1Config.landscapeFrames;
            this.seq2Total = this.cachedIsPortrait ? this.seq2Config.portraitFrames : this.seq2Config.landscapeFrames;
            this.seq1DrawRect = null;
            this.seq2DrawRect = null;

            // Frame Draw Cache to avoid redundant redraws
            this.lastDrawnSeq1Idx = -1;
            this.lastDrawnSeq2Idx = -1;
            this.lastRenderedZone = 0;

            // Cached layer opacities for zero redundant DOM writes
            this.panelSeq1Opacity = -1;
            this.panelSeq2Opacity = -1;

            // Scroll-aware preload state: pause background work during active user scroll
            this.isUserScrolling = false;
            this.scrollDirection = 1;
            this.activeDecodes = 0;
            this.maxConcurrentDecodes = 3;
            this.isPreloadPaused = false;
            this.preloadQueueTimer = null;
            this._strideKeyframes = [];
            this._strideIdx = 0;
            this._fillSeq1 = 1;
            this._fillSeq2 = 1;

            if (!this.wrapper || !this.canvas1 || !this.ctx1) return;

            this.init();
        }

        isPortrait() {
            return this.cachedIsPortrait;
        }

        getFrameCount(cfg) {
            return this.cachedIsPortrait ? cfg.portraitFrames : cfg.landscapeFrames;
        }

        getBase(cfg) {
            return this.cachedIsPortrait ? cfg.portraitBase : cfg.landscapeBase;
        }

        getFramePath(cfg, index1Based, format = 'webp') {
            const frameNum = cfg.startFrame + (index1Based - 1);
            const padded = String(frameNum).padStart(4, '0');
            const base = this.getBase(cfg);
            if (this.cachedIsPortrait && format === 'jpg') {
                return `${base}-webp/${cfg.filePrefix}${padded}.webp`;
            }
            const folder = format === 'webp' ? `${base}-webp` : `${base}-jpg`;
            return `${folder}/${cfg.filePrefix}${padded}.${format}`;
        }

        init() {
            this.resize();
            this.startPreload();
        }

        onUserScrollStart(dir = 1) {
            this.isUserScrolling = true;
            this.scrollDirection = dir;
            if (this.preloadQueueTimer) {
                clearTimeout(this.preloadQueueTimer);
                this.preloadQueueTimer = null;
            }
            this.isPreloadPaused = true;
        }

        onUserScrollIdle() {
            this.isUserScrolling = false;
            if (this.isPreloadPaused) {
                this.isPreloadPaused = false;
                if (this._loadStrides && this._strideIdx < this._strideKeyframes.length) {
                    this._loadStrides();
                } else if (this._loadFillFrames) {
                    this._loadFillFrames();
                }
            }
        }

        startPreload() {
            if (this.isPreloadStarted) return;
            this.isPreloadStarted = true;

            const seq1Total = this.seq1Total;
            const seq2Total = this.seq2Total;

            this.seq1Frames = new Array(seq1Total);
            this.seq2Frames = new Array(seq2Total);
            this.decodedCount = 0;
            this.seq1LoadedCount = 0;
            this.seq2LoadedCount = 0;

            // 1. Instant First Frames for both sequences (urgent decode)
            this.loadFrame(1, 0, () => {
                if (!this.isLoaderDismissed) {
                    this.isLoaderDismissed = true;
                    this.lastDrawnSeq1Idx = -1;
                    this.lastDrawnSeq2Idx = -1;
                    if (this.loader) this.loader.classList.add('hidden');
                    this.renderTick();
                }
            }, true);
            this.loadFrame(2, 0, null, true);
            this.loadFrame(2, 1, null, true);

            // 2. High-speed Milestone Strides (every 3rd frame)
            this._strideKeyframes = [];
            for (let i = 2; i < seq1Total; i += 3) this._strideKeyframes.push({ seq: 1, idx: i });
            for (let i = 2; i < seq2Total; i += 3) this._strideKeyframes.push({ seq: 2, idx: i });
            this._strideIdx = 0;

            this._loadStrides = () => {
                if (this.isUserScrolling) {
                    this.isPreloadPaused = true;
                    return;
                }
                const batch = Math.min(this._strideIdx + 6, this._strideKeyframes.length);
                for (let k = this._strideIdx; k < batch; k++) {
                    const item = this._strideKeyframes[k];
                    this.loadFrame(item.seq, item.idx, null, false);
                }
                this._strideIdx = batch;
                if (this._strideIdx < this._strideKeyframes.length) {
                    this.preloadQueueTimer = setTimeout(this._loadStrides, 20);
                } else {
                    this._loadFillFrames();
                }
            };

            // 3. Background Fill: stream remaining frames in modest batches without choking CPU
            this._fillSeq1 = 1;
            this._fillSeq2 = 1;
            this._loadFillFrames = () => {
                if (this.isUserScrolling) {
                    this.isPreloadPaused = true;
                    return;
                }
                let queued = 0;
                while (queued < 6 && this._fillSeq1 < seq1Total) {
                    if (!this.seq1Frames[this._fillSeq1]) {
                        this.loadFrame(1, this._fillSeq1, null, false);
                        queued++;
                    }
                    this._fillSeq1++;
                }
                while (queued < 6 && this._fillSeq2 < seq2Total) {
                    if (!this.seq2Frames[this._fillSeq2]) {
                        this.loadFrame(2, this._fillSeq2, null, false);
                        queued++;
                    }
                    this._fillSeq2++;
                }
                if (this._fillSeq1 < seq1Total || this._fillSeq2 < seq2Total) {
                    this.preloadQueueTimer = setTimeout(this._loadFillFrames, 24);
                }
            };

            // Kick off milestone loading after initial paint
            setTimeout(this._loadStrides, 40);
        }

        prioritizeFrames(seqId, targetIdx, range = 5, dir = 1) {
            const arr = seqId === 1 ? this.seq1Frames : this.seq2Frames;
            const total = seqId === 1 ? this.seq1Total : this.seq2Total;

            // 1. Immediately request the target frame itself if missing
            if (!arr[targetIdx]) {
                this.loadFrame(seqId, targetIdx, null, true);
            }

            // 2. Prioritize upcoming frames in the direction of scroll
            const step = dir >= 0 ? 1 : -1;
            for (let offset = 1; offset <= range; offset++) {
                const aheadIdx = targetIdx + (offset * step);
                if (aheadIdx >= 0 && aheadIdx < total && !arr[aheadIdx]) {
                    this.loadFrame(seqId, aheadIdx, null, true);
                }
            }

            // 3. Keep 1-2 trailing frames loaded for smooth reverse scrub
            for (let offset = 1; offset <= 2; offset++) {
                const behindIdx = targetIdx - (offset * step);
                if (behindIdx >= 0 && behindIdx < total && !arr[behindIdx]) {
                    this.loadFrame(seqId, behindIdx, null, false);
                }
            }
        }

        loadFrame(seqId, i, cb, isUrgent = false) {
            const cfg = seqId === 1 ? this.seq1Config : this.seq2Config;
            const arr = seqId === 1 ? this.seq1Frames : this.seq2Frames;
            if (arr[i]) {
                if (cb && arr[i].complete) cb();
                return;
            }

            const frameNumber = i + 1;
            const img = new Image();
            arr[i] = img;
            let isHandled = false;

            const onDone = () => {
                if (isHandled) return;
                isHandled = true;
                if (isUrgent && this.activeDecodes > 0) this.activeDecodes--;
                this.decodedCount++;
                if (seqId === 1) this.seq1LoadedCount++;
                else this.seq2LoadedCount++;

                if (i === 0 && seqId === 1 && !this.isLoaderDismissed) {
                    this.isLoaderDismissed = true;
                    this.lastDrawnSeq1Idx = -1;
                    this.lastDrawnSeq2Idx = -1;
                    if (this.loader) this.loader.classList.add('hidden');
                    this.renderTick();
                }
                if (cb) cb();
            };

            img.onload = () => {
                // Throttle decode() only to urgent frames near playhead
                if (isUrgent && 'decode' in img && this.activeDecodes < this.maxConcurrentDecodes) {
                    this.activeDecodes++;
                    img.decode().then(onDone).catch(onDone);
                } else {
                    onDone();
                }
            };

            img.onerror = () => {
                if (!this.cachedIsPortrait && img.src.endsWith('.webp')) {
                    img.src = this.getFramePath(cfg, frameNumber, 'jpg');
                } else {
                    arr[i] = null;
                    onDone();
                }
            };

            img.src = this.getFramePath(cfg, frameNumber, 'webp');
        }

        // Precalculate Draw Rectangles for 60fps GPU drawImage calls
        calcDrawRect(imgW, imgH, focalX, focalY) {
            const w = this.canvasW;
            const h = this.canvasH;
            const scaleX = w / imgW;
            const scaleY = h / imgH;
            const drawScale = Math.max(scaleX, scaleY);

            const drawW = Math.round(imgW * drawScale);
            const drawH = Math.round(imgH * drawScale);

            let drawX = 0;
            let drawY = 0;

            if (!this.cachedIsPortrait) {
                drawX = Math.round((w - drawW) / 2);
                drawY = Math.round((h - drawH) / 2);
            } else {
                const idealX = (w * 0.5) - (drawW * focalX);
                drawX = Math.round(Math.min(0, Math.max(w - drawW, idealX)));

                const idealY = (h * 0.40) - (drawH * focalY);
                drawY = Math.round(Math.min(0, Math.max(h - drawH, idealY)));
            }

            return { drawX, drawY, drawW, drawH };
        }

        resize() {
            this.cachedVw = window.innerWidth || document.documentElement.clientWidth || 1;
            this.cachedVh = window.innerHeight || document.documentElement.clientHeight || 1;
            this.cachedIsPortrait = (this.cachedVw / this.cachedVh) < 1.0;
            this.cachedIsMobile = this.cachedVw < 768;

            const frameW = this.cachedIsPortrait ? 1440 : 1920;
            const frameH = this.cachedIsPortrait ? 810 : 1080;

            // Effective DPR Formula: Capped to 1.0 on mobile, 1.25 on desktop for rock-solid 60fps
            const maxDpr = this.cachedIsMobile ? 1.0 : 1.25;
            this.effectiveDpr = Math.min(window.devicePixelRatio || 1, maxDpr);

            this.canvasW = Math.round(this.cachedVw * this.effectiveDpr);
            this.canvasH = Math.round(this.cachedVh * this.effectiveDpr);

            if (this.canvas1) {
                this.canvas1.width = this.canvasW;
                this.canvas1.height = this.canvasH;
                this.canvas1.style.width = `${this.cachedVw}px`;
                this.canvas1.style.height = `${this.cachedVh}px`;
            }

            if (this.canvas2) {
                this.canvas2.width = this.canvasW;
                this.canvas2.height = this.canvasH;
                this.canvas2.style.width = `${this.cachedVw}px`;
                this.canvas2.style.height = `${this.cachedVh}px`;
            }

            if (this.ctx1) {
                this.ctx1.imageSmoothingEnabled = true;
                this.ctx1.imageSmoothingQuality = 'medium';
            }

            if (this.ctx2) {
                this.ctx2.imageSmoothingEnabled = true;
                this.ctx2.imageSmoothingQuality = 'medium';
            }

            // Cache Timeline Zone Distances
            this.zone1End = 2.40 * this.cachedVh;
            this.zone2Start = 2.40 * this.cachedVh;
            this.zone2Duration = 0.70 * this.cachedVh;
            this.zone2End = this.zone2Start + this.zone2Duration; // 3.10vh
            this.zone2Midpoint = this.zone2Start + (this.zone2Duration / 2); // 2.75vh
            this.zone3Start = this.zone2End; // 3.10vh
            this.zone3Duration = 3.60 * this.cachedVh;
            this.zone3End = this.zone3Start + this.zone3Duration; // 6.70vh
            this.zoneOutroThreshold = this.zone3End + (0.5 * this.cachedVh);

            this.seq1Total = this.cachedIsPortrait ? this.seq1Config.portraitFrames : this.seq1Config.landscapeFrames;
            this.seq2Total = this.cachedIsPortrait ? this.seq2Config.portraitFrames : this.seq2Config.landscapeFrames;

            // Pre-calculate draw rectangles
            this.seq1DrawRect = this.calcDrawRect(frameW, frameH, this.seq1Config.focalX, this.seq1Config.focalY);
            this.seq2DrawRect = this.calcDrawRect(frameW, frameH, this.seq2Config.focalX, this.seq2Config.focalY);

            // Invalidate draw cache to force redraw on resize
            this.lastDrawnSeq1Idx = -1;
            this.lastDrawnSeq2Idx = -1;
            this.lastRenderedZone = 0;

            this.renderTick();
        }

        drawCoverWithRect(ctx, img, rect) {
            if (!ctx || !img || !img.complete || img.naturalWidth === 0) return;
            ctx.drawImage(img, rect.drawX, rect.drawY, rect.drawW, rect.drawH);
        }

        getFallbackFrame(arr, index, total, seqId = 1) {
            const current = arr[index];
            if (current && current.complete && current.naturalWidth > 0) return current;

            // Fast bounded search (max +/- 8 frames)
            const maxRadius = Math.min(8, total);
            for (let offset = 1; offset <= maxRadius; offset++) {
                const prevIdx = index - offset;
                if (prevIdx >= 0) {
                    const prev = arr[prevIdx];
                    if (prev && prev.complete && prev.naturalWidth > 0) return prev;
                }
                const nextIdx = index + offset;
                if (nextIdx < total) {
                    const next = arr[nextIdx];
                    if (next && next.complete && next.naturalWidth > 0) return next;
                }
            }

            // O(1) fallback to last successfully drawn frame or first frame
            const lastIdx = seqId === 1 ? this.lastDrawnSeq1Idx : this.lastDrawnSeq2Idx;
            if (lastIdx >= 0 && arr[lastIdx] && arr[lastIdx].complete && arr[lastIdx].naturalWidth > 0) {
                return arr[lastIdx];
            }
            if (arr[0] && arr[0].complete && arr[0].naturalWidth > 0) {
                return arr[0];
            }
            return null;
        }

        updateStepCounter(stepNum, totalSteps = 3) {
            if (!this.stepCounter || !this.stepCounterText) return;
            const formatted = `${String(stepNum).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`;
            if (this.stepCounterText.textContent !== formatted) {
                this.stepCounterText.textContent = formatted;
            }
        }

        renderTick(customScrollY) {
            if (!this.wrapper || !this.ctx1) return;
            const scrollY = typeof customScrollY === 'number' ? customScrollY : (window._targetScrollY || window.scrollY || window.pageYOffset || 0);

            // Performance Optimization: If stage is scrolled past viewport, skip canvas rendering
            if (scrollY > this.zoneOutroThreshold) {
                return;
            }

            const w = this.canvasW;
            const h = this.canvasH;

            if (scrollY < this.zone1End) {
                // ==========================================
                // ZONE 1: SEQUENCE 1 SCRUB (0 -> 2.40vh)
                // ==========================================
                const p1 = Math.min(1.0, Math.max(0, scrollY / this.zone1End));
                const targetIdx = prefersReducedMotion ? 0 : Math.min(this.seq1Total - 1, Math.max(0, Math.round(p1 * (this.seq1Total - 1))));
                window._targetFrame = targetIdx;
                window._targetFrameSeq1 = targetIdx;
                this.prioritizeFrames(1, targetIdx, 5, this.scrollDirection);

                // Guarded layer opacity updates (zero redundant style writes)
                if (this.panelSeq1Opacity !== 1) {
                    this.panelSeq1Opacity = 1;
                    if (this.panelSeq1) {
                        this.panelSeq1.style.transform = 'translateY(0%)';
                        this.panelSeq1.style.opacity = '1';
                    }
                }
                if (this.panelSeq2Opacity !== 0) {
                    this.panelSeq2Opacity = 0;
                    if (this.panelSeq2) {
                        this.panelSeq2.style.transform = 'translateY(0%)';
                        this.panelSeq2.style.opacity = '0';
                    }
                }

                // Draw frame if frame changed or coming from another zone
                if (targetIdx !== this.lastDrawnSeq1Idx || this.lastRenderedZone !== 1) {
                    const img = this.getFallbackFrame(this.seq1Frames, targetIdx, this.seq1Total, 1);
                    if (img && this.ctx1) {
                        this.lastDrawnSeq1Idx = targetIdx;
                        this.lastRenderedZone = 1;
                        this.ctx1.globalAlpha = 1.0;
                        this.drawCoverWithRect(this.ctx1, img, this.seq1DrawRect);
                    }
                }

                // Pre-draw Frame 1 on Canvas 2 so it is immediately ready when sliding up
                if (this.lastDrawnSeq2Idx !== 1 && this.seq2LoadedCount > 0) {
                    const img2 = this.getFallbackFrame(this.seq2Frames, 1, this.seq2Total, 2);
                    if (img2 && this.ctx2) {
                        this.lastDrawnSeq2Idx = 1;
                        this.ctx2.globalAlpha = 1.0;
                        this.drawCoverWithRect(this.ctx2, img2, this.seq2DrawRect);
                    }
                }

                // Update Sequence 1 Steps
                let step1 = 0;
                if (p1 < this.seq1Config.stepRanges[0]) step1 = 0;
                else if (p1 < this.seq1Config.stepRanges[1]) step1 = 1;
                else step1 = 2;

                if (step1 !== this.seq1CurrentStep) {
                    this.seq1CurrentStep = step1;
                    this.seq1Steps.forEach((el, idx) => {
                        el.classList.toggle('active', idx === step1);
                        el.classList.toggle('prev', idx < step1);
                    });
                    this.stepDots.forEach((dot, idx) => dot.classList.toggle('active', idx === step1));
                    this.updateStepCounter(step1 + 1, 3);
                }

                if (this.seq2Steps.length && this.seq2CurrentStep !== 0) {
                    this.seq2Steps.forEach((el, idx) => {
                        el.classList.toggle('active', idx === 0);
                        el.classList.remove('prev');
                    });
                    this.seq2CurrentStep = 0;
                }
                if (this.gradientOverlay && this.gradientOverlay.classList.contains('seq2-mode')) {
                    this.gradientOverlay.classList.remove('seq2-mode');
                }
                if (this.wrapper && this.wrapper.classList.contains('step-stats-active')) {
                    this.wrapper.classList.remove('step-stats-active');
                }
                animateSeq2Stats(false);

            } else if (scrollY >= this.zone2Start && scrollY < this.zone2End) {
                // ==========================================
                // ZONE 2: CINEMATIC CROSS-DISSOLVE (2.40vh -> 3.10vh, 70vh duration)
                // ==========================================
                const slideP = Math.min(1.0, Math.max(0.0, (scrollY - this.zone2Start) / this.zone2Duration));
                this.lastRenderedZone = 2;
                this.prioritizeFrames(1, this.seq1Total - 1, 3, this.scrollDirection);
                this.prioritizeFrames(2, 1, 3, this.scrollDirection);

                const op1 = (1.0 - slideP).toFixed(3);
                const op2 = slideP.toFixed(3);

                if (this.panelSeq1Opacity !== op1) {
                    this.panelSeq1Opacity = op1;
                    if (this.panelSeq1) {
                        this.panelSeq1.style.transform = 'translateY(0%)';
                        this.panelSeq1.style.opacity = op1;
                    }
                }
                if (this.panelSeq2Opacity !== op2) {
                    this.panelSeq2Opacity = op2;
                    if (this.panelSeq2) {
                        this.panelSeq2.style.transform = 'translateY(0%)';
                        this.panelSeq2.style.opacity = op2;
                    }
                }

                // Ensure final frame drawn on Canvas 1
                if (this.lastDrawnSeq1Idx !== this.seq1Total - 1) {
                    const img1 = this.getFallbackFrame(this.seq1Frames, this.seq1Total - 1, this.seq1Total, 1);
                    if (img1 && this.ctx1) {
                        this.lastDrawnSeq1Idx = this.seq1Total - 1;
                        this.ctx1.globalAlpha = 1.0;
                        this.drawCoverWithRect(this.ctx1, img1, this.seq1DrawRect);
                    }
                }

                // Ensure frame 1 drawn on Canvas 2
                if (this.lastDrawnSeq2Idx !== 1) {
                    const img2 = this.getFallbackFrame(this.seq2Frames, 1, this.seq2Total, 2);
                    if (img2 && this.ctx2) {
                        this.lastDrawnSeq2Idx = 1;
                        this.ctx2.globalAlpha = 1.0;
                        this.drawCoverWithRect(this.ctx2, img2, this.seq2DrawRect);
                    }
                }

                // Sequence 1 Step 3 and Sequence 2 Step 0 active
                if (this.seq1CurrentStep !== 2 && this.seq1Steps.length) {
                    this.seq1Steps.forEach((el, idx) => {
                        el.classList.toggle('active', idx === 2);
                        el.classList.toggle('prev', idx < 2);
                    });
                    this.seq1CurrentStep = 2;
                }
                if (this.seq2CurrentStep !== 0 && this.seq2Steps.length) {
                    this.seq2Steps.forEach((el, idx) => {
                        el.classList.toggle('active', idx === 0);
                        el.classList.remove('prev');
                    });
                    this.seq2CurrentStep = 0;
                }

                // Single shared overlay and counter switch at midpoint (>= 50%)
                if (slideP < 0.50) {
                    if (this.gradientOverlay && this.gradientOverlay.classList.contains('seq2-mode')) {
                        this.gradientOverlay.classList.remove('seq2-mode');
                    }
                    this.updateStepCounter(3, 3);
                    this.stepDots.forEach((dot, idx) => dot.classList.toggle('active', idx === 2));
                } else {
                    if (this.gradientOverlay && !this.gradientOverlay.classList.contains('seq2-mode')) {
                        this.gradientOverlay.classList.add('seq2-mode');
                    }
                    this.updateStepCounter(1, 3);
                    this.stepDots.forEach((dot, idx) => dot.classList.toggle('active', idx === 0));
                }

                if (this.wrapper && this.wrapper.classList.contains('step-stats-active')) {
                    this.wrapper.classList.remove('step-stats-active');
                }
                animateSeq2Stats(false);

            } else {
                // ==========================================
                // ZONE 3: SEQUENCE 2 SCRUB & PIN (3.10vh -> 6.70vh)
                // ==========================================
                const p2 = Math.min(1.0, Math.max(0.0, (scrollY - this.zone3Start) / this.zone3Duration));
                const targetIdx = prefersReducedMotion ? 1 : Math.min(this.seq2Total - 1, Math.max(1, 1 + Math.round(p2 * (this.seq2Total - 2))));
                window._targetFrame = targetIdx;
                window._targetFrameSeq2 = targetIdx;
                this.prioritizeFrames(2, targetIdx, 5, this.scrollDirection);

                // Guarded layer opacity updates (zero redundant style writes)
                if (this.panelSeq1Opacity !== 0) {
                    this.panelSeq1Opacity = 0;
                    if (this.panelSeq1) {
                        this.panelSeq1.style.transform = 'translateY(0%)';
                        this.panelSeq1.style.opacity = '0';
                    }
                }
                if (this.panelSeq2Opacity !== 1) {
                    this.panelSeq2Opacity = 1;
                    if (this.panelSeq2) {
                        this.panelSeq2.style.transform = 'translateY(0%)';
                        this.panelSeq2.style.opacity = '1';
                    }
                }

                // Draw frame if frame changed or coming from another zone
                if (targetIdx !== this.lastDrawnSeq2Idx || this.lastRenderedZone !== 3) {
                    const img = this.getFallbackFrame(this.seq2Frames, targetIdx, this.seq2Total, 2);
                    if (img && this.ctx2) {
                        this.lastDrawnSeq2Idx = targetIdx;
                        this.lastRenderedZone = 3;
                        this.ctx2.globalAlpha = 1.0;
                        this.drawCoverWithRect(this.ctx2, img, this.seq2DrawRect);
                    }
                }

                if (this.gradientOverlay && !this.gradientOverlay.classList.contains('seq2-mode')) {
                    this.gradientOverlay.classList.add('seq2-mode');
                }

                // Update Sequence 2 Steps
                let step2 = 0;
                if (p2 < this.seq2Config.stepRanges[0]) step2 = 0;
                else if (p2 < this.seq2Config.stepRanges[1]) step2 = 1;
                else step2 = 2;

                if (step2 !== this.seq2CurrentStep) {
                    this.seq2CurrentStep = step2;
                    this.seq2Steps.forEach((el, idx) => {
                        el.classList.toggle('active', idx === step2);
                        el.classList.toggle('prev', idx < step2);
                    });
                    this.stepDots.forEach((dot, idx) => dot.classList.toggle('active', idx === step2));
                    this.updateStepCounter(step2 + 1, 3);

                    if (this.wrapper) {
                        this.wrapper.classList.toggle('step-stats-active', step2 === 1);
                    }
                    if (step2 === 1) {
                        animateSeq2Stats(true);
                    } else {
                        animateSeq2Stats(false);
                    }
                }
            }
        }
    }

    // Helper function for Sequence 2 Proof Stats count-up animation (~800ms ease-out)
    function animateSeq2Stats(isActive) {
        const statItems = document.querySelectorAll('.seq2-stat-item');
        if (!statItems.length) return;

        if (prefersReducedMotion) {
            statItems.forEach(item => {
                const numEl = item.querySelector('.seq2-stat-num');
                const target = item.dataset.target || '0';
                const suffix = item.dataset.suffix || '';
                if (numEl) numEl.textContent = `${target}${suffix}`;
            });
            return;
        }

        if (!isActive) {
            statItems.forEach(item => {
                if (item._countAnim) {
                    cancelAnimationFrame(item._countAnim);
                    item._countAnim = null;
                }
                const numEl = item.querySelector('.seq2-stat-num');
                const suffix = item.dataset.suffix || '';
                if (numEl) numEl.textContent = `0${suffix}`;
            });
            return;
        }

        statItems.forEach((item, index) => {
            const numEl = item.querySelector('.seq2-stat-num');
            if (!numEl) return;

            const targetVal = parseFloat(item.dataset.target || '0');
            const suffix = item.dataset.suffix || '';
            const delay = index * 140; // Staggered count-up start with item reveal
            const duration = 800; // ~800ms ease-out

            if (item._countAnim) cancelAnimationFrame(item._countAnim);
            numEl.textContent = `0${suffix}`;

            const startTime = performance.now() + delay;

            function updateCount(currentTime) {
                if (currentTime < startTime) {
                    item._countAnim = requestAnimationFrame(updateCount);
                    return;
                }

                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentVal = Math.round(easeOut * targetVal);

                numEl.textContent = `${currentVal}${suffix}`;

                if (progress < 1) {
                    item._countAnim = requestAnimationFrame(updateCount);
                } else {
                    numEl.textContent = `${targetVal}${suffix}`;
                    item._countAnim = null;
                }
            }

            item._countAnim = requestAnimationFrame(updateCount);
        });
    }

    /**
     * Authentic Case Studies Data & Live Creative Assets Dictionary
     */
    const CASE_STUDIES_DATA = {
        'siddhi': {
            title: 'SIDDHI DENTAL CARE',
            subtitle: 'KALYAN / DOMBIVLI · ADVANCED DENTAL PRACTICE',
            badge: 'CLIENT WORK',
            images: [
                { src: 'assets/clients/siddhi-dental-treating.jpg', label: 'Doctor Treatment in Action' },
                { src: 'assets/clients/siddhi-dental-tech.jpg', label: 'Modern Clinic Infrastructure' },
                { src: 'assets/clients/siddhi-clinic-building.jpg', label: 'Clinic Exterior & Reception' },
                { src: 'assets/clients/siddhi-logo.png', label: 'Official Clinic Identity' }
            ],
            challenge: 'Siddhi Dental Care had modern facilities and expert doctors, but relied heavily on offline footfall and sporadic walk-in visits. The clinic needed a modern digital presence, on-site clinical photography, and a frictionless booking experience.',
            solution: 'Beyond Horizon built a modern website, captured real operatory and clinic photography, and implemented a streamlined 1-click WhatsApp appointment workflow for local patients.',
            results: 'Established a professional web presence, improved patient inquiry responsiveness via WhatsApp, and provided prospective patients with clear treatment information and transparent doctor profiles before their visit.',
            testimonial: '"Beyond Horizon created a clean, modern website with real clinic photos. Patients now arrive informed and confident about our procedures."',
            author: 'Dr. Siddhi & Team — Siddhi Dental Care',
            prefill: 'Dental Clinic / Healthcare Practice'
        },
        'gcs': {
            title: 'GLOBAL COMPUTER SOLUTION',
            subtitle: 'KONGAON, KALYAN WEST · COMPUTERS, IT HARDWARE & CCTV',
            badge: 'CLIENT WORK',
            images: [
                { src: 'assets/clients/global-computer-ad.png', label: 'Commercial Office Desktop Ad Creative' },
                { src: 'assets/clients/global-computer-banner.png', label: 'Complete IT Solutions Store Banner' },
                { src: 'assets/clients/global-cctv-ad.png', label: 'CCTV Security Systems Ad' },
                { src: 'assets/clients/meta-ads-proof.png', label: 'Verified Meta Ads Dashboard' }
            ],
            challenge: 'GCS had extensive hardware inventory and technician teams, but was largely known only to immediate footfall in Kongaon. They needed local search visibility and advertising for commercial IT services and CCTV installations.',
            solution: 'Beyond Horizon developed their Google Business profile, local search strategy, targeted product creatives, and direct WhatsApp inquiry routing for business owners and institutions.',
            results: 'Significantly improved local search discovery for IT hardware and CCTV in Kalyan West, streamlined customer quote inquiries through WhatsApp, and built a consistent product catalog presence.',
            testimonial: '"Raju and the Beyond Horizon team built campaigns that actually talk to local business owners. Clear communication, zero nonsense, and real local execution."',
            author: 'Founder & Director — Global Computer Solution',
            prefill: 'B2B Enterprise / IT Hardware Store'
        },
        'dental-reforms': {
            title: 'DENTAL REFORMS',
            subtitle: 'THANE, MAHARASHTRA · DENTAL CLINIC & ADVANCED DENTISTRY',
            badge: 'CLIENT WORK',
            images: [
                { src: 'assets/clients/dental-reforms-clinic.jpg', label: 'Clinic Operatory Overview' },
                { src: 'assets/clients/dr-dipika-video-thumb.jpg', label: 'Doctor-Led Educational Video' }
            ],
            challenge: 'Dental Reforms wanted to build stronger local visibility while creating educational content that communicates clinical expertise and builds patient trust across Thane.',
            solution: 'Beyond Horizon produced doctor-led educational video reels, educational carousels, on-location 4K operatory photography, and established an automated post-treatment Google review workflow.',
            results: 'Transformed their local presence with authentic clinical videos, established consistent educational content on Instagram, and created a steady stream of verified Google Maps patient reviews.',
            testimonial: '"Beyond Horizon came directly to our clinic to shoot real clinical procedures. Our Google Maps listing and Instagram now accurately reflect the quality of dentistry we deliver every day."',
            author: 'Dr. Dipika Dodeja — Dental Reforms',
            prefill: 'Dental Clinic / Healthcare Practice'
        },
        'dargar': {
            title: 'DARGAR COMMUNICATION',
            subtitle: 'KALYAN WEST · SMARTPHONES & ELECTRONICS RETAIL',
            badge: 'CLIENT WORK',
            images: [
                { src: 'assets/clients/dargar-shop.jpg', label: 'Retail Storefront - Kalyan West' }
            ],
            challenge: 'An established smartphone and electronics retailer needed stronger local discovery on Google Maps and social media so customers in Kalyan find them first before purchasing elsewhere.',
            solution: 'Beyond Horizon optimized their Google Business Profile, established a review collection system, created storefront and product content, and ran local promotional updates.',
            results: 'Consistent storefront updates, higher visibility in local Kalyan electronics searches, and an active customer review flow driving store visits and WhatsApp product inquiries.',
            testimonial: '"In local retail, footfall and WhatsApp enquiries matter. Beyond Horizon set up our Google Business profile and review system so customers find us first."',
            author: 'Dargar Communication — Kalyan West',
            prefill: 'Mobile & Electronics Retail'
        }
    };

    /**
     * EditorialBreatheController
     * Manages vertical editorial layout reveals, real-data stat animations,
     * FAQ accordion interactions, showcase category filtering, case study modals, and smooth anchor scrolling.
     */
    class EditorialBreatheController {
        constructor() {
            this.workRows = document.querySelectorAll('.work-editorial-row, .work-card');
            this.faqButtons = document.querySelectorAll('.faq-question-btn');
            this.contactForm = document.getElementById('contact-form');
            this.anchorLinks = document.querySelectorAll('a[href^="#"]');
            this.filterButtons = document.querySelectorAll('.work-filter-btn');
            this.caseModal = document.getElementById('case-study-modal');
            this.modalOpenBtns = document.querySelectorAll('.showcase-modal-btn');
            this.modalCloseBtn = document.getElementById('modal-close-btn');
            this.prefillLinks = document.querySelectorAll('a[data-prefill]');
            this.statAnimMap = new Map();

            this.init();
        }

        init() {
            this.initDeliverablesAccordion();
            this.initPricingPlanSelection();
            this.initCaseStudyTabs();
            this.initVideoPlayBtns();
            this.initFaqAccordion();
            this.initSmoothScroll();
            this.initScrollRevealObserver();
            this.initContactForm();
            this.initWorkFilter();
            this.initCaseStudyModal();
            this.initPrefillLinks();
        }

        initDeliverablesAccordion() {
            const delivBtns = document.querySelectorAll('.deliv-accordion-btn');
            delivBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const item = btn.closest('.deliv-accordion-item');
                    if (!item) return;
                    const isOpen = item.classList.contains('is-open');

                    if (isOpen) {
                        item.classList.remove('is-open');
                        btn.setAttribute('aria-expanded', 'false');
                    } else {
                        item.classList.add('is-open');
                        btn.setAttribute('aria-expanded', 'true');
                    }
                });
            });
        }

        initPricingPlanSelection() {
            const pricingBtns = document.querySelectorAll('.pricing-cta-btn[data-plan]');
            pricingBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const plan = btn.dataset.plan;
                    const budgetSelect = document.getElementById('contact-budget');
                    if (budgetSelect && plan) {
                        if (plan === 'Starter') budgetSelect.value = '₹15K–₹25K';
                        else if (plan === 'Growth') budgetSelect.value = '₹25K–₹50K';
                        else if (plan === 'Dominate') budgetSelect.value = '₹50K+';
                    }
                    const nameInput = document.getElementById('contact-name');
                    if (nameInput) {
                        setTimeout(() => nameInput.focus(), 600);
                    }
                });
            });
        }

        initFaqAccordion() {
            this.faqButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const item = btn.closest('.faq-item');
                    if (!item) return;
                    const isOpen = item.classList.contains('is-open');

                    if (isOpen) {
                        item.classList.remove('is-open');
                        btn.setAttribute('aria-expanded', 'false');
                    } else {
                        item.classList.add('is-open');
                        btn.setAttribute('aria-expanded', 'true');
                    }
                });
            });
        }

        initSmoothScroll() {
            this.anchorLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    const href = link.getAttribute('href');
                    if (!href || href === '#' || href.startsWith('#scroll-')) return;

                    const targetEl = document.querySelector(href);
                    if (targetEl) {
                        e.preventDefault();
                        const nav = document.getElementById('site-header');
                        const navHeight = nav ? nav.getBoundingClientRect().height : 70;
                        const targetY = targetEl.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - navHeight;

                        window.scrollTo({
                            top: Math.max(0, targetY),
                            behavior: prefersReducedMotion ? 'auto' : 'smooth'
                        });

                        try {
                            history.pushState(null, null, href);
                        } catch (err) { }
                    }
                });
            });
        }

        initScrollRevealObserver() {
            const revealElements = document.querySelectorAll('.reveal, .scroll-reveal, .reveal-on-scroll');
            if (!revealElements.length) return;

            if (prefersReducedMotion || !('IntersectionObserver' in window)) {
                revealElements.forEach(el => {
                    el.classList.add('is-visible', 'in-view');
                    if (el.classList.contains('work-editorial-row') || el.classList.contains('work-card')) el.classList.add('is-active');
                });
                return;
            }

            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        el.classList.add('is-visible', 'in-view');

                        // If it's a case study row/card, trigger stat count-up
                        if (el.classList.contains('work-editorial-row') || el.classList.contains('work-card')) {
                            el.classList.add('is-active');
                            const rowIdx = parseInt(el.dataset.row, 10) - 1;
                            this.triggerStatAnimation(rowIdx);
                        }

                        obs.unobserve(el);
                    }
                });
            }, {
                threshold: 0.05,
                rootMargin: '0px 0px -20px 0px'
            });

            revealElements.forEach(el => observer.observe(el));
        }

        initWorkFilter() {
            const catFilterBtns = document.querySelectorAll('.cat-filter-btn');
            const caseTabs = document.querySelectorAll('.case-nav-tab');
            const caseArticles = document.querySelectorAll('.case-study-article');
            const emptyState = document.getElementById('category-empty-state');

            if (catFilterBtns && catFilterBtns.length) {
                catFilterBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const filter = btn.dataset.category || 'all';
                        catFilterBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');

                        if (filter === 'food' || filter === 'real-estate') {
                            // Show in-production empty state
                            caseTabs.forEach(t => t.style.display = 'none');
                            caseArticles.forEach(a => a.classList.remove('active'));
                            if (emptyState) {
                                emptyState.style.display = 'block';
                                const titleEl = emptyState.querySelector('.empty-state-title');
                                const descEl = emptyState.querySelector('.empty-state-desc');
                                const ctaEl = emptyState.querySelector('.cta-audit-btn span');
                                if (filter === 'food') {
                                    if (titleEl) titleEl.textContent = 'FOOD & HOSPITALITY CASE STUDIES';
                                    if (descEl) descEl.textContent = 'We are currently executing video shoots and local customer acquisition systems for dining restaurants and cafes in Mumbai & Thane. Case studies will be published here upon campaign rollout.';
                                    if (ctaEl) ctaEl.textContent = 'GET FREE AUDIT FOR YOUR RESTAURANT →';
                                } else {
                                    if (titleEl) titleEl.textContent = 'REAL ESTATE CASE STUDIES';
                                    if (descEl) descEl.textContent = 'We are currently building localized lead-generation funnels and on-site property walkthrough video systems for real estate developers & brokers in Thane & Navi Mumbai.';
                                    if (ctaEl) ctaEl.textContent = 'GET FREE AUDIT FOR YOUR REAL ESTATE BUSINESS →';
                                }
                            }
                        } else {
                            if (emptyState) emptyState.style.display = 'none';

                            let firstMatch = null;
                            caseTabs.forEach(tab => {
                                const tabCat = tab.dataset.category;
                                if (filter === 'all' || tabCat === filter) {
                                    tab.style.display = 'inline-flex';
                                    if (!firstMatch) firstMatch = tab;
                                } else {
                                    tab.style.display = 'none';
                                }
                            });

                            // If current active tab is hidden, switch to first visible
                            const currentActiveTab = document.querySelector('.case-nav-tab.active');
                            if (!currentActiveTab || currentActiveTab.style.display === 'none') {
                                if (firstMatch) {
                                    firstMatch.click();
                                }
                            }
                        }
                    });
                });
            }

            if (this.filterButtons && this.filterButtons.length) {
                this.filterButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const filter = btn.dataset.filter;
                        this.filterButtons.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');

                        const cards = document.querySelectorAll('.work-card');
                        cards.forEach(card => {
                            const cat = card.dataset.category;
                            if (filter === 'all' || cat === filter) {
                                card.classList.remove('is-filtered-out');
                                card.classList.add('is-visible', 'in-view');
                            } else {
                                card.classList.add('is-filtered-out');
                            }
                        });
                    });
                });
            }
        }

        initCaseStudyModal() {
            if (!this.caseModal) return;

            // Open buttons on each card
            this.modalOpenBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const caseKey = btn.dataset.openCase;
                    const data = CASE_STUDIES_DATA[caseKey];
                    if (!data) return;

                    this.populateModal(data);
                    try {
                        this.caseModal.showModal();
                        document.body.style.overflow = 'hidden';
                    } catch (err) {
                        this.caseModal.setAttribute('open', '');
                    }
                });
            });

            // Close button
            if (this.modalCloseBtn) {
                this.modalCloseBtn.addEventListener('click', () => {
                    this.closeModal();
                });
            }

            // Close on backdrop click (click outside modal content)
            this.caseModal.addEventListener('click', (e) => {
                if (e.target === this.caseModal) {
                    this.closeModal();
                }
            });

            // Handle native escape key
            this.caseModal.addEventListener('cancel', () => {
                document.body.style.overflow = '';
            });

            // Modal CTA button
            const modalCta = document.getElementById('modal-primary-cta');
            if (modalCta) {
                modalCta.addEventListener('click', () => {
                    const prefillVal = modalCta.dataset.prefill || '';
                    this.closeModal();
                    this.scrollToContactAndPrefill(prefillVal);
                });
            }
        }

        populateModal(data) {
            const titleEl = document.getElementById('modal-client-title');
            const subEl = document.getElementById('modal-client-sub');
            const badgeEl = document.getElementById('modal-badge-text');
            const mainImg = document.getElementById('modal-main-img');
            const thumbsRow = document.getElementById('modal-thumbs-row');
            const probDesc = document.getElementById('modal-pillar-prob-desc');
            const solDesc = document.getElementById('modal-pillar-sol-desc');
            const resDesc = document.getElementById('modal-pillar-res-desc');
            const testText = document.getElementById('modal-testimonial-text');
            const testAuthor = document.getElementById('modal-testimonial-author');
            const modalCta = document.getElementById('modal-primary-cta');

            if (titleEl) titleEl.textContent = data.title;
            if (subEl) subEl.textContent = data.subtitle;
            if (badgeEl) badgeEl.textContent = data.badge;
            if (probDesc) probDesc.textContent = data.challenge;
            if (solDesc) solDesc.textContent = data.solution;
            if (resDesc) resDesc.textContent = data.results;
            if (testText) testText.textContent = data.testimonial;
            if (testAuthor) testAuthor.textContent = data.author;
            if (modalCta) modalCta.dataset.prefill = data.prefill;

            // Media setup
            if (mainImg && data.images && data.images.length > 0) {
                mainImg.src = data.images[0].src;
                mainImg.alt = data.images[0].label;
            }

            if (thumbsRow) {
                thumbsRow.innerHTML = '';
                if (data.images && data.images.length > 0) {
                    data.images.forEach((imgObj, idx) => {
                        const thumbBtn = document.createElement('button');
                        thumbBtn.type = 'button';
                        thumbBtn.className = `modal-thumb-btn ${idx === 0 ? 'active' : ''}`;
                        thumbBtn.setAttribute('aria-label', imgObj.label);

                        const thumbImg = document.createElement('img');
                        thumbImg.src = imgObj.src;
                        thumbImg.alt = imgObj.label;
                        thumbImg.loading = 'lazy';
                        thumbBtn.appendChild(thumbImg);

                        thumbBtn.addEventListener('click', () => {
                            thumbsRow.querySelectorAll('.modal-thumb-btn').forEach(b => b.classList.remove('active'));
                            thumbBtn.classList.add('active');
                            if (mainImg) {
                                mainImg.style.opacity = '0';
                                setTimeout(() => {
                                    mainImg.src = imgObj.src;
                                    mainImg.alt = imgObj.label;
                                    mainImg.style.opacity = '1';
                                }, 150);
                            }
                        });

                        thumbsRow.appendChild(thumbBtn);
                    });
                }
            }
        }

        closeModal() {
            if (!this.caseModal) return;
            try {
                this.caseModal.close();
            } catch (err) {
                this.caseModal.removeAttribute('open');
            }
            document.body.style.overflow = '';
        }

        initPrefillLinks() {
            this.prefillLinks.forEach(link => {
                link.addEventListener('click', () => {
                    const prefill = link.dataset.prefill;
                    if (prefill) {
                        this.scrollToContactAndPrefill(prefill);
                    }
                });
            });
        }

        initCaseStudyTabs() {
            const tabs = document.querySelectorAll('.case-nav-tab');
            const articles = document.querySelectorAll('.case-study-article');
            if (!tabs.length || !articles.length) return;

            const activateCase = (targetId, scrollIntoView = false) => {
                if (!targetId) return;
                const tab = document.querySelector(`.case-nav-tab[data-case-target="${targetId}"]`);
                const article = document.getElementById(`case-study-${targetId}`);
                if (!tab || !article) return;

                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                articles.forEach(a => {
                    a.classList.remove('active');
                });

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                article.classList.add('active');

                if (scrollIntoView) {
                    const header = document.getElementById('site-header');
                    const offset = header ? header.getBoundingClientRect().height : 70;
                    const y = tab.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - offset - 20;
                    window.scrollTo({ top: Math.max(0, y), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
                }
            };

            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const targetId = tab.dataset.caseTarget;
                    activateCase(targetId, false);
                });
            });

            // Connect Next Case Study buttons inside each article
            const nextBtns = document.querySelectorAll('.next-case-btn');
            nextBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const nextTarget = btn.dataset.nextTarget;
                    if (nextTarget) {
                        // Reset category filter to all if next case is in another category
                        const allFilter = document.querySelector('.cat-filter-btn[data-category="all"]');
                        if (allFilter && !allFilter.classList.contains('active')) {
                            allFilter.click();
                        }
                        activateCase(nextTarget, true);
                    }
                });
            });

            // Check URL hash on load and hashchange
            const handleHash = () => {
                const hash = window.location.hash.replace(/^#/, '');
                if (!hash) return;
                if (hash === 'dental-reforms' || hash === 'case-study-dental-reforms') {
                    activateCase('dental-reforms', true);
                } else if (hash === 'dargar' || hash === 'case-study-dargar' || hash === 'dargar-communication') {
                    activateCase('dargar', true);
                } else if (hash === 'siddhi' || hash === 'case-study-siddhi' || hash === 'siddhi-dental') {
                    activateCase('siddhi', true);
                } else if (hash === 'gcs' || hash === 'case-study-gcs' || hash === 'global-computer-solution') {
                    activateCase('gcs', true);
                }
            };

            handleHash();
            window.addEventListener('hashchange', handleHash);
        }

        initVideoPlayBtns() {
            const playBtns = document.querySelectorAll('.video-play-btn');
            playBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const card = btn.closest('.featured-video-card');
                    if (card) {
                        const overlay = card.querySelector('.video-play-overlay');
                        if (overlay) {
                            overlay.style.transition = 'opacity 300ms ease';
                            overlay.style.opacity = '0.2';
                            setTimeout(() => {
                                overlay.style.opacity = '1';
                            }, 1000);
                        }
                    }
                });
            });
        }

        scrollToContactAndPrefill(businessType) {
            const bizInput = document.getElementById('contact-biz');
            const nameInput = document.getElementById('contact-name');
            const contactSection = document.getElementById('contact');

            if (bizInput && businessType) {
                bizInput.value = businessType;
            }

            if (contactSection) {
                const nav = document.getElementById('site-header');
                const navHeight = nav ? nav.getBoundingClientRect().height : 70;
                const targetY = contactSection.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - navHeight;

                window.scrollTo({
                    top: Math.max(0, targetY),
                    behavior: prefersReducedMotion ? 'auto' : 'smooth'
                });
            }

            if (nameInput) {
                setTimeout(() => {
                    nameInput.focus();
                }, 600);
            }
        }

        triggerStatAnimation(rowIdx) {
            // Factual presentation - no synthetic counter animations
        }

        initContactForm() {
            if (!this.contactForm) return;
            const submitBtn = this.contactForm.querySelector('.editorial-submit-btn') || document.getElementById('contact-submit-btn');
            const statusMsg = document.getElementById('form-status-msg');
            const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbybk9uBoPRq91US9yRs_xMp8ADpqboqURz4jp3IZMDg0g5_EzBZkj6dfe898QB_AejW/exec';
            let isSubmitting = false;

            this.contactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                isSubmitting = true;

                const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '<span>START THE CONVERSATION</span><span aria-hidden="true">↗</span>';
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span>SENDING...</span>';
                }
                if (statusMsg) {
                    statusMsg.className = 'form-status-msg';
                    statusMsg.textContent = '';
                }

                const nameValue = (this.contactForm.querySelector('[name="name"]') || {}).value || '';
                const businessValue = (this.contactForm.querySelector('[name="business"]') || {}).value || '';
                const phoneValue = (this.contactForm.querySelector('[name="phone"]') || {}).value || '';
                const emailValue = (this.contactForm.querySelector('[name="email"]') || {}).value || '';
                const serviceValue = (this.contactForm.querySelector('[name="service"]') || {}).value || '';
                const budgetValue = (this.contactForm.querySelector('[name="budget"]') || {}).value || '';
                const profileValue = (this.contactForm.querySelector('[name="profile_url"]') || {}).value || '';
                const messageValue = (this.contactForm.querySelector('[name="message"]') || {}).value || '';
                const websiteValue = (this.contactForm.querySelector('[name="website"]') || {}).value || '';

                // Honeypot check: bots fill the hidden "website" field. Silently pretend success.
                if (websiteValue) {
                    if (statusMsg) {
                        statusMsg.className = 'form-status-msg is-success';
                        statusMsg.textContent = "Thank you! Your message has been sent. We'll be in touch within 24 hours.";
                    }
                    this.contactForm.reset();
                    isSubmitting = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnHtml;
                    }
                    return;
                }

                const formData = new FormData();
                formData.append('name', nameValue);
                formData.append('business', businessValue);
                formData.append('phone', phoneValue);
                formData.append('email', emailValue);
                formData.append('service', serviceValue);
                formData.append('budget', budgetValue);
                formData.append('profile_url', profileValue);
                formData.append('message', messageValue);

                try {
                    const response = await fetch(GOOGLE_SCRIPT_URL, {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json().catch(() => ({ status: 'success' }));

                    if (result && result.status === 'success') {
                        if (statusMsg) {
                            statusMsg.className = 'form-status-msg is-success';
                            statusMsg.textContent = "Thank you! Your message has been sent. We'll be in touch within 24 hours.";
                        }
                        this.contactForm.reset();
                    } else {
                        if (statusMsg) {
                            statusMsg.className = 'form-status-msg is-error';
                            statusMsg.textContent = "Something went wrong. Please email us directly at growwithbeyondhorizon@gmail.com";
                        }
                    }
                } catch (err) {
                    console.error('[CONTACT_FORM] Submission error:', err);
                    if (statusMsg) {
                        statusMsg.className = 'form-status-msg is-error';
                        statusMsg.textContent = "Something went wrong. Please email us directly at growwithbeyondhorizon@gmail.com";
                    }
                } finally {
                    isSubmitting = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnHtml;
                    }
                }
            });
        }

        renderTick() {
            // Native vertical scroll layout
        }
    }

    // Initialize Controllers
    const stageController = new StageSequenceController();
    const editorialController = new EditorialBreatheController();
    window.stageController = stageController;
    window.editorialController = editorialController;
    window.workSliderController = editorialController; // backwards compatibility

    // Fixed Navbar Management
    const siteHeader = document.getElementById('site-header');
    const navHamburger = document.getElementById('nav-hamburger');
    const mobileNavOverlay = document.getElementById('mobile-nav-overlay');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link, .mobile-nav-cta');

    // Master Scroll Performance State & Kinetic Smoothing Engine
    window._targetScrollY = window.scrollY || window.pageYOffset || 0;
    let targetScrollY = window._targetScrollY;
    let currentScrubY = targetScrollY;
    let isLerpActive = false;
    let isHeaderScrolled = false;
    let scrollIdleTimer = null;
    let lastTargetScrollY = targetScrollY;
    let currentScrollDir = 1;

    function updateNavbar(scrollY) {
        if (!siteHeader) return;
        const shouldBeScrolled = scrollY > 100;
        if (shouldBeScrolled !== isHeaderScrolled) {
            isHeaderScrolled = shouldBeScrolled;
            siteHeader.classList.toggle('scrolled', shouldBeScrolled);
        }
    }

    if (navHamburger && mobileNavOverlay) {
        const closeMobileNav = () => {
            navHamburger.classList.remove('active');
            mobileNavOverlay.classList.remove('open');
            navHamburger.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        navHamburger.addEventListener('click', () => {
            const isOpen = navHamburger.classList.toggle('active');
            mobileNavOverlay.classList.toggle('open', isOpen);
            navHamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                closeMobileNav();
            });
        });

        // Close when tapping the dark overlay background (outside the links)
        mobileNavOverlay.addEventListener('click', (e) => {
            if (e.target === mobileNavOverlay) {
                closeMobileNav();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileNavOverlay.classList.contains('open')) {
                closeMobileNav();
                navHamburger.focus();
            }
        });
    }

    // Master Scroll Handler: tracks scroll direction, signals preloader, and starts kinetic lerp loop
    function onScroll() {
        const rawY = window.scrollY || window.pageYOffset || 0;
        targetScrollY = rawY;
        window._targetScrollY = rawY;

        // Calculate scroll direction (1 = scrolling down/forward, -1 = scrolling up/backward)
        if (rawY !== lastTargetScrollY) {
            currentScrollDir = rawY > lastTargetScrollY ? 1 : -1;
            lastTargetScrollY = rawY;
        }

        // Notify stage controller that user is scrolling (pauses background image decoding)
        stageController.onUserScrollStart(currentScrollDir);

        clearTimeout(scrollIdleTimer);
        scrollIdleTimer = setTimeout(() => {
            stageController.onUserScrollIdle();
        }, 180);

        if (!isLerpActive) {
            isLerpActive = true;
            requestAnimationFrame(kineticRenderTick);
        }
    }
    window.onScroll = onScroll;

    // Master Kinetic rAF Tick: continuously interpolates scrub position at 60/120fps for buttery smoothness
    function kineticRenderTick() {
        const rawY = targetScrollY;
        const insideStage = rawY <= stageController.zoneOutroThreshold;

        if (insideStage && !prefersReducedMotion) {
            const dist = rawY - currentScrubY;
            const absDist = Math.abs(dist);

            // Adaptive Damping:
            // Slower scroll = high cinematic smoothness (0.18 on desktop, 0.22 on mobile)
            // Faster flick = tighter tracking (up to 0.38) to keep in sync with user gesture
            const baseFactor = stageController.cachedIsMobile ? 0.22 : 0.18;
            let factor = baseFactor;
            if (absDist > 200) {
                factor = Math.min(0.38, baseFactor + (absDist / 1200) * 0.16);
            }

            currentScrubY += dist * factor;

            if (absDist < 0.25) {
                currentScrubY = rawY;
            }
        } else {
            // Outside the stage or reduced motion: snap immediately for native vertical scrolling
            currentScrubY = rawY;
        }

        updateNavbar(rawY);
        stageController.renderTick(currentScrubY);
        editorialController.renderTick();

        // Continue kinetic rAF loop while still converging inside stage
        if (Math.abs(rawY - currentScrubY) > 0.25 && insideStage && !prefersReducedMotion) {
            requestAnimationFrame(kineticRenderTick);
        } else {
            currentScrubY = rawY;
            stageController.renderTick(rawY);
            isLerpActive = false;
        }
    }

    // Global Resize Handler
    function onResize() {
        stageController.resize();
        const rawY = window.scrollY || window.pageYOffset || 0;
        targetScrollY = rawY;
        currentScrubY = rawY;
        updateNavbar(rawY);
        stageController.renderTick(rawY);
        editorialController.renderTick();
    }

    // URL Query & Hash-based scroll position supporter for deep-linking
    function checkUrlScroll() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const scrollParam = urlParams.get('scroll');
            const stepParam = urlParams.get('step');

            if (scrollParam !== null || stepParam !== null) {
                const vh = window.innerHeight || 1;
                let targetY = 0;

                if (scrollParam !== null) {
                    targetY = parseInt(scrollParam);
                    if (isNaN(targetY)) targetY = 0;
                } else if (stepParam !== null) {
                    const stepScrollMap = {
                        '0': 0,
                        '1': vh * 1.30,
                        '2': vh * 2.15,
                        'dissolve': vh * 2.90,
                        '3': vh * 2.90,
                        'services': vh * 3.60,
                        '4': vh * 3.60,
                        'stats': vh * 4.40,
                        '5': vh * 4.40,
                        'clients': vh * 5.20,
                        '6': vh * 5.20
                    };
                    targetY = stepScrollMap[stepParam] !== undefined ? stepScrollMap[stepParam] : 0;
                }

                window.scrollTo(0, targetY);
                targetScrollY = targetY;
                currentScrubY = targetY;
                window._targetScrollY = targetY;
                updateNavbar(targetY);
                stageController.renderTick(targetY);
                editorialController.renderTick();
                return;
            }

            if (window.location.hash) {
                if (window.location.hash.startsWith('#scroll-')) {
                    const targetY = parseInt(window.location.hash.replace('#scroll-', ''));
                    if (!isNaN(targetY)) {
                        window.scrollTo(0, targetY);
                        targetScrollY = targetY;
                        currentScrubY = targetY;
                        onScroll();
                    }
                } else {
                    const targetEl = document.querySelector(window.location.hash);
                    if (targetEl) {
                        const nav = document.getElementById('site-header');
                        const navHeight = nav ? nav.getBoundingClientRect().height : 70;
                        const targetY = targetEl.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - navHeight;
                        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
                    }
                }
            }
        } catch (e) {
            console.error('Error applying URL scroll:', e);
        }
    }

    window.addEventListener('hashchange', checkUrlScroll);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // Initial pass
    onResize();
    onScroll();
    checkUrlScroll();
})();
