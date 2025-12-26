// PDF.js worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables
let currentPDF = null;
let totalPages = 0;
let flipbookInitialized = false;
let currentZoom = 1.0;
let minZoom = 0.5;
let maxZoom = 3.0;
let zoomStep = 0.25;

// jQuery ready
$(document).ready(function () {
    // Show empty state initially
    showState('empty');

    // PDF selector change event
    $('#pdf-selector').on('change', function () {
        const pdfUrl = $(this).val();
        if (pdfUrl) {
            loadPDF(pdfUrl);
        } else {
            resetFlipbook();
            showState('empty');
        }
    });

    // Navigation button events
    $('#prev-btn').on('click', function () {
        if (flipbookInitialized) {
            $('#flipbook').turn('previous');
        }
    });

    $('#next-btn').on('click', function () {
        if (flipbookInitialized) {
            $('#flipbook').turn('next');
        }
    });

    // Zoom controls
    $('#zoom-in-btn').on('click', function () {
        zoomIn();
    });

    $('#zoom-out-btn').on('click', function () {
        zoomOut();
    });

    $('#zoom-fit-btn').on('click', function () {
        fitToScreen();
    });

    // Keyboard shortcuts for zoom
    $(document).on('keydown', function (e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '=':
                case '+':
                    e.preventDefault();
                    zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    zoomOut();
                    break;
                case '0':
                    e.preventDefault();
                    fitToScreen();
                    break;
            }
        }
    });
});

/**
 * Show specific state (loading, empty, error, flipbook)
 */
function showState(state) {
    // Hide all states
    $('#loading-state').removeClass('active');
    $('#empty-state').removeClass('active');
    $('#error-state').removeClass('active');
    $('#flipbook-container').removeClass('active');
    $('#controls').removeClass('active');
    $('#zoom-controls').removeClass('active');

    // Show requested state
    switch (state) {
        case 'loading':
            $('#loading-state').addClass('active');
            break;
        case 'empty':
            $('#empty-state').addClass('active');
            break;
        case 'error':
            $('#error-state').addClass('active');
            break;
        case 'flipbook':
            $('#flipbook-container').addClass('active');
            $('#controls').addClass('active');
            $('#zoom-controls').addClass('active');
            break;
    }
}

/**
 * Reset flipbook to initial state
 */
function resetFlipbook() {
    if (flipbookInitialized) {
        try {
            // Remove all event handlers from flipbook
            $('#flipbook').off('click');

            // Try to destroy Turn.js instance if it exists
            const $flipbook = $('#flipbook');
            if ($flipbook.data().turn) {
                // Check if destroy method exists
                if (typeof $flipbook.turn === 'function') {
                    try {
                        $flipbook.turn('destroy');
                    } catch (destroyError) {
                        console.warn('Turn.js destroy method failed, using alternative cleanup:', destroyError);
                        // Alternative cleanup: remove Turn.js data and unbind events
                        $flipbook.removeData('turn');
                        $flipbook.off('.turn');
                    }
                }
            }

            // Remove the namespaced resize event handler
            $(window).off('resize.flipbook');
        } catch (error) {
            console.warn('Error during flipbook cleanup:', error);
        }
        flipbookInitialized = false;
    }

    // Clear the flipbook container completely
    $('#flipbook').empty().removeAttr('style').removeClass();

    // Clear thumbnails
    $('#thumbnail-container').empty();

    // Reset zoom
    currentZoom = 1.0;
    updateZoomDisplay();

    currentPDF = null;
    totalPages = 0;
    $('#current-page').text('1');
    $('#total-pages').text('0');
}

/**
 * Load and render PDF
 */
async function loadPDF(url) {
    showState('loading');
    resetFlipbook();

    try {
        // Load PDF document
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;

        currentPDF = pdf;
        totalPages = pdf.numPages;

        // Render all pages
        await renderAllPages(pdf);

        // Generate thumbnails
        await generateThumbnails(pdf);

        // Initialize flipbook
        initializeFlipbook();

        // Show flipbook
        showState('flipbook');

    } catch (error) {
        console.error('Error loading PDF:', error);
        showState('error');
    }
}

/**
 * Render all PDF pages to canvas elements
 */
async function renderAllPages(pdf) {
    const $flipbook = $('#flipbook');

    // Calculate target dimensions for each page
    const maxWidth = Math.min(800, $(window).width() * 0.9);
    const maxHeight = Math.min(600, $(window).height() * 0.6);

    // For a flipbook, each page should be half the total width
    const pageWidth = maxWidth / 2;
    const pageHeight = maxHeight;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
            const page = await pdf.getPage(pageNum);

            // Get the page dimensions at scale 1
            const viewport = page.getViewport({ scale: 1 });

            // Calculate scale to fit the page within our target dimensions
            const scaleX = pageWidth / viewport.width;
            const scaleY = pageHeight / viewport.height;
            const scale = Math.min(scaleX, scaleY);

            // Get the properly scaled viewport
            const scaledViewport = page.getViewport({ scale: scale });

            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Render page to canvas
            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;

            // Create page div and add canvas
            const $pageDiv = $('<div></div>')
                .addClass('page')
                .attr('data-page', pageNum);

            $pageDiv.append(canvas);
            $flipbook.append($pageDiv);

        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
    }
}

/**
 * Generate thumbnails for all PDF pages
 */
async function generateThumbnails(pdf) {
    const $thumbnailContainer = $('#thumbnail-container');
    const thumbnailWidth = 80;
    const thumbnailHeight = 120;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
            const page = await pdf.getPage(pageNum);

            // Get the page dimensions at scale 1
            const viewport = page.getViewport({ scale: 1 });

            // Calculate scale to fit thumbnail dimensions
            const scaleX = thumbnailWidth / viewport.width;
            const scaleY = thumbnailHeight / viewport.height;
            const scale = Math.min(scaleX, scaleY);

            // Get the properly scaled viewport
            const scaledViewport = page.getViewport({ scale: scale });

            // Create thumbnail canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Render page to thumbnail canvas
            await page.render({
                canvasContext: context,
                viewport: scaledViewport
            }).promise;

            // Create thumbnail item
            const $thumbnailItem = $('<div></div>')
                .addClass('thumbnail-item')
                .attr('data-page', pageNum)
                .on('click', function () {
                    const targetPage = parseInt($(this).attr('data-page'));
                    if (flipbookInitialized) {
                        $('#flipbook').turn('page', targetPage);
                        updateThumbnailSelection(targetPage);
                    }
                });

            // Add page number overlay
            const $pageNumber = $('<div></div>')
                .addClass('thumbnail-page-number')
                .text(pageNum);

            $thumbnailItem.append(canvas);
            $thumbnailItem.append($pageNumber);
            $thumbnailContainer.append($thumbnailItem);

        } catch (error) {
            console.error(`Error generating thumbnail for page ${pageNum}:`, error);
        }
    }

    // Select first thumbnail
    updateThumbnailSelection(1);
}

/**
 * Update thumbnail selection
 */
function updateThumbnailSelection(pageNum) {
    $('.thumbnail-item').removeClass('active');
    $(`.thumbnail-item[data-page="${pageNum}"]`).addClass('active');

    // Scroll thumbnail into view
    const $activeThumbnail = $(`.thumbnail-item[data-page="${pageNum}"]`);
    if ($activeThumbnail.length > 0) {
        const container = $('#thumbnail-container')[0];
        const thumbnail = $activeThumbnail[0];
        const containerRect = container.getBoundingClientRect();
        const thumbnailRect = thumbnail.getBoundingClientRect();

        if (thumbnailRect.left < containerRect.left || thumbnailRect.right > containerRect.right) {
            thumbnail.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }
}

/**
 * Initialize Turn.js flipbook
 */
function initializeFlipbook() {
    const $flipbook = $('#flipbook');

    // Calculate dimensions based on viewport
    const maxWidth = Math.min(800, $(window).width() * 0.9);
    const maxHeight = Math.min(600, $(window).height() * 0.6);

    // Initialize Turn.js
    $flipbook.turn({
        width: maxWidth,
        height: maxHeight,
        autoCenter: true,
        elevation: 50,
        gradients: true,
        acceleration: true,
        duration: 1000,
        pages: totalPages,
        when: {
            turned: function (event, page) {
                updatePageInfo(page);
            }
        }
    });

    flipbookInitialized = true;

    // Add click handlers to pages for navigation
    // Remove any existing click handlers first to prevent stacking
    $flipbook.off('click', '.page').on('click', '.page', function (e) {
        const $page = $(this);
        const pageNum = parseInt($page.attr('data-page'));
        const currentPage = $flipbook.turn('page');

        // Get click position relative to the flipbook
        const flipbookOffset = $flipbook.offset();
        const clickX = e.pageX - flipbookOffset.left;
        const flipbookWidth = $flipbook.width();

        // Determine if click was on left or right side
        const isLeftSide = clickX < (flipbookWidth / 2);

        // Navigate based on which side was clicked
        if (isLeftSide && currentPage > 1) {
            $flipbook.turn('previous');
        } else if (!isLeftSide && currentPage < totalPages) {
            $flipbook.turn('next');
        }
    });

    // Update page info
    $('#total-pages').text(totalPages);
    updatePageInfo(1);

    // Initialize zoom display
    updateZoomDisplay();

    // Handle window resize with namespaced event
    $(window).off('resize.flipbook').on('resize.flipbook', debounce(function () {
        if (flipbookInitialized) {
            const newMaxWidth = Math.min(800, $(window).width() * 0.9);
            const newMaxHeight = Math.min(600, $(window).height() * 0.6);

            $('#flipbook').turn('size', newMaxWidth, newMaxHeight);
        }
    }, 250));
}

/**
 * Update page information display
 */
function updatePageInfo(page) {
    $('#current-page').text(page);

    // Update button states
    if (page === 1) {
        $('#prev-btn').prop('disabled', true);
    } else {
        $('#prev-btn').prop('disabled', false);
    }

    if (page === totalPages) {
        $('#next-btn').prop('disabled', true);
    } else {
        $('#next-btn').prop('disabled', false);
    }

    // Update thumbnail selection
    updateThumbnailSelection(page);
}

/**
 * Debounce utility function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Zoom in function
 */
function zoomIn() {
    if (currentZoom < maxZoom && flipbookInitialized) {
        currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
        applyZoom();
    }
}

/**
 * Zoom out function
 */
function zoomOut() {
    if (currentZoom > minZoom && flipbookInitialized) {
        currentZoom = Math.max(currentZoom - zoomStep, minZoom);
        applyZoom();
    }
}

/**
 * Fit to screen function
 */
function fitToScreen() {
    if (flipbookInitialized) {
        currentZoom = 1.0;
        applyZoom();
    }
}

/**
 * Apply zoom to the flipbook
 */
function applyZoom() {
    if (!flipbookInitialized) return;

    const $flipbook = $('#flipbook');
    const baseWidth = Math.min(1200, $(window).width() * 0.98);
    const baseHeight = Math.min(900, $(window).height() * 0.90);

    const newWidth = baseWidth * currentZoom;
    const newHeight = baseHeight * currentZoom;

    // Update flipbook size
    $flipbook.turn('size', newWidth, newHeight);

    // Update zoom level display
    $('#zoom-level').text(Math.round(currentZoom * 100) + '%');

    // Update zoom button states
    $('#zoom-in-btn').prop('disabled', currentZoom >= maxZoom);
    $('#zoom-out-btn').prop('disabled', currentZoom <= minZoom);

    // Center the flipbook if it's larger than the container
    const $container = $('#flipbook-container');
    if (newWidth > $container.width() || newHeight > $container.height()) {
        $container.css({
            'overflow': 'auto',
            'justify-content': 'flex-start',
            'align-items': 'flex-start',
            'padding': '20px'
        });
    } else {
        $container.css({
            'overflow': 'hidden',
            'justify-content': 'center',
            'align-items': 'center',
            'padding': '0'
        });
    }
}

/**
 * Update zoom display
 */
function updateZoomDisplay() {
    $('#zoom-level').text(Math.round(currentZoom * 100) + '%');
    $('#zoom-in-btn').prop('disabled', currentZoom >= maxZoom);
    $('#zoom-out-btn').prop('disabled', currentZoom <= minZoom);
}
