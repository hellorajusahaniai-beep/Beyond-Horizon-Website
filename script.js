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
     */
    class StageSequenceController {
        constructor() {
            this.wrapper = document.getElementById('stage-scroll-wrapper');
            this.stickyPanel = document.getElementById('stage-sticky-panel');
            this.canvas = document.getElementById('stage-canvas');
            this.gradientOverlay = document.getElementById('stage-gradient-overlay');
            this.stepCounter = document.getElementById('stage-step-counter');
            this.stepCounterText = document.getElementById('stage-counter-text');

            this.loader = document.getElementById('stage-loader');
            this.loaderBarFill = document.getElementById('loader-bar-fill');
            this.loaderText = document.getElementById('loader-text');

            // Text Blocks
            this.seq1TextBlock = document.getElementById('hero-text-block');
            this.seq1Steps = this.seq1TextBlock ? this.seq1TextBlock.querySelectorAll('.text-step') : [];
            this.stepDots = document.querySelectorAll('.step-dots .step-dot');

            this.seq2Container = document.getElementById('seq2-text-container');
            this.seq2Steps = this.seq2Container ? this.seq2Container.querySelectorAll('.seq2-step') : [];

            this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: true }) : null;

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
                portraitFrames: 95,
                startFrame: 2,
                landscapeBase: 'images-2',
                portraitBase: 'images-2-portrait',
                filePrefix: 'frame_',
                focalX: 0.50,
                focalY: 0.40,
                stepRanges: [0.34, 0.67] // Steps: 0.00-0.34 (Services), 0.34-0.67 (Stats), 0.67-1.00 (Clients)
            };

            this.seq1Frames = [];
            this.seq2Frames = [];
            this.decodedCount = 0;
            this.isLoaderDismissed = false;
            this.isPreloadStarted = false;

            this.seq1CurrentStep = -1;
            this.seq2CurrentStep = -1;
            this.activeZone = 1; // 1: Seq1, 2: Dissolve, 3: Seq2, 4: Outro

            if (!this.wrapper || !this.canvas || !this.ctx) return;

            this.init();
        }

        isPortrait() {
            return (window.innerWidth / window.innerHeight) < 1.0;
        }

        getFrameCount(cfg) {
            return this.isPortrait() ? cfg.portraitFrames : cfg.landscapeFrames;
        }

        getBase(cfg) {
            return this.isPortrait() ? cfg.portraitBase : cfg.landscapeBase;
        }

        getFramePath(cfg, index1Based, format = 'webp') {
            const frameNum = cfg.startFrame + (index1Based - 1);
            const padded = String(frameNum).padStart(4, '0');
            const base = this.getBase(cfg);
            if (this.isPortrait() && format === 'jpg') {
                return `${base}-webp/${cfg.filePrefix}${padded}.webp`;
            }
            const folder = format === 'webp' ? `${base}-webp` : `${base}-jpg`;
            return `${folder}/${cfg.filePrefix}${padded}.${format}`;
        }

        init() {
            this.resize();
            this.startPreload();
        }

        startPreload() {
            if (this.isPreloadStarted) return;
            this.isPreloadStarted = true;

            const seq1Total = this.getFrameCount(this.seq1Config);
            const seq2Total = this.getFrameCount(this.seq2Config);

            this.seq1Frames = new Array(seq1Total);
            this.seq2Frames = new Array(seq2Total);
            this.decodedCount = 0;

            // Preload initial batch of Sequence 1 to dismiss loader fast
            const initialCount = Math.min(25, seq1Total);
            for (let i = 0; i < initialCount; i++) {
                this.loadFrame(1, i);
            }

            // Stream remaining Sequence 1 and all Sequence 2
            setTimeout(() => {
                for (let i = initialCount; i < seq1Total; i++) {
                    this.loadFrame(1, i);
                }
                for (let i = 0; i < seq2Total; i++) {
                    this.loadFrame(2, i);
                }
            }, 300);
        }

        loadFrame(seqId, i) {
            const cfg = seqId === 1 ? this.seq1Config : this.seq2Config;
            const arr = seqId === 1 ? this.seq1Frames : this.seq2Frames;
            if (arr[i]) return;

            const frameNumber = i + 1;
            const img = new Image();
            arr[i] = img;

            const onDecoded = () => {
                this.decodedCount++;
                const targetInitial = 25;
                const percent = Math.min(100, Math.floor((this.decodedCount / targetInitial) * 100));

                if (this.loaderBarFill) this.loaderBarFill.style.width = `${percent}%`;
                if (this.loaderText) this.loaderText.textContent = `LOADING ${percent}%`;

                if (this.decodedCount >= targetInitial && !this.isLoaderDismissed) {
                    this.isLoaderDismissed = true;
                    if (this.loader) this.loader.classList.add('hidden');
                    this.renderTick();
                }
            };

            img.onload = onDecoded;
            img.onerror = () => {
                if (!this.isPortrait() && img.src.endsWith('.webp')) {
                    img.src = this.getFramePath(cfg, frameNumber, 'jpg');
                } else {
                    arr[i] = null;
                    onDecoded();
                }
            };

            img.src = this.getFramePath(cfg, frameNumber, 'webp');

            if ('decode' in img) {
                img.decode().then(onDecoded).catch(() => {
                    if (!this.isPortrait() && img.src.endsWith('.webp')) {
                        img.src = this.getFramePath(cfg, frameNumber, 'jpg');
                    } else {
                        arr[i] = null;
                        onDecoded();
                    }
                });
            }
        }

        resize() {
            const isPort = this.isPortrait();
            const frameW = isPort ? 3698 : 1920;
            const frameH = isPort ? 2080 : 1080;

            const systemDpr = Math.min(window.devicePixelRatio || 1, 2);
            const maxAllowedDpr = Math.min(frameW / window.innerWidth, frameH / window.innerHeight);
            const effectiveDpr = Math.min(systemDpr, maxAllowedDpr);

            this.canvas.width = Math.round(window.innerWidth * effectiveDpr);
            this.canvas.height = Math.round(window.innerHeight * effectiveDpr);

            this.canvas.style.width = `${window.innerWidth}px`;
            this.canvas.style.height = `${window.innerHeight}px`;

            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';

            this.renderTick();
        }

        drawCover(img, focalX = 0.50, focalY = 0.40) {
            if (!img || !img.complete || img.naturalWidth === 0) return;

            const w = this.canvas.width;
            const h = this.canvas.height;
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;

            const isPort = this.isPortrait();
            const scaleX = w / imgW;
            const scaleY = h / imgH;
            const drawScale = Math.max(scaleX, scaleY);

            const drawW = imgW * drawScale;
            const drawH = imgH * drawScale;

            let drawX = 0;
            let drawY = 0;

            if (!isPort) {
                drawX = (w - drawW) / 2;
                drawY = (h - drawH) / 2;
            } else {
                const idealX = (w * 0.5) - (drawW * focalX);
                drawX = Math.min(0, Math.max(w - drawW, idealX));

                const idealY = (h * 0.40) - (drawH * focalY);
                drawY = Math.min(0, Math.max(h - drawH, idealY));
            }

            this.ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }

        getFallbackFrame(arr, index, total) {
            let img = arr[index];
            if (img && img.complete && img.naturalWidth > 0) return img;

            for (let offset = 1; offset < total; offset++) {
                const prev = arr[index - offset];
                if (prev && prev.complete && prev.naturalWidth > 0) return prev;
                const next = arr[index + offset];
                if (next && next.complete && next.naturalWidth > 0) return next;
            }
            return null;
        }

        updateStepCounter(stepNum, totalSteps = 3) {
            if (!this.stepCounter || !this.stepCounterText) return;
            const formatted = `${String(stepNum).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`;
            if (this.stepCounterText.textContent !== formatted) {
                this.stepCounter.classList.add('fade-out');
                setTimeout(() => {
                    this.stepCounterText.textContent = formatted;
                    this.stepCounter.classList.remove('fade-out');
                }, 120);
            }
        }

        renderTick() {
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const vh = window.innerHeight || 1;

            const seq1Total = this.getFrameCount(this.seq1Config);
            const seq2Total = this.getFrameCount(this.seq2Config);

            // Scroll Timeline Definitions:
            // Zone 1: 0 to 2.60 * vh (Sequence 1 Scrub)
            // Zone 2: 2.60 * vh to 3.20 * vh (60vh Cross-Dissolve Zone)
            // Zone 3: 3.20 * vh to 5.60 * vh (240vh Sequence 2 Scrub)
            // Zone 4: > 5.60 * vh (Unpinning into Case Studies)

            const zone1End = 2.60 * vh;
            const zone2Start = 2.60 * vh;
            const zone2End = 3.20 * vh;
            const zone2Duration = 0.60 * vh;
            const zone3Start = 3.20 * vh;
            const zone3End = 5.60 * vh;
            const zone3Duration = 2.40 * vh;

            const w = this.canvas.width;
            const h = this.canvas.height;
            this.ctx.clearRect(0, 0, w, h);

            if (scrollY < zone1End) {
                // ==========================================
                // ZONE 1: SEQUENCE 1 SCRUB
                // ==========================================
                const p1 = Math.min(1.0, Math.max(0, scrollY / zone1End));
                const targetIdx = Math.min(seq1Total - 1, Math.max(0, Math.round(p1 * (seq1Total - 1))));

                const img = this.getFallbackFrame(this.seq1Frames, targetIdx, seq1Total);
                this.ctx.globalAlpha = 1.0;
                if (img) this.drawCover(img, this.seq1Config.focalX, this.seq1Config.focalY);

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

                // Sequence 1 Text Exit Fade (0.94 -> 1.00)
                if (this.seq1TextBlock) {
                    if (p1 >= 0.94) {
                        const fade = Math.max(0, 1 - (p1 - 0.94) / 0.06);
                        this.seq1TextBlock.style.opacity = fade.toFixed(3);
                    } else {
                        this.seq1TextBlock.style.opacity = '1';
                    }
                }

                // Hide Sequence 2 Text & reset stats
                if (this.seq2Container) this.seq2Container.style.opacity = '0';
                if (this.seq2Steps.length) {
                    this.seq2Steps.forEach(el => { el.classList.remove('active'); el.classList.remove('prev'); });
                    this.seq2CurrentStep = -1;
                }
                if (this.stepCounter) this.stepCounter.style.opacity = '1';
                if (this.gradientOverlay) this.gradientOverlay.classList.remove('seq2-mode');
                if (this.wrapper) this.wrapper.classList.remove('step-stats-active');
                animateSeq2Stats(false);

            } else if (scrollY >= zone2Start && scrollY < zone2End) {
                // ==========================================
                // ZONE 2: SINGLE-CANVAS CROSS-DISSOLVE (60vh)
                // ==========================================
                const dissolveP = Math.min(1.0, Math.max(0, (scrollY - zone2Start) / zone2Duration));

                const img1 = this.getFallbackFrame(this.seq1Frames, seq1Total - 1, seq1Total);
                const img2 = this.getFallbackFrame(this.seq2Frames, 0, seq2Total);

                // Base Layer: Sequence 1 Final Frame
                this.ctx.globalAlpha = 1.0;
                if (img1) this.drawCover(img1, this.seq1Config.focalX, this.seq1Config.focalY);

                // Dissolving Layer: Sequence 2 Initial Frame
                this.ctx.globalAlpha = dissolveP;
                if (img2) this.drawCover(img2, this.seq2Config.focalX, this.seq2Config.focalY);
                this.ctx.globalAlpha = 1.0;

                // Text Blocks: Both hidden during pure visual dissolve
                if (this.seq1TextBlock) this.seq1TextBlock.style.opacity = '0';
                if (this.seq2Container) this.seq2Container.style.opacity = '0';
                if (this.stepCounter) this.stepCounter.style.opacity = '0';

                // Overlay mode transitions seamlessly at midpoint
                if (this.gradientOverlay) {
                    this.gradientOverlay.classList.toggle('seq2-mode', dissolveP >= 0.50);
                }
                if (this.wrapper) this.wrapper.classList.remove('step-stats-active');
                animateSeq2Stats(false);

            } else {
                // ==========================================
                // ZONE 3 & 4: SEQUENCE 2 SCRUB & PIN
                // ==========================================
                const p2 = Math.min(1.0, Math.max(0, (scrollY - zone3Start) / zone3Duration));
                const targetIdx = Math.min(seq2Total - 1, Math.max(0, Math.round(p2 * (seq2Total - 1))));

                const img = this.getFallbackFrame(this.seq2Frames, targetIdx, seq2Total);
                this.ctx.globalAlpha = 1.0;
                if (img) this.drawCover(img, this.seq2Config.focalX, this.seq2Config.focalY);

                // Hide Sequence 1 Text
                if (this.seq1TextBlock) this.seq1TextBlock.style.opacity = '0';
                if (this.seq2Container) this.seq2Container.style.opacity = '1';
                if (this.stepCounter) this.stepCounter.style.opacity = '1';
                if (this.gradientOverlay) this.gradientOverlay.classList.add('seq2-mode');

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

    // Initialize the Unified Single-Canvas Stage Controller
    const stageController = new StageSequenceController();
    window.stageController = stageController;

    /**
     * CaseStudiesScrollController
     * Controls the pinned scroll-driven cinematic progression across 3 case studies:
     * - Stage 01: Siddhi Dental Clinic (Image Left / Content Right)
     * - Stage 02: Dental Reforms (Content Left / Image Right)
     * - Stage 03: Global Computer Solutions (Image Left / Content Right)
     *
     * Invariants:
     * - Physical entry/exit transforms (translateX, scale, opacity)
     * - Alternating motion vectors
     * - Minimal progress indicator update ("01 / 03")
     * - Editorial backdrop number update ("01", "02", "03")
     * - 100% reversible scroll behavior
     * - Zero impact on hero frame sequences or unrelated DOM elements
     */
    class CaseStudiesScrollController {
        constructor() {
            this.wrapper = document.getElementById('work');
            this.stages = this.wrapper ? this.wrapper.querySelectorAll('.case-study-stage') : [];
            this.progressText = this.wrapper ? this.wrapper.querySelector('.case-studies-progress-text') : null;
            this.dots = this.wrapper ? this.wrapper.querySelectorAll('.case-studies-dots .cs-dot') : [];
            this.editorialNum = this.wrapper ? this.wrapper.querySelector('.case-studies-editorial-num') : null;

            this.currentStage = -1;
            this.totalStages = 3;
            this.wrapperTop = 0;
            this.wrapperHeight = 0;

            if (!this.wrapper || !this.stages.length) return;

            this.updateMeasurements();
        }

        updateMeasurements() {
            if (!this.wrapper) return;
            const rect = this.wrapper.getBoundingClientRect();
            const scrollY = window.scrollY || window.pageYOffset || 0;
            this.wrapperTop = rect.top + scrollY;
            this.wrapperHeight = this.wrapper.offsetHeight;
        }

        renderTick() {
            if (prefersReducedMotion || !this.wrapper || !this.stages.length) return;

            const scrollY = window.scrollY || window.pageYOffset || 0;
            const vh = window.innerHeight || 1;
            const pinDistance = this.wrapperHeight - vh;

            if (pinDistance <= 0) return;

            const relativeScroll = scrollY - this.wrapperTop;
            const rawProgress = relativeScroll / pinDistance;
            const progress = Math.min(1.0, Math.max(0.0, rawProgress));

            // Stage Partitioning across progress [0.0, 1.0]:
            // Stage 1 Active: 0.00 -> 0.33
            // Stage 2 Active: 0.33 -> 0.67
            // Stage 3 Active: 0.67 -> 1.00
            let activeStage = 0;
            if (progress < 0.35) {
                activeStage = 0;
            } else if (progress < 0.68) {
                activeStage = 1;
            } else {
                activeStage = 2;
            }

            // Update Active & Exit Classes
            this.stages.forEach((stage, idx) => {
                const isActive = idx === activeStage;
                const isPast = idx < activeStage;
                stage.classList.toggle('active', isActive);
                stage.classList.toggle('exit-prev', isPast);
            });

            // Update Progress Indicator & Editorial Number
            if (this.currentStage !== activeStage) {
                this.currentStage = activeStage;
                if (this.progressText) {
                    this.progressText.textContent = `${String(activeStage + 1).padStart(2, '0')} / 03`;
                }
                this.dots.forEach((dot, idx) => {
                    dot.classList.toggle('active', idx === activeStage);
                });
                if (this.editorialNum) {
                    this.editorialNum.style.opacity = '0';
                    setTimeout(() => {
                        if (this.editorialNum) {
                            this.editorialNum.textContent = String(activeStage + 1).padStart(2, '0');
                            this.editorialNum.style.opacity = '';
                        }
                    }, 150);
                }
            }
        }
    }

    const caseStudiesController = new CaseStudiesScrollController();
    window.caseStudiesController = caseStudiesController;

    // Fixed Navbar Management
    const siteHeader = document.getElementById('site-header');
    const navHamburger = document.getElementById('nav-hamburger');
    const mobileNavOverlay = document.getElementById('mobile-nav-overlay');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link, .mobile-nav-cta');

    function updateNavbar() {
        if (!siteHeader) return;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        siteHeader.classList.toggle('scrolled', scrollY > 100);
    }

    if (navHamburger && mobileNavOverlay) {
        navHamburger.addEventListener('click', () => {
            const isOpen = navHamburger.classList.toggle('active');
            mobileNavOverlay.classList.toggle('open', isOpen);
            navHamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                navHamburger.classList.remove('active');
                mobileNavOverlay.classList.remove('open');
                navHamburger.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });
    }

    // Master Scroll Handler
    function onScroll() {
        updateNavbar();
        stageController.renderTick();
        caseStudiesController.renderTick();

        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(renderTick);
        }
    }
    window.onScroll = onScroll;

    // Master rAF Tick
    function renderTick() {
        rafScheduled = false;
        stageController.renderTick();
        caseStudiesController.renderTick();
    }

    // Global Resize Handler
    function onResize() {
        stageController.resize();
        caseStudiesController.updateMeasurements();
        caseStudiesController.renderTick();
    }

    // Scroll-triggered Reveal Observer for Case Studies & Honesty Section
    const scrollRevealElements = document.querySelectorAll('.reveal-on-scroll');
    if (scrollRevealElements.length && 'IntersectionObserver' in window && !prefersReducedMotion) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: '0px 0px -50px 0px',
            threshold: 0.12
        });

        scrollRevealElements.forEach(el => revealObserver.observe(el));
    } else {
        scrollRevealElements.forEach(el => el.classList.add('in-view'));
    }

    // URL Query & Hash-based scroll position supporter for automated testing & deep-linking
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
                        '6': vh * 5.20,
                        'case1': vh * 4.80,
                        'case2': vh * 6.00,
                        'case3': vh * 7.20
                    };
                    targetY = stepScrollMap[stepParam] !== undefined ? stepScrollMap[stepParam] : 0;
                }

                window.scrollTo(0, targetY);
                updateNavbar();
                stageController.renderTick();
                caseStudiesController.renderTick();
                return;
            }

            if (window.location.hash && window.location.hash.startsWith('#scroll-')) {
                const targetY = parseInt(window.location.hash.replace('#scroll-', ''));
                if (!isNaN(targetY)) {
                    window.scrollTo(0, targetY);
                    onScroll();
                }
            }
        } catch (e) {
            console.error('Error applying URL scroll:', e);
        }
    }

    window.addEventListener('hashchange', checkUrlScroll);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // Initial pass
    onScroll();
    checkUrlScroll();
})();
