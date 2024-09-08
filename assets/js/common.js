// Define the common callback function
const handleLanguageChange = (event) => {
    // Retrieve the ID of the clicked item
    const itemId = event.target.id;

    // Extract the {key} value from the ID (assuming ID format is 'langChoice-{key}')
    const key = itemId.split('langChoice-')[1];

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
