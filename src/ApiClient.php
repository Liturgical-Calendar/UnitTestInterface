<?php

namespace LiturgicalCalendar\UnitTestInterface;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\RequestException;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * HTTP client wrapper for API requests
 *
 * Provides a reusable, consistent interface for making HTTP requests
 * to the Liturgical Calendar API with proper error handling and PSR-3 logging.
 */
class ApiClient
{
    private Client $client;
    private ?string $locale;
    private LoggerInterface $logger;

    /**
     * Create a new API client instance
     *
     * @param string|null $locale Locale for Accept-Language header
     * @param int $timeout Request timeout in seconds
     * @param int $connectTimeout Connection timeout in seconds
     * @param LoggerInterface|null $logger PSR-3 logger instance
     */
    public function __construct(
        ?string $locale = null,
        int $timeout = 10,
        int $connectTimeout = 5,
        ?LoggerInterface $logger = null
    ) {
        $this->locale = $locale;
        $this->logger = $logger ?? new NullLogger();
        $this->client = new Client([
            'timeout'         => $timeout,
            'connect_timeout' => $connectTimeout,
            'http_errors'     => true,
        ]);
    }

    /**
     * Fetch JSON data from an API endpoint
     *
     * @param string $url The URL to fetch
     * @param array<string, string> $headers Additional headers to send
     * @return array<string, mixed> Decoded JSON response
     * @throws \RuntimeException If the request fails or response is invalid
     */
    public function fetchJson(string $url, array $headers = []): array
    {
        $requestHeaders = ['Accept' => 'application/json'];

        if ($this->locale !== null) {
            $requestHeaders['Accept-Language'] = $this->locale;
        }

        $requestHeaders = array_merge($requestHeaders, $headers);

        $this->logger->debug('Fetching JSON from URL', ['url' => $url, 'headers' => $requestHeaders]);

        try {
            $response = $this->client->get($url, ['headers' => $requestHeaders]);

            $body = (string) $response->getBody();

            $data = json_decode($body, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                $this->logger->error('JSON decode error', ['url' => $url, 'error' => json_last_error_msg()]);
                throw new \RuntimeException(
                    'Error decoding JSON from ' . $url . ': ' . json_last_error_msg()
                );
            }

            if (!is_array($data)) {
                $this->logger->error('Invalid JSON response', ['url' => $url, 'type' => gettype($data)]);
                throw new \RuntimeException(
                    'Invalid JSON response from ' . $url . ': expected array'
                );
            }

            $this->logger->debug('Successfully fetched JSON', ['url' => $url]);

            return $data;
        } catch (RequestException $e) {
            $statusCode = $e->hasResponse() ? $e->getResponse()->getStatusCode() : 0;

            // Build a safe, sanitized error message without leaking sensitive response data
            $safeMessage = 'HTTP request failed for ' . $url . ' (status ' . $statusCode . ')';

            if ($e->hasResponse()) {
                $responseBody = (string) $e->getResponse()->getBody();

                // Log full response body for debugging (capped at 2KB to prevent log flooding)
                $logBody = strlen($responseBody) > 2048
                    ? substr($responseBody, 0, 2048) . '... [truncated]'
                    : $responseBody;
                $this->logger->error('API request failed', [
                    'url' => $url,
                    'status' => $statusCode,
                    'response' => $logBody
                ]);

                // Create sanitized preview for exception message
                // Strip HTML tags and collapse whitespace
                $preview = strip_tags($responseBody);
                $preview = preg_replace('/\s+/', ' ', $preview);
                $preview = trim($preview ?? '');

                // Truncate to ~200 chars
                if (strlen($preview) > 200) {
                    $preview = substr($preview, 0, 197) . '...';
                }

                if ($preview !== '') {
                    $safeMessage .= ': ' . $preview;
                }
            } else {
                $this->logger->error('API request failed (no response)', [
                    'url' => $url,
                    'error' => $e->getMessage()
                ]);
                $safeMessage .= ': ' . $e->getMessage();
            }

            throw new \RuntimeException($safeMessage, $statusCode, $e);
        } catch (GuzzleException $e) {
            $this->logger->error('HTTP request failed', ['url' => $url, 'error' => $e->getMessage()]);
            throw new \RuntimeException(
                'HTTP request failed for ' . $url . ': ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    /**
     * Fetch JSON data and validate a required key exists
     *
     * @param string $url The URL to fetch
     * @param string $requiredKey The key that must exist in the response
     * @param array<string, string> $headers Additional headers to send
     * @return array<string, mixed> Decoded JSON response
     * @throws \RuntimeException If the request fails, response is invalid, or key is missing
     */
    public function fetchJsonWithKey(string $url, string $requiredKey, array $headers = []): array
    {
        $data = $this->fetchJson($url, $headers);

        if (!array_key_exists($requiredKey, $data)) {
            $this->logger->error('Missing required key in response', [
                'url' => $url,
                'requiredKey' => $requiredKey
            ]);
            throw new \RuntimeException(
                'Missing required key "' . $requiredKey . '" in response from ' . $url
            );
        }

        return $data;
    }

    /**
     * Set the locale for Accept-Language header
     *
     * @param string|null $locale The locale to use
     * @return self
     */
    public function setLocale(?string $locale): self
    {
        $this->locale = $locale;
        return $this;
    }

    /**
     * Get the underlying Guzzle client for advanced usage
     *
     * @return Client
     */
    public function getClient(): Client
    {
        return $this->client;
    }
}
