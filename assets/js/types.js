/**
 * WebSocket Message Types for LiturgicalCalendar Unit Test Interface
 *
 * This module contains JSDoc typedefs for the WebSocket messages exchanged
 * between the client and the LiturgicalCalendarAPI test server.
 */

// =============================================================================
// Outgoing Messages (Client -> Server)
// =============================================================================

/**
 * Message for source data validation requests.
 * @typedef {Object} SourceDataCheckMessage
 * @property {string} validate - The validation pattern (e.g., "proprium-de-sanctis-2002", "widerregioncalendar-Europe")
 * @property {string} sourceFile - The source file identifier for display purposes
 * @property {"sourceDataCheck"} category - Must be "sourceDataCheck"
 */

/**
 * Message for calendar test requests.
 * @typedef {Object} CalendarTestMessage
 * @property {string} calendar - The calendar identifier (e.g., "VA", "USA", "DIOCESANNAME")
 * @property {"nationalcalendar"|"diocesancalendar"} category - The calendar category
 * @property {number} year - The year to test
 */

/**
 * Message for unit test execution requests.
 * @typedef {Object} UnitTestMessage
 * @property {string} testId - The unique test identifier
 * @property {Object} testData - The test data/assertions
 */

// =============================================================================
// Incoming Messages (Server -> Client)
// =============================================================================

/**
 * Standard server response message.
 * @typedef {Object} WebSocketResponse
 * @property {"success"|"error"} type - Response type
 * @property {string} text - Human-readable message
 * @property {string} [classes] - Optional CSS classes for UI styling
 */

/**
 * Source data validation result.
 * @typedef {Object} SourceDataResult
 * @property {"success"|"error"} type - Result type
 * @property {string} text - Validation message
 * @property {string} sourceFile - The source file that was validated
 * @property {string} [classes] - Optional CSS classes
 */

/**
 * Calendar test result.
 * @typedef {Object} CalendarTestResult
 * @property {"success"|"error"} type - Result type
 * @property {string} text - Test result message
 * @property {string} calendar - The calendar that was tested
 * @property {number} year - The year that was tested
 * @property {string} [classes] - Optional CSS classes
 */

// =============================================================================
// API Data Types
// =============================================================================

/**
 * Roman Missal definition from the /missals API endpoint.
 * @typedef {Object} RomanMissalDefinition
 * @property {string} missal_id - The missal identifier (e.g., "EDITIO_TYPICA_1970", "IT_1983")
 * @property {string} name - Human-readable name of the missal
 * @property {string} region - Region code (e.g., "VA", "IT", "USA")
 * @property {number} year - Publication year
 * @property {string} api_path - API URL path (for API requests, NOT for source validation)
 */

/**
 * National calendar metadata from the /calendars API endpoint.
 * @typedef {Object} NationalCalendarMetadata
 * @property {string} calendar_id - The calendar identifier
 * @property {string} nation - Nation code (e.g., "IT", "USA")
 * @property {string[]} locales - Supported locales
 * @property {string[]} missals - Array of missal IDs used by this calendar
 * @property {string} [wider_region] - Optional wider region this calendar belongs to
 */

/**
 * Diocesan calendar metadata.
 * @typedef {Object} DiocesanCalendarMetadata
 * @property {string} calendar_id - The calendar identifier
 * @property {string} diocese - Diocese name
 * @property {string} nation - Parent nation code
 * @property {string[]} locales - Supported locales
 */

/**
 * Wider region calendar metadata.
 * @typedef {Object} WiderRegionMetadata
 * @property {string} region - Region name (e.g., "Europe", "Americas")
 * @property {string[]} nations - Nations belonging to this region
 */

// =============================================================================
// Test Data Types
// =============================================================================

/**
 * A single test assertion.
 * @typedef {Object} TestAssertion
 * @property {number} year - The year for this assertion
 * @property {string|null} expected_value - Expected date value (ISO format) or null
 * @property {string} assert - The assertion type (e.g., "eventExists AND hasExpectedDate")
 * @property {string} assertion - Human-readable assertion description
 * @property {string} [comment] - Optional comment explaining the assertion
 */

/**
 * A complete unit test definition.
 * @typedef {Object} UnitTestDefinition
 * @property {string} event_key - The liturgical event key being tested
 * @property {string} description - Human-readable test description
 * @property {string} test_type - Test type (e.g., "exactCorrespondence", "exactCorrespondenceSince")
 * @property {number} [year_since] - For exactCorrespondenceSince tests, the starting year
 * @property {TestAssertion[]} assertions - Array of test assertions
 */

// =============================================================================
// Liturgical Event Types
// =============================================================================

/**
 * A liturgical event from the events catalog.
 * @typedef {Object} LiturgicalEvent
 * @property {string} event_key - Unique event identifier
 * @property {string} name - Event name
 * @property {number} grade - Liturgical grade (0-7, see LitGrade)
 * @property {number} [month] - Fixed month (1-12) if applicable
 * @property {number} [day] - Fixed day (1-31) if applicable
 * @property {string} [color] - Liturgical color
 */

// Export empty object to make this a valid ES6 module
// The typedefs are available via JSDoc imports: @typedef {import('./types.js').TypeName}
export {};
