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

    // In-Browser Measurement Function for Measured Verification of EDITORIAL BREATHE System
    window.measureEditorialSystem = function() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isMob = vw < 768;
        const nav = document.getElementById('site-header');
        const navHeight = nav ? nav.getBoundingClientRect().height : 70;

        const sections = Array.from(document.querySelectorAll('.editorial-section')).map(sec => {
            const style = window.getComputedStyle(sec);
            const rect = sec.getBoundingClientRect();
            const header = sec.querySelector('.section-header');
            const tag = sec.querySelector('.section-tag');
            const title = sec.querySelector('.section-title');
            const firstContent = sec.querySelector('.work-editorial-list, .services-editorial-list, .process-steps-grid, .testimonials-list, .faq-accordion-list, .contact-editorial-grid');

            const tagRect = tag ? tag.getBoundingClientRect() : null;
            const titleRect = title ? title.getBoundingClientRect() : null;
            const contentRect = firstContent ? firstContent.getBoundingClientRect() : null;
            const titleStyle = title ? window.getComputedStyle(title) : null;
            const tagStyle = tag ? window.getComputedStyle(tag) : null;

            const tagToHeadingGap = (tagRect && titleRect) ? Math.round(titleRect.top - tagRect.bottom) : null;
            const headingToContentGap = (titleRect && contentRect) ? Math.round(contentRect.top - titleRect.bottom) : null;

            return {
                id: sec.id || sec.className,
                paddingTopPx: parseFloat(style.paddingTop),
                paddingBottomPx: parseFloat(style.paddingBottom),
                backgroundColor: style.backgroundColor,
                borderTop: style.borderTop,
                hasVisibleTopSeparator: style.borderTopWidth !== '0px' && style.borderTopStyle !== 'none',
                tag: {
                    text: tag ? tag.textContent.trim() : '',
                    fontSize: tagStyle ? tagStyle.fontSize : 'none',
                    letterSpacing: tagStyle ? tagStyle.letterSpacing : 'none',
                    color: tagStyle ? tagStyle.color : 'none'
                },
                heading: {
                    text: title ? title.textContent.trim() : '',
                    fontSizePx: titleStyle ? parseFloat(titleStyle.fontSize) : 0,
                    lineHeight: titleStyle ? titleStyle.lineHeight : 'none'
                },
                gapBetweenTagAndHeadingPx: tagToHeadingGap,
                gapBetweenHeadingAndFirstContentPx: headingToContentGap,
                heightPx: Math.round(rect.height)
            };
        });

        const containers = Array.from(document.querySelectorAll('.editorial-container')).map(con => {
            const style = window.getComputedStyle(con);
            const rect = con.getBoundingClientRect();
            return {
                maxWidth: style.maxWidth,
                computedWidth: Math.round(rect.width),
                paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight
            };
        });

        const workRows = Array.from(document.querySelectorAll('.work-editorial-row')).map((row, idx) => {
            const img = row.querySelector('.work-editorial-img');
            const headline = row.querySelector('.work-headline');
            const statNum = row.querySelector('.work-stat-number');
            const imgStyle = img ? window.getComputedStyle(img) : null;
            const imgRect = img ? img.getBoundingClientRect() : null;
            const headlineStyle = headline ? window.getComputedStyle(headline) : null;

            return {
                row: idx + 1,
                imageObjectFit: imgStyle ? imgStyle.objectFit : 'none',
                imageWidth: imgRect ? Math.round(imgRect.width) : 0,
                imageHeight: imgRect ? Math.round(imgRect.height) : 0,
                headlineFontSize: headlineStyle ? headlineStyle.fontSize : 'none',
                statNumber: statNum ? statNum.textContent.trim() : ''
            };
        });

        const serviceRows = Array.from(document.querySelectorAll('.service-editorial-row')).map((row, idx) => {
            const num = row.querySelector('.service-row-number');
            const title = row.querySelector('.service-row-title');
            const outcome = row.querySelector('.service-row-outcome');
            const numStyle = num ? window.getComputedStyle(num) : null;
            return {
                index: idx + 1,
                number: num ? num.textContent.trim() : '',
                numberFontSize: numStyle ? numStyle.fontSize : 'none',
                title: title ? title.textContent.trim() : '',
                outcome: outcome ? outcome.textContent.trim() : ''
            };
        });

        const faqItems = Array.from(document.querySelectorAll('.faq-item')).map((item, idx) => {
            const btn = item.querySelector('.faq-question-btn');
            const text = item.querySelector('.faq-question-text');
            const btnRect = btn ? btn.getBoundingClientRect() : null;
            return {
                index: idx + 1,
                question: text ? text.textContent.trim() : '',
                buttonHeightPx: btnRect ? Math.round(btnRect.height) : 0,
                isTouchTargetCompliant: btnRect ? btnRect.height >= 48 : false,
                isOpen: item.classList.contains('is-open')
            };
        });

        const formInputs = Array.from(document.querySelectorAll('.form-input, .form-textarea')).map(inp => {
            const style = window.getComputedStyle(inp);
            return {
                tag: inp.tagName.toLowerCase(),
                borderTop: style.borderTopWidth,
                borderRight: style.borderRightWidth,
                borderBottom: style.borderBottomWidth,
                borderLeft: style.borderLeftWidth,
                background: style.backgroundColor
            };
        });

        const footerWordmark = document.querySelector('.footer-huge-wordmark');
        const wordmarkStyle = footerWordmark ? window.getComputedStyle(footerWordmark) : null;

        const results = {
            viewport: { width: vw, height: vh, isMobile: isMob },
            navHeightPx: Math.round(navHeight),
            sectionsCount: sections.length,
            sections,
            containerMaxWidthExpected: '1200px',
            containerSamples: containers.slice(0, 3),
            workRows,
            serviceRows,
            faqItems,
            formInputs,
            footerWordmark: {
                text: footerWordmark ? footerWordmark.textContent.trim() : '',
                fontSize: wordmarkStyle ? wordmarkStyle.fontSize : 'none',
                opacity: wordmarkStyle ? wordmarkStyle.opacity : 'none'
            }
        };

        console.log('[MEASURE_EDITORIAL_BREATHE_SYSTEM]', JSON.stringify(results, null, 2));
        return results;
    };
    window.measureWorkSlider = window.measureEditorialSystem;

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

        drawCover(img, focalX = 0.58, focalY = 0.40) {
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
            // Total container height: 600vh. Pin travel: 500vh (600vh - 100vh)
            // Zone 1: 0 to 2.40 * vh (Sequence 1 Scrub)
            // Zone 2: 2.40 * vh to 3.40 * vh (100vh Cross-Dissolve Zone)
            // Zone 3: 3.40 * vh to 5.00 * vh (160vh Sequence 2 Scrub)
            // Zone 4: > 5.00 * vh (Unpinning into Case Studies)

            const zone1End = 2.40 * vh;
            const zone2Start = 2.40 * vh;
            const zone2End = 3.40 * vh;
            const zone2Duration = 1.00 * vh;
            const zone3Start = 3.40 * vh;
            const zone3End = 5.00 * vh;
            const zone3Duration = 1.60 * vh;

            // Performance Optimization: If stage is scrolled past viewport, skip canvas rendering
            if (scrollY > (zone3End + 0.5 * vh)) {
                return;
            }

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

                // Sequence 1 Text Exit Fade (0.88 -> 0.98)
                if (this.seq1TextBlock) {
                    if (p1 >= 0.88) {
                        const fade = Math.max(0, 1 - (p1 - 0.88) / 0.10);
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
                // ZONE 2: SINGLE-CANVAS CROSS-DISSOLVE (100vh)
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

    /**
     * EditorialBreatheController
     * Manages vertical editorial layout reveals, real-data stat animations,
     * FAQ accordion interactions, bottom-border contact form, and smooth anchor scrolling.
     */
    class EditorialBreatheController {
        constructor() {
            this.workRows = document.querySelectorAll('.work-editorial-row');
            this.faqButtons = document.querySelectorAll('.faq-question-btn');
            this.contactForm = document.getElementById('contact-form');
            this.anchorLinks = document.querySelectorAll('a[href^="#"]');
            this.statAnimMap = new Map();

            this.init();
        }

        init() {
            this.initFaqAccordion();
            this.initSmoothScroll();
            this.initWorkObserver();
            this.initContactForm();
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
                        } catch (err) {}
                    }
                });
            });
        }

        initWorkObserver() {
            if (!this.workRows.length) return;

            if ('IntersectionObserver' in window && !prefersReducedMotion) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const row = entry.target;
                            row.classList.add('is-active');
                            const rowIdx = parseInt(row.dataset.row, 10) - 1;
                            this.triggerStatAnimation(rowIdx);
                            observer.unobserve(row);
                        }
                    });
                }, { threshold: 0.20 });

                this.workRows.forEach(row => observer.observe(row));
            } else {
                this.workRows.forEach(row => row.classList.add('is-active'));
            }
        }

        triggerStatAnimation(rowIdx) {
            if (prefersReducedMotion) return;
            const row = this.workRows[rowIdx];
            if (!row) return;
            const valEl = row.querySelector('.work-stat-number');
            if (!valEl) return;

            if (rowIdx === 0) {
                // Siddhi Dental Clinic: 18 -> 64 over 1200ms
                const duration = 1200;
                const startTime = performance.now();
                const startVal = 18;
                const endVal = 64;

                const update = (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / duration);
                    const ease = 1 - Math.pow(1 - progress, 3);
                    const current = Math.round(startVal + (endVal - startVal) * ease);
                    valEl.textContent = `18 → ${current}`;

                    if (progress < 1) {
                        this.statAnimMap.set(rowIdx, requestAnimationFrame(update));
                    } else {
                        valEl.textContent = `18 → ${endVal}`;
                        this.statAnimMap.delete(rowIdx);
                    }
                };
                this.statAnimMap.set(rowIdx, requestAnimationFrame(update));
            } else if (rowIdx === 2) {
                // IT Hardware & Enterprise: ₹3.2L -> ₹11.4L over 1200ms
                const duration = 1200;
                const startTime = performance.now();
                const startVal = 3.2;
                const endVal = 11.4;

                const update = (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / duration);
                    const ease = 1 - Math.pow(1 - progress, 3);
                    const current = (startVal + (endVal - startVal) * ease).toFixed(1);
                    valEl.textContent = `₹3.2L → ₹${current}L`;

                    if (progress < 1) {
                        this.statAnimMap.set(rowIdx, requestAnimationFrame(update));
                    } else {
                        valEl.textContent = `₹3.2L → ₹${endVal.toFixed(1)}L`;
                        this.statAnimMap.delete(rowIdx);
                    }
                };
                this.statAnimMap.set(rowIdx, requestAnimationFrame(update));
            }
        }

        initContactForm() {
            if (!this.contactForm) return;
            this.contactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const submitBtn = this.contactForm.querySelector('.editorial-submit-btn');
                if (submitBtn) {
                    const originalText = submitBtn.innerHTML;
                    submitBtn.innerHTML = `MESSAGE SENT ✓`;
                    submitBtn.style.color = '#ffffff';
                    setTimeout(() => {
                        this.contactForm.reset();
                        submitBtn.innerHTML = originalText;
                    }, 4000);
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

    // Master Scroll Handler with single rAF gating
    function onScroll() {
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(renderTick);
        }
    }
    window.onScroll = onScroll;

    // Master rAF Tick
    function renderTick() {
        rafScheduled = false;
        updateNavbar();
        stageController.renderTick();
        editorialController.renderTick();
    }

    // Global Resize Handler
    function onResize() {
        stageController.resize();
        renderTick();
    }

    // Scroll-triggered Reveal Observer for Editorial Breathe sections & staggered headers
    const scrollRevealElements = document.querySelectorAll('.section-header, .reveal-on-scroll');
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
            threshold: 0.10
        });

        scrollRevealElements.forEach(el => revealObserver.observe(el));
    } else {
        scrollRevealElements.forEach(el => el.classList.add('in-view'));
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
                updateNavbar();
                stageController.renderTick();
                editorialController.renderTick();
                return;
            }

            if (window.location.hash) {
                if (window.location.hash.startsWith('#scroll-')) {
                    const targetY = parseInt(window.location.hash.replace('#scroll-', ''));
                    if (!isNaN(targetY)) {
                        window.scrollTo(0, targetY);
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
    window.addEventListener('scroll', onScroll, { passive: true });

    // Initial pass
    onScroll();
    checkUrlScroll();
})();
