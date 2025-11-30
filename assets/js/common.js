/**
 * Escapes HTML special characters for safe use in HTML attributes.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
const escapeHtmlAttr = (str) => {
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
const escapeQuotesAndLinkifyUrls = (str) => {
    // First, find all URLs and their positions
    const urlRegex = /(?<prefix>["'({\[])?(https?:\/\/[^\s"'<>(){}\[\]]+)(?<suffix>[)"'\]}.,;:]?)/g;
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

        // If prefix and suffix form a known pair, keep them outside the link
        const pairs = { '"': '"', "'": "'", '(': ')', '{': '}', '[': ']' };
        if (prefix && pairs[prefix] === suffix) {
            parts.push(`${escapeHtmlAttr(prefix)}<a href="${escapeHtmlAttr(url)}" target="_blank">${escapeHtmlAttr(url)}</a>${escapeHtmlAttr(suffix)}`);
        } else {
            parts.push(`${escapeHtmlAttr(prefix)}<a href="${escapeHtmlAttr(url)}" target="_blank">${escapeHtmlAttr(url)}</a>${escapeHtmlAttr(suffix)}`);
        }

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
const safeCollapseShow = (selector) => {
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
const safeToastShow = (selector) => {
    const el = document.querySelector(selector);
    if (el) {
        bootstrap.Toast.getOrCreateInstance(el).show();
    } else {
        console.warn(`${selector} not found, skipping toast`);
    }
};

// Define the common callback function
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
}

document.addEventListener('DOMContentLoaded', function() {
    // Get all elements with class 'dropdown-item' that are children of the element with ID 'langChoicesDropdownItems'
    const dropdownItems = document.querySelectorAll('#langChoicesDropdownItems .dropdown-item');

    // Loop through each element and add a click event listener with the callback function
    dropdownItems.forEach(function(item) {
        item.addEventListener('click', handleLanguageChange);
    });
});
