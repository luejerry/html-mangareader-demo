"use strict";
/**
 * GENERIC UTILITY FUNCTIONS
 */
function onIntersectChange(targetIntersectHandler, { threshold, rootMargin }) {
    return new IntersectionObserver((entries) => {
        entries
            .filter((entry) => entry.intersectionRatio > threshold)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
            .map((entry) => entry.target)
            .forEach((target, index) => {
            if (!index) {
                targetIntersectHandler(target);
            }
        });
    }, { threshold: [threshold], rootMargin });
}
function asyncTimeout(millis) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), millis);
    });
}
/**
 * Returns a throttled version of a given input function, which will be executed at most once
 * every `millis` milliseconds. At the end of each period, the most recent invocation will be
 * executed. Execution also happens immediately if invoked while no throttle window is in
 * progress.
 * @param {(...args: any[]) => void} func Function to be throttled
 * @param {number} millis Throttle time in milliseconds
 */
function throttle(func, millis) {
    let active;
    let lastArgs;
    let count;
    return async (...args) => {
        if (!active) {
            active = true;
            lastArgs = args;
            func(...args);
            count = 0;
            while (true) {
                await asyncTimeout(millis);
                if (count) {
                    count = 0;
                    func(...lastArgs);
                }
                else {
                    break;
                }
            }
            // eslint-disable-next-line require-atomic-updates
            active = false;
        }
        else {
            count++;
            lastArgs = args;
        }
    };
}
/**
 * Basic semver comparator. Only works with numbers, e.g. 1.2.1. Returns positive if target newer
 * than source, negative if target older than source, or zero if equal.
 * @param {string} source
 * @param {string} target
 */
function versionComparator(source, target) {
    const sourceParts = source.split('.').map((num) => parseInt(num, 10));
    const targetParts = target.split('.').map((num) => parseInt(num, 10));
    const recursor = (s, t) => {
        if (!s.length && !t.length) {
            return 0;
        }
        else if (!s.length) {
            return t[0] || 0;
        }
        else if (!t.length) {
            return -(s[0] || 0);
        }
        const diff = t[0] - s[0];
        return diff === 0 ? recursor(s.slice(1), t.slice(1)) : diff;
    };
    return recursor(sourceParts, targetParts);
}
/**
 * Creates a wrapper around `requestAnimationFrame` to enable a simpler task-based API for using
 * it.
 *
 * @see AnimationDispatcher
 */
function createAnimationDispatcher() {
    let tasks = {};
    const watchers = {};
    const loop = () => {
        for (const task of Object.values(tasks)) {
            task();
        }
        tasks = {};
        for (const watcher of Object.values(watchers)) {
            watcher();
        }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return {
        addTask: (label, task) => {
            tasks[label] = task;
        },
        setWatcher: (label, watcher) => {
            if (!watcher) {
                delete watchers[label];
            }
            else {
                watchers[label] = watcher;
            }
        },
    };
}
/// <reference path="./types.ts" />
/**
 * CONFIGURATION AND CONSTANTS
 */
const versionCheckUrl = 'https://api.github.com/repos/luejerry/html-mangareader/contents/version';
const storageKey = 'mangareader-config';
const defaultConfig = {
    smoothScroll: true,
    darkMode: false,
    seamless: false,
};
const SCREENCLAMP = {
    none: 'none',
    shrink: 'shrink',
    fit: 'fit',
};
const ORIENTATION = {
    portrait: 'portrait',
    square: 'square',
    landscape: 'landscape',
};
const smartFit = {
    size0: {
        portrait: {
            width: 720,
            height: 1024,
        },
        landscape: {
            height: 800,
        },
    },
    size1: {
        portrait: {
            width: 1080,
            height: 1440,
        },
        landscape: {
            height: 1080,
        },
    },
};
const INTERSECT_MARGIN = {
    vertical: '-45% 0px -45% 0px',
    horizontal: '0px -45% 0px -45%',
    'horizontal-rtl': '0px -45% 0px -45%',
};
/// <reference path="./types.ts" />
/// <reference path="./utils.ts" />
/// <reference path="./constants.ts" />
(function () {
    /**
     * GLOBAL VARIABLES
     */
    const pages = Array.from(document.getElementsByClassName('page'));
    const images = Array.from(document.getElementsByClassName('image'));
    const originalWidthBtn = document.getElementById('btn-original-width');
    const shrinkSizeBtn = document.getElementById('btn-shrink-size');
    const shrinkWidthBtn = document.getElementById('btn-shrink-width');
    const shrinkHeightBtn = document.getElementById('btn-shrink-height');
    const fitWidthBtn = document.getElementById('btn-fit-width');
    const fitHeightBtn = document.getElementById('btn-fit-height');
    const smartFitBtns = Array.from(document.getElementsByClassName('btn-smart-fit'));
    const directionRadioBtns = Array.from(document.getElementsByName('view-direction'));
    const smoothScrollCheckbox = document.getElementById('input-smooth-scroll');
    const darkModeCheckbox = document.getElementById('input-dark-mode');
    const seamlessCheckbox = document.getElementById('input-seamless');
    const scrubberContainerDiv = document.getElementById('scrubber-container');
    const scrubberDiv = document.getElementById('scrubber');
    const scrubberPreviewDiv = document.getElementById('scrubber-preview');
    const scrubberMarker = document.getElementById('scrubber-marker');
    const scrubberMarkerActive = document.getElementById('scrubber-marker-active');
    let scrubberImages; // Array of images, set in `setupScrubber()`
    const animationDispatcher = createAnimationDispatcher();
    let visiblePage;
    // Used by scrubber
    const scrubberState = {
        screenHeight: 0,
        previewHeight: 0,
        markerHeight: 0,
        visiblePageIndex: 0,
        viewDirection: 'vertical',
    };
    function setupIntersectionObserver(threshold, rootMargin) {
        const observer = onIntersectChange((target) => {
            visiblePage = target;
            if (target.dataset.index == null) {
                return;
            }
            scrubberState.visiblePageIndex = parseInt(target.dataset.index, 10);
            // Update the URL hash as user scrolls.
            const url = new URL(location.href);
            url.hash = target.id;
            history.replaceState(null, '', url.toString());
            setScrubberMarkerActive(scrubberState.visiblePageIndex);
        }, { threshold, rootMargin });
        for (const page of pages) {
            observer.observe(page);
        }
        return observer;
    }
    let intersectObserver = setupIntersectionObserver(0, INTERSECT_MARGIN.vertical);
    const imagesMeta = images.map((image) => {
        const ratio = image.naturalWidth / image.naturalHeight;
        return {
            image,
            orientation: ratio > 1 ? 'landscape' : 'portrait',
        };
    });
    function readConfig() {
        let config = {};
        try {
            // Unfortunately Edge does not allow localStorage access for file:// urls
            const serializedConfig = localStorage.getItem(storageKey);
            config = JSON.parse(serializedConfig || '{}');
        }
        catch (err) {
            console.error(err);
        }
        return config;
    }
    function writeConfig(config) {
        const oldConfig = readConfig();
        const newConfig = { ...oldConfig, ...config };
        try {
            localStorage.setItem(storageKey, JSON.stringify(newConfig));
        }
        catch (err) {
            console.error(err);
        }
    }
    function loadSettings() {
        const config = readConfig();
        initScalingMode(config);
        setupDirection(config);
        setupZenscroll(config);
        setupDarkMode(config);
        setupSeamless(config);
    }
    function initScalingMode(config) {
        const scaling = config.scaling || 'none';
        switch (scaling) {
            case 'none':
                return handleOriginalSize();
            case 'fit_width':
                return handleFitWidth();
            case 'fit_height':
                return handleFitHeight();
            case 'shrink':
                return handleShrinkSize();
            case 'shrink_width':
                return handleShrinkWidth();
            case 'shrink_height':
                return handleShrinkHeight();
            case 'smart_size0':
                return smartFitImages(smartFit.size0);
            case 'smart_size1':
                return smartFitImages(smartFit.size1);
        }
    }
    async function setupDirection(config) {
        var _a;
        const direction = config.direction || 'vertical';
        const directionRadioBtn = directionRadioBtns.find((button) => button.value === direction);
        if (!directionRadioBtn) {
            return;
        }
        directionRadioBtn.checked = true;
        setDirection(direction);
        // HACK: on initial page load, browser auto scrolls to the beginning of the page after some
        // unspecified delay.
        // For RTL layout, viewport must be scrolled to the end initially but must be delayed until
        // after the browser scrolls. The timing is determined experimentally
        if (direction === 'horizontal-rtl') {
            await asyncTimeout(100);
            (_a = pages[0]) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ inline: 'end' });
        }
    }
    function setupZenscroll(config) {
        window.zenscroll.setup(170);
        if (config.smoothScroll) {
            smoothScrollCheckbox.checked = true;
        }
        else {
            window.pauseZenscroll = true;
        }
    }
    function setupDarkMode(config) {
        var _a;
        darkModeCheckbox.checked = (_a = config.darkMode) !== null && _a !== void 0 ? _a : false;
        // Setting `checked` does not fire the `change` event, so we must dispatch it manually
        if (config.darkMode) {
            const change = new Event('change', { cancelable: true });
            darkModeCheckbox.dispatchEvent(change);
        }
    }
    function setupSeamless(config) {
        var _a;
        seamlessCheckbox.checked = (_a = config.seamless) !== null && _a !== void 0 ? _a : false;
        if (config.seamless) {
            const change = new Event('change', { cancelable: true });
            seamlessCheckbox.dispatchEvent(change);
        }
    }
    function getWidth() {
        return document.documentElement.clientWidth;
    }
    function getHeight() {
        return document.documentElement.clientHeight;
    }
    function handleOriginalSize() {
        setImagesWidth(SCREENCLAMP.none, getWidth());
        writeConfig({ scaling: 'none' });
    }
    function handleShrinkSize() {
        setImagesDimensions(SCREENCLAMP.shrink, getWidth(), getHeight());
        writeConfig({ scaling: 'shrink' });
    }
    function handleFitWidth() {
        setImagesWidth(SCREENCLAMP.fit, getWidth());
        writeConfig({ scaling: 'fit_width' });
    }
    function handleFitHeight() {
        setImagesHeight(SCREENCLAMP.fit, getHeight());
        writeConfig({ scaling: 'fit_height' });
    }
    function handleShrinkWidth() {
        setImagesWidth(SCREENCLAMP.shrink, getWidth());
        writeConfig({ scaling: 'shrink_width' });
    }
    function handleShrinkHeight() {
        setImagesHeight(SCREENCLAMP.shrink, getHeight());
        writeConfig({ scaling: 'shrink_height' });
    }
    function handleSmartWidth(event) {
        if (event.target instanceof HTMLElement) {
            const key = event.target.dataset.fitKey;
            if (key) {
                smartFitImages(smartFit[key]);
                writeConfig({ scaling: `smart_${key}` });
            }
        }
    }
    function setImagesWidth(fitMode, width) {
        for (const img of images) {
            switch (fitMode) {
                case SCREENCLAMP.fit:
                    Object.assign(img.style, {
                        width: `${width}px`,
                        maxWidth: null,
                        height: null,
                        maxHeight: null,
                    });
                    break;
                case SCREENCLAMP.shrink:
                    Object.assign(img.style, {
                        width: null,
                        maxWidth: `${width}px`,
                        height: null,
                        maxHeight: null,
                    });
                    break;
                default:
                    Object.assign(img.style, {
                        width: null,
                        maxWidth: null,
                        height: null,
                        maxHeight: null,
                    });
            }
        }
        visiblePage === null || visiblePage === void 0 ? void 0 : visiblePage.scrollIntoView();
    }
    function setImagesHeight(fitMode, height) {
        for (const img of images) {
            switch (fitMode) {
                case SCREENCLAMP.fit:
                    Object.assign(img.style, {
                        height: `${height}px`,
                        maxWidth: null,
                        width: null,
                        maxHeight: null,
                    });
                    break;
                case SCREENCLAMP.shrink:
                    Object.assign(img.style, {
                        width: null,
                        maxHeight: `${height}px`,
                        height: null,
                        maxWidth: null,
                    });
                    break;
                default:
                    Object.assign(img.style, {
                        width: null,
                        maxWidth: null,
                        height: null,
                        maxHeight: null,
                    });
            }
        }
        visiblePage === null || visiblePage === void 0 ? void 0 : visiblePage.scrollIntoView({ inline: 'center' });
    }
    function setImagesDimensions(fitMode, width, height) {
        for (const img of images) {
            switch (fitMode) {
                case SCREENCLAMP.fit:
                    // Not implemented
                    break;
                case SCREENCLAMP.shrink:
                    Object.assign(img.style, {
                        width: null,
                        maxHeight: `${height}px`,
                        height: null,
                        maxWidth: `${width}px`,
                    });
                    break;
                default:
                    Object.assign(img.style, {
                        width: null,
                        maxWidth: null,
                        height: null,
                        maxHeight: null,
                    });
            }
        }
        visiblePage === null || visiblePage === void 0 ? void 0 : visiblePage.scrollIntoView();
    }
    function smartFitImages(fitMode) {
        for (const { image: img, orientation: orient } of imagesMeta) {
            switch (orient) {
                case ORIENTATION.portrait:
                    Object.assign(img.style, {
                        width: null,
                        maxWidth: null,
                        height: null,
                        maxHeight: `${fitMode.portrait.height}px`,
                    });
                    break;
                case ORIENTATION.landscape:
                    Object.assign(img.style, {
                        width: null,
                        maxWidth: `${getWidth()}px`,
                        height: null,
                        maxHeight: `${fitMode.landscape.height}px`,
                    });
                    break;
            }
        }
        visiblePage === null || visiblePage === void 0 ? void 0 : visiblePage.scrollIntoView({ inline: 'center' });
    }
    function setDirection(direction) {
        scrubberState.viewDirection = direction;
        // intersection observer must be recreated to change the root margin
        intersectObserver.disconnect();
        document.body.classList.remove('vertical', 'horizontal', 'horizontal-rtl');
        document.body.classList.add(direction);
        switch (direction) {
            case 'horizontal':
            case 'horizontal-rtl':
                handleFitHeight();
            case 'vertical':
                visiblePage === null || visiblePage === void 0 ? void 0 : visiblePage.scrollIntoView({ inline: 'center' });
        }
        intersectObserver = setupIntersectionObserver(0, INTERSECT_MARGIN[direction]);
        writeConfig({
            direction: direction,
        });
    }
    function handleViewDirection(event) {
        if (!(event.target instanceof HTMLInputElement)) {
            return;
        }
        const direction = event.target.value;
        if (!direction) {
            return;
        }
        setDirection(direction);
    }
    function handleSmoothScroll(event) {
        if (!(event.target instanceof HTMLInputElement)) {
            return;
        }
        window.pauseZenscroll = !event.target.checked;
        writeConfig({
            smoothScroll: event.target.checked,
        });
    }
    function handleDarkMode(event) {
        if (!(event.target instanceof HTMLInputElement)) {
            return;
        }
        const darkModeEnabled = event.target.checked;
        if (darkModeEnabled) {
            document.body.classList.add('dark');
        }
        else {
            document.body.classList.remove('dark');
        }
        writeConfig({
            darkMode: darkModeEnabled,
        });
    }
    function handleSeamless(event) {
        if (!(event.target instanceof HTMLInputElement)) {
            return;
        }
        const seamlessEnabled = event.target.checked;
        if (seamlessEnabled) {
            document.body.classList.add('seamless');
        }
        else {
            document.body.classList.remove('seamless');
        }
        writeConfig({
            seamless: seamlessEnabled,
        });
        visiblePage === null || visiblePage === void 0 ? void 0 : visiblePage.scrollIntoView({ inline: 'center' });
    }
    function handleHorizontalScroll(event) {
        if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
            return;
        }
        switch (scrubberState.viewDirection) {
            case 'horizontal':
                event.preventDefault();
                window.scrollBy({ left: event.deltaY });
                return;
            case 'horizontal-rtl':
                event.preventDefault();
                window.scrollBy({ left: -event.deltaY });
                return;
        }
    }
    function setupListeners() {
        originalWidthBtn.addEventListener('click', handleOriginalSize);
        shrinkSizeBtn.addEventListener('click', handleShrinkSize);
        shrinkWidthBtn.addEventListener('click', handleShrinkWidth);
        shrinkHeightBtn.addEventListener('click', handleShrinkHeight);
        fitWidthBtn.addEventListener('click', handleFitWidth);
        fitHeightBtn.addEventListener('click', handleFitHeight);
        for (const button of smartFitBtns) {
            button.addEventListener('click', handleSmartWidth);
        }
        for (const button of directionRadioBtns) {
            button.addEventListener('input', handleViewDirection);
        }
        smoothScrollCheckbox.addEventListener('change', handleSmoothScroll);
        darkModeCheckbox.addEventListener('change', handleDarkMode);
        seamlessCheckbox.addEventListener('change', handleSeamless);
        document.addEventListener('wheel', handleHorizontalScroll, { passive: false });
    }
    function setupScrubberPreview() {
        const previewImages = images.map((img) => {
            const previewImage = document.createElement('img');
            previewImage.src = img.src;
            previewImage.classList.add('scrubber-preview-image');
            return previewImage;
        });
        scrubberPreviewDiv.append(...previewImages);
        return previewImages;
    }
    function computeMarkerY(cursorY) {
        return Math.max(0, Math.min(cursorY - scrubberState.markerHeight / 2, scrubberState.screenHeight - scrubberState.markerHeight));
    }
    function setScrubberMarkerActive(activeIndex) {
        const activeY = ((activeIndex + 0.5) / images.length) * scrubberState.screenHeight -
            scrubberState.markerHeight / 2;
        scrubberMarkerActive.style.transform = `translateY(${activeY}px)`;
        scrubberMarkerActive.innerText = `${activeIndex + 1}`;
    }
    function setupScrubber() {
        let prevImage;
        const setPreviewScroll = (cursorY) => {
            const cursorYRatio = cursorY / scrubberState.screenHeight;
            scrubberPreviewDiv.style.transform = `translateY(${-cursorYRatio * scrubberState.previewHeight + cursorY}px)`;
        };
        const setMarkerPosition = (cursorY) => {
            const markerYPos = computeMarkerY(cursorY);
            scrubberMarker.style.transform = `translateY(${markerYPos}px)`;
        };
        const setMarkerText = (text) => {
            scrubberMarker.innerText = text;
        };
        let scrubberActivated = false;
        scrubberDiv.addEventListener('mouseenter', () => {
            if (!scrubberActivated) {
                scrubberImages = setupScrubberPreview();
                scrubberActivated = true;
            }
            scrubberState.screenHeight = document.documentElement.clientHeight;
            // We can't style this as 100vh because it doesn't account for horizontal scrollbar
            scrubberState.previewHeight = scrubberPreviewDiv.offsetHeight;
            scrubberState.markerHeight = scrubberMarker.offsetHeight;
            setScrubberMarkerActive(scrubberState.visiblePageIndex);
            scrubberDiv.style.height = `${scrubberState.screenHeight}px`;
            scrubberContainerDiv.style.opacity = '1';
        });
        scrubberDiv.addEventListener('mouseleave', () => {
            scrubberContainerDiv.style.opacity = '0';
        });
        scrubberDiv.addEventListener('mousemove', (event) => {
            var _a;
            const cursorY = event.clientY;
            const cursorYRatio = cursorY / scrubberState.screenHeight;
            const imageIndex = Math.floor(cursorYRatio * images.length);
            const image = scrubberImages[imageIndex];
            if (!image) {
                return;
            }
            if (event.buttons & 1) {
                // Allow left click drag scrubbing
                if (imageIndex !== scrubberState.visiblePageIndex) {
                    (_a = images[imageIndex]) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ inline: 'center' });
                }
            }
            animationDispatcher.addTask('mousemove', () => {
                setMarkerPosition(cursorY);
                setMarkerText(`${imageIndex + 1}`);
                setPreviewScroll(cursorY);
                if (prevImage !== image) {
                    image.classList.add('hovered');
                    if (prevImage) {
                        prevImage.classList.remove('hovered');
                    }
                    prevImage = image;
                }
            });
        });
        scrubberDiv.addEventListener('click', (event) => {
            var _a;
            const cursorYRatio = event.clientY / scrubberState.screenHeight;
            const imageIndex = Math.floor(cursorYRatio * images.length);
            (_a = images[imageIndex]) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ inline: 'center' });
        });
    }
    async function checkVersion() {
        const response = await fetch(versionCheckUrl, { method: 'GET', mode: 'cors' }).then((r) => r.json());
        const remoteVersion = atob(response.content);
        const versionDiv = document.getElementById('version');
        const localVersion = versionDiv.innerText;
        const compare = versionComparator(localVersion, remoteVersion);
        if (compare > 0) {
            const nextVersionSpan = document.getElementById('next-version');
            const linkUpdate = document.getElementById('link-update');
            const updateToast = document.getElementById('update-toast');
            nextVersionSpan.innerText = remoteVersion;
            linkUpdate.href = 'https://github.com/luejerry/html-mangareader/releases';
            Object.assign(updateToast.style, { display: 'initial' });
            await asyncTimeout(0);
            updateToast.classList.add('show');
            await asyncTimeout(5000);
            updateToast.classList.remove('show');
        }
    }
    function main() {
        setupListeners();
        loadSettings();
        checkVersion();
        setupScrubber();
    }
    main();
})();
