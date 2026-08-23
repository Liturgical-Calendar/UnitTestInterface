/**
 * Common utility functions for the LiturgicalCalendar Accuracy Test Interface.
 * @module common
 */

/**
 * Escapes HTML special characters for safe use in HTML attributes.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
export const escapeHtmlAttr = (str) => {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Escapes HTML special characters and converts URLs to clickable links.
 * First escapes all HTML to prevent XSS, then safely linkifies URLs.
 * @param {string} str - The string to process.
 * @returns {string} The escaped and linkified string.
 */
export const escapeQuotesAndLinkifyUrls = (str) => {
    // First, find all URLs and their positions
    const urlRegex = /(?<prefix>["'({[])?(https?:\/\/[^\s"'<>(){}[\]]+)(?<suffix>[)"'\]}.,;:]?)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(str)) !== null) {
        // Add text before this URL (escaped)
        if (match.index > lastIndex) {
            parts.push(escapeHtmlAttr(str.slice(lastIndex, match.index)));
        }

        const prefix = match[1] || '';
        const url = match[2];
        const suffix = match[3] || '';

        // Keep prefix and suffix outside the link
        parts.push(`${escapeHtmlAttr(prefix)}<a href="${escapeHtmlAttr(url)}" target="_blank">${escapeHtmlAttr(url)}</a>${escapeHtmlAttr(suffix)}`);

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last URL (escaped)
    if (lastIndex < str.length) {
        parts.push(escapeHtmlAttr(str.slice(lastIndex)));
    }

    return parts.join('');
};

/**
 * Safely shows a Bootstrap Collapse component if the element exists.
 * @param {string} selector - The CSS selector for the element.
 */
export const safeCollapseShow = (selector) => {
    const el = document.querySelector(selector);
    if (el) {
        bootstrap.Collapse.getOrCreateInstance(el).show();
    } else {
        console.warn(`${selector} not found, skipping collapse`);
    }
};

/**
 * Safely shows a Bootstrap Toast component if the element exists.
 * @param {string} selector - The CSS selector for the element.
 */
export const safeToastShow = (selector) => {
    const el = document.querySelector(selector);
    if (el) {
        bootstrap.Toast.getOrCreateInstance(el).show();
    } else {
        console.warn(`${selector} not found, skipping toast`);
    }
};

/**
 * Hides the full-page loading overlay.
 *
 * `.page-loader` is rendered *visible* in the markup, and is normally taken down by each runner's
 * `ReadyToRunTests.tryEnableBtn()` — but only once every readiness flag is set. A page that has
 * given up on ever becoming ready therefore has to lower it explicitly, or it stays greyed out for
 * ever with nothing to say why (#63).
 *
 * Same two-step fade as those call sites, so a failure path and a success path look alike.
 *
 * @returns {void}
 */
export const hidePageLoader = () => {
    const pageLoader = document.querySelector('.page-loader');
    if (!pageLoader) {
        return;
    }
    pageLoader.style.opacity = '0';
    setTimeout(() => {
        pageLoader.style.display = 'none';
    }, 500);
};

/**
 * Fetch a JSON endpoint, rejecting on a non-ok response instead of parsing the error body as data.
 *
 * Both runners used to do this for themselves, and neither did it well. `resources.js` used a bare
 * `.then(response => response.json())`, which on a 429 parsed the problem document happily and handed
 * on an object carrying none of the properties its dispatch looks for — so the dataset went missing in
 * complete silence and the page sat under `.page-loader` for ever (#63). `index.js` logged a non-ok
 * response and resolved to `undefined`, which threw a TypeError two `.then`s later, so every HTTP
 * failure reached the outer `.catch` describing the wrong thing entirely.
 *
 * The `Content-Type` test compares the **media type only**. A server is free to send
 * `application/problem+json; charset=utf-8`, and an exact-string comparison silently fails to
 * recognise it — falling back to the bare status line and discarding the `detail` the API went to the
 * trouble of writing, in exactly the situation where that text is what a reader needs.
 *
 * @param {string} endpoint - The URL being fetched, named in the rejection so the caller knows which one failed.
 * @param {Response} response - The response to read.
 * @returns {Promise<object>}
 * @throws {Error} On a non-ok response, carrying the problem document's `detail`/`title` when there is one.
 */
export const readJsonOrThrow = async (endpoint, response) => {
    if (response.ok) {
        return response.json();
    }
    const mediaType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if ('application/problem+json' === mediaType) {
        const problem = await response.json();
        throw new Error(`${endpoint}: ${problem.detail ?? problem.title ?? response.statusText}`);
    }
    throw new Error(`${endpoint}: ${response.status} ${response.statusText}`);
};

/**
 * Fetch one JSON endpoint through {@link readJsonOrThrow}.
 *
 * `init` is **merged** with the defaults rather than replacing them, and `init.headers` is merged
 * with the default `Accept` rather than replacing it — otherwise a caller adding one unrelated header
 * would silently drop `Accept: application/json`, which is the header this whole helper exists to
 * pair with. A caller that really does want a different `Accept` still wins, because its own headers
 * are spread last.
 *
 * @param {string} endpoint - The URL to fetch.
 * @param {RequestInit} [init] - Merged over `{ method: 'GET' }`; `Accept: application/json` is sent unless the caller supplies its own.
 * @returns {Promise<object>}
 */
export const fetchJson = async (endpoint, init = {}) => {
    // Normalised through `Headers` rather than spread. `HeadersInit` has three legal shapes and
    // object spread handles only one of them: a `Headers` instance spreads to `{}`, because its
    // entries are not own enumerable properties, silently discarding every header the caller set;
    // an array of `[name, value]` tuples spreads to `{0: [...]}`, which is not a header set at all.
    // Both fail quietly, which is the worst way for a header to go missing.
    const headers = new Headers(init.headers ?? {});
    // Set only when absent, so a caller that genuinely wants a different `Accept` still wins.
    if (false === headers.has('Accept')) {
        headers.set('Accept', 'application/json');
    }
    const response = await fetch(endpoint, { method: 'GET', ...init, headers });
    return readJsonOrThrow(endpoint, response);
};

/**
 * Updates the text content of an element by ID.
 * @param {string} id - The element ID (without #).
 * @param {string|number} value - The value to set as textContent.
 */
export const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    } else {
        console.warn(`#${id} not found, skipping text update`);
    }
};

/**
 * Converts a string to a CSS/ID-safe slug.
 * Replaces spaces with hyphens, removes special characters, and lowercases.
 * @param {string} str - The string to slugify.
 * @returns {string} The slugified string.
 */
export const slugify = (str) => {
    return str
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');
};

/**
 * Slugifies class names in a CSS selector while preserving structure.
 * Transforms ".TestName.year-2024" to ".testname.year-2024".
 * @param {string} selector - The CSS selector to transform.
 * @returns {string} The selector with slugified class names.
 */
export const slugifySelector = (selector) => {
    return selector.replace(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g, (match, className) => {
        return '.' + slugify(className);
    });
};

/**
 * Handles language selection change from the dropdown.
 * Sets a cookie and reloads the page.
 * @param {Event} event - The click event.
 */
const handleLanguageChange = (event) => {
    // Retrieve the ID of the clicked item
    const itemId = event.currentTarget.id;

    // Extract the {key} value from the ID (assuming ID format is 'langChoice-{key}')
    const key = itemId.split('langChoice-')[1];
    console.log(`item clicked: ${itemId}, lang selection: ${key}`);
    // Set a cookie with the name 'currentLocale' and the extracted {key} value
    document.cookie = `currentLocale=${key}; path=/;`;

    // Reload the page
    location.reload();
};

// Initialize language dropdown handlers when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Get all elements with class 'dropdown-item' that are children of the element with ID 'langChoicesDropdownItems'
    const dropdownItems = document.querySelectorAll('#langChoicesDropdownItems .dropdown-item');

    // Loop through each element and add a click event listener with the callback function
    dropdownItems.forEach(function(item) {
        item.addEventListener('click', handleLanguageChange);
    });
});
