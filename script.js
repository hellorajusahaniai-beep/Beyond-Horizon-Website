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
     * Reusable ScrollSequenceController
     * Manages full-bleed canvas scrubbing, independent scroll progress, lazy preloading,
     * high-DPI scaling, crossfade transitions, and text step animations.
     * All layout positioning is 100% controlled by CSS (Zero positional inline styles).
     */
    class ScrollSequenceController {
        constructor(config) {
            this.wrapper = document.querySelector(config.wrapperSelector);
            this.canvas = document.querySelector(config.canvasSelector);
            this.textContainer = config.textContainerSelector ? document.querySelector(config.textContainerSelector) : null;
            this.loader = document.querySelector(config.loaderSelector);
            this.loaderBarFill = document.querySelector(config.loaderBarFillSelector);
            this.loaderText = document.querySelector(config.loaderTextSelector);
            this.textSteps = config.textStepSelector ? document.querySelectorAll(config.textStepSelector) : [];
            this.stepDots = config.stepDotsSelector ? document.querySelectorAll(config.stepDotsSelector) : [];
            this.scrollIndicator = config.scrollIndicatorSelector ? document.querySelector(config.scrollIndicatorSelector) : null;

            this.frameCount = config.frameCount;
            this.startFrame = config.startFrame || 1;
            this.landscapePrefix = config.landscapePrefix || 'images';
            this.portraitPrefix = config.portraitPrefix || 'images-portrait';
            this.filePrefix = config.filePrefix || 'frame_';
            this.padDigits = config.padDigits || 4;
            this.focalX = config.focalX !== undefined ? config.focalX : 0.50;
            this.focalY = config.focalY !== undefined ? config.focalY : 0.40;
            this.stepRanges = config.stepRanges || [];
            this.lazyPreload = config.lazyPreload || false;
            this.fadeExit = config.fadeExit || false;
            this.fadeEntry = config.fadeEntry || false;
            this.onStepChange = config.onStepChange || null;

            this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: true }) : null;
            this.images = new Array(this.frameCount);
            this.decodedCount = 0;
            this.lastDrawnFrame = -1;
            this.currentStep = -1;
            this.isLoaderDismissed = false;
            this.isPreloadStarted = false;
            this.isVisible = false;
            this.pendingProgress = 0;
            this.activeBase = this.getActiveBase();

            if (!this.wrapper || !this.canvas || !this.ctx) return;

            this.init();
        }

        getActiveBase() {
            const isPortrait = (window.innerWidth / window.innerHeight) < 1.0;
            return isPortrait ? this.portraitPrefix : this.landscapePrefix;
        }

        getFramePath(index1Based, format = 'webp') {
            const frameNum = this.startFrame + (index1Based - 1);
            const padded = String(frameNum).padStart(this.padDigits, '0');
            const base = this.getActiveBase();
            const folder = format === 'webp' ? `${base}-webp` : `${base}-jpg`;
            return `${folder}/${this.filePrefix}${padded}.${format}`;
        }

        init() {
            this.resize();

            if (this.lazyPreload) {
                // Preload sequence early when within 1 viewport height (before crossfade starts)
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0] && entries[0].isIntersecting) {
                        this.startPreload();
                        observer.disconnect();
                    }
                }, { rootMargin: '100% 0px' });
                observer.observe(this.wrapper);
            } else {
                this.startPreload();
            }
        }

        startPreload() {
            if (this.isPreloadStarted) return;
            this.isPreloadStarted = true;
            this.activeBase = this.getActiveBase();

            for (let i = 0; i < this.frameCount; i++) {
                const frameNumber = i + 1;
                const img = new Image();

                img.onload = () => this.onImageDecoded(i);
                img.onerror = () => {
                    // If WebP is not supported or fails, fallback to high-quality JPEG 4:4:4
                    if (img.src.endsWith('.webp')) {
                        img.src = this.getFramePath(frameNumber, 'jpg');
                    } else {
                        this.onImageDecoded(i);
                    }
                };

                img.src = this.getFramePath(frameNumber, 'webp');
                this.images[i] = img;

                if ('decode' in img) {
                    img.decode()
                        .then(() => this.onImageDecoded(i))
                        .catch(() => {
                            if (img.src.endsWith('.webp')) {
                                img.src = this.getFramePath(frameNumber, 'jpg');
                            } else {
                                this.onImageDecoded(i);
                            }
                        });
                }
            }
        }

        onImageDecoded(idx) {
            this.decodedCount++;

            const percent = Math.min(100, Math.floor((this.decodedCount / this.frameCount) * 100));

            if (this.loaderBarFill) this.loaderBarFill.style.width = `${percent}%`;
            if (this.loaderText) this.loaderText.textContent = `LOADING ${percent}%`;

            // Draw frame 0 immediately once decoded so canvas is never blank
            if (idx === 0 && this.lastDrawnFrame === -1) {
                this.drawFrame(0);
            }

            if (this.decodedCount >= 25 && !this.isLoaderDismissed) {
                this.isLoaderDismissed = true;
                if (this.loader) this.loader.classList.add('hidden');
                this.updateScroll();
            }

            if (this.decodedCount >= this.frameCount && this.loader) {
                this.loader.classList.add('hidden');
            }
        }

        drawFrame(frameIdx) {
            const img = this.images[frameIdx];
            if (!img || !img.complete || img.naturalWidth === 0) return;

            const w = this.canvas.width;
            const h = this.canvas.height;
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;

            const isPortrait = (window.innerWidth / window.innerHeight) < 1.0;
            const scale = Math.max(w / imgW, h / imgH);

            // Assert cover scale never exceeds 1.0 at runtime
            if (scale > 1.001) {
                console.warn(`[ScrollSequence] WARNING: Frame drawn upscaled! Scale: ${scale.toFixed(3)} > 1.0 (Canvas: ${w}x${h}, Frame: ${imgW}x${imgH}, Viewport: ${window.innerWidth}x${window.innerHeight})`);
            }

            const drawScale = Math.min(1.0, scale);
            const drawW = imgW * drawScale;
            const drawH = imgH * drawScale;

            let drawX = 0;
            let drawY = 0;

            if (!isPortrait) {
                drawX = (w - drawW) / 2;
                drawY = (h - drawH) / 2;
            } else {
                const idealX = (w * 0.5) - (drawW * this.focalX);
                drawX = Math.min(0, Math.max(w - drawW, idealX));

                const idealY = (h * 0.40) - (drawH * this.focalY);
                drawY = Math.min(0, Math.max(h - drawH, idealY));
            }

            this.ctx.clearRect(0, 0, w, h);
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
            this.ctx.drawImage(img, drawX, drawY, drawW, drawH);
            this.lastDrawnFrame = frameIdx;
        }

        resize() {
            const isPortrait = (window.innerWidth / window.innerHeight) < 1.0;
            const currentFolder = isPortrait ? this.portraitFolder : this.landscapeFolder;

            // If orientation flipped after initial preload, refresh frame paths
            if (this.isPreloadStarted && this.activeFolder !== currentFolder) {
                this.activeFolder = currentFolder;
                this.isPreloadStarted = false;
                this.decodedCount = 0;
                this.images = new Array(this.frameCount);
                this.startPreload();
            }

            // Scale the backing store by devicePixelRatio clamped to a maximum of 2
            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            // Set canvas backing store width and height attributes in physical device pixels
            this.canvas.width = Math.round(window.innerWidth * dpr);
            this.canvas.height = Math.round(window.innerHeight * dpr);

            // Set CSS display size separately in logical pixels
            this.canvas.style.width = `${window.innerWidth}px`;
            this.canvas.style.height = `${window.innerHeight}px`;

            // Reset image smoothing after backing store resize (browser resets context properties on resize)
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';

            // Redraw current frame immediately at new backing store size
            if (this.lastDrawnFrame !== -1) {
                this.drawFrame(this.lastDrawnFrame);
            } else if (this.images[0] && this.images[0].complete) {
                this.drawFrame(0);
            }
        }

        updateSteps(progress) {
            if (!this.textSteps.length) return;

            // Handle crossfade text opacity smoothly via CSS classes without touching positioning
            if (this.fadeExit && this.textContainer) {
                if (progress >= 0.80) {
                    const textFade = Math.max(0, 1 - (progress - 0.80) / 0.05);
                    this.textContainer.style.opacity = textFade.toFixed(3);
                } else {
                    this.textContainer.style.opacity = '';
                }
            }

            if (this.fadeEntry && this.textContainer) {
                if (progress < 0.15) {
                    this.textContainer.style.opacity = '0';
                } else {
                    const textFade = Math.min(1, (progress - 0.15) / 0.05);
                    this.textContainer.style.opacity = textFade.toFixed(3);
                }
            }

            let newStep = 0;
            if (this.stepRanges.length === 2) {
                // 3 Steps
                if (progress < this.stepRanges[0]) {
                    newStep = 0;
                } else if (progress < this.stepRanges[1]) {
                    newStep = 1;
                } else {
                    newStep = 2;
                }
            } else if (this.stepRanges.length === 1) {
                // 2 Steps
                if (progress < this.stepRanges[0]) {
                    newStep = 0;
                } else {
                    newStep = 1;
                }
            }

            if (newStep !== this.currentStep) {
                this.currentStep = newStep;

                this.textSteps.forEach((stepEl, idx) => {
                    if (idx === newStep) {
                        stepEl.classList.add('active');
                        stepEl.classList.remove('prev');
                    } else if (idx < newStep) {
                        stepEl.classList.remove('active');
                        stepEl.classList.add('prev');
                    } else {
                        stepEl.classList.remove('active');
                        stepEl.classList.remove('prev');
                    }
                });

                if (this.stepDots.length) {
                    this.stepDots.forEach((dotEl, idx) => {
                        dotEl.classList.toggle('active', idx === newStep);
                    });
                }

                if (this.scrollIndicator) {
                    this.scrollIndicator.classList.toggle('hidden', progress >= 0.80 || newStep === (this.textSteps.length - 1));
                }

                if (this.onStepChange) {
                    this.onStepChange(newStep, this.currentStep);
                }
            }
        }

        updateScroll() {
            const rect = this.wrapper.getBoundingClientRect();
            const scrollDistance = this.wrapper.offsetHeight - window.innerHeight;

            // Active when section intersects viewport
            this.isVisible = (rect.bottom > 0 && rect.top < window.innerHeight);

            let progress = 0;
            if (scrollDistance > 0) {
                progress = Math.min(Math.max(-rect.top / scrollDistance, 0), 1);
            }

            this.pendingProgress = progress;
        }

        renderTick(isReducedMotion) {
            if (!this.isVisible) return; // Pause draw loop completely when inactive

            this.updateSteps(this.pendingProgress);

            // Handle Crossfade & Scaling Transforms on Canvas elements only
            if (!isReducedMotion) {
                if (this.fadeExit) {
                    if (this.pendingProgress >= 0.85) {
                        // Last 15%: fade opacity 1 -> 0, scale 1.0 -> 1.12
                        const fadeNorm = (this.pendingProgress - 0.85) / 0.15;
                        const opacity = Math.max(0, 1 - fadeNorm);
                        const scale = 1 + (0.12 * fadeNorm);
                        this.canvas.style.opacity = opacity.toFixed(3);
                        this.canvas.style.transform = `scale(${scale.toFixed(3)})`;
                    } else {
                        this.canvas.style.opacity = '';
                        this.canvas.style.transform = '';
                    }
                }

                if (this.fadeEntry) {
                    if (this.pendingProgress <= 0.15) {
                        // First 15%: fade opacity 0 -> 1, scale 1.12 -> 1.0
                        const fadeNorm = this.pendingProgress / 0.15;
                        const opacity = Math.min(1, Math.max(0, fadeNorm));
                        const scale = 1.12 - (0.12 * fadeNorm);
                        this.canvas.style.opacity = opacity.toFixed(3);
                        this.canvas.style.transform = `scale(${scale.toFixed(3)})`;
                    } else {
                        this.canvas.style.opacity = '';
                        this.canvas.style.transform = '';
                    }
                }

                const maxFrame = this.frameCount - 1;
                const targetFrameIdx = Math.min(maxFrame, Math.max(0, Math.round(this.pendingProgress * maxFrame)));

                if (targetFrameIdx !== this.lastDrawnFrame) {
                    this.drawFrame(targetFrameIdx);
                }
            }
        }
    }

    // Initialize Sequence 1 (Hero - 140 frames: frame_001.webp to frame_140.webp)
    const heroSequence = new ScrollSequenceController({
        wrapperSelector: '#hero-scroll-wrapper',
        canvasSelector: '#scroll-canvas',
        textContainerSelector: '#hero-text-block',
        loaderSelector: '#hero-loader',
        loaderBarFillSelector: '#loader-bar-fill',
        loaderTextSelector: '#loader-text',
        textStepSelector: '#hero-scroll-wrapper .text-step',
        stepDotsSelector: '.step-dot',
        scrollIndicatorSelector: '#scroll-indicator',
        frameCount: 140,
        startFrame: 1,
        landscapeFolder: 'frames-landscape',
        portraitFolder: 'frames-portrait',
        filePrefix: 'frame_',
        focalX: 0.50,
        focalY: 0.40,
        stepRanges: [0.33, 0.67], // 3 Steps: 0.00-0.30, 0.36-0.64, 0.70-0.82
        lazyPreload: false,
        fadeExit: true // Enables 15% exit crossfade and 1 -> 1.12 scale
    });

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
                // Ease-out cubic curve
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

    // Initialize Sequence 2 (Capabilities & Proof Stats - 150 frames: frame_001.webp to frame_150.webp)
    const seq2Sequence = new ScrollSequenceController({
        wrapperSelector: '#seq2-scroll-wrapper',
        canvasSelector: '#seq2-scroll-canvas',
        textContainerSelector: '#seq2-text-container',
        loaderSelector: '#seq2-loader',
        loaderBarFillSelector: '#seq2-loader-bar-fill',
        loaderTextSelector: '#seq2-loader-text',
        textStepSelector: '#seq2-scroll-wrapper .seq2-step',
        frameCount: 150,
        startFrame: 1,
        landscapeFolder: 'frames-2-landscape',
        portraitFolder: 'frames-2-portrait',
        filePrefix: 'frame_',
        focalX: 0.50,
        focalY: 0.40,
        stepRanges: [0.34, 0.67], // 3 Steps: 0.00-0.34 (Services), 0.34-0.67 (Proof Stats), 0.67-1.00 (Business Types)
        lazyPreload: true,
        fadeEntry: true, // Enables 15% entry crossfade and 1.12 -> 1 scale
        onStepChange: (newStep, oldStep) => {
            if (newStep === 1) {
                animateSeq2Stats(true);
            } else {
                animateSeq2Stats(false);
            }
        }
    });

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
        heroSequence.updateScroll();
        seq2Sequence.updateScroll();

        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(renderTick);
        }
    }

    // Master rAF Tick
    function renderTick() {
        rafScheduled = false;
        heroSequence.renderTick(prefersReducedMotion);
        seq2Sequence.renderTick(prefersReducedMotion);
    }

    // Global Resize Handler
    function onResize() {
        heroSequence.resize();
        seq2Sequence.resize();
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
        // Fallback or reduced motion
        scrollRevealElements.forEach(el => el.classList.add('in-view'));
    }

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // Initial pass
    onScroll();
})();
