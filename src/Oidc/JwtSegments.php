<?php

declare(strict_types=1);

namespace LiturgicalCalendar\UnitTestInterface\Oidc;

/**
 * Reading a JWT's segments without verifying it.
 *
 * Both callers use this to decide what to do WITH a token, never to trust its contents: `Client` asks
 * whether an ID token names this client before handing it back to the issuer, and `TokenValidator` reads
 * the header's `kid` to decide whether a key set is stale. Verification proper happens elsewhere — in
 * `TokenValidator::validate()` here, or at the provider.
 *
 * It exists as a shared helper because the decoding has a trap in it that is easy to get wrong twice:
 *
 *   - `base64_decode($s, false)` — non-strict — NEVER returns false. It silently drops characters outside
 *     the alphabet, so `eyJhenAiOiJ4In0!` decodes cleanly to `{"azp":"x"}`. A `false ===` check against it
 *     is dead code, which is worse than no check because it reads like one.
 *   - `base64_decode($s, true)` — strict — rejects `!` and `@`, but still tolerates whitespace.
 *
 * So the alphabet is checked explicitly first, and only then is the value decoded strictly.
 *
 * Named `JwtSegments` rather than `Jwt` deliberately: PHP resolves class names case-insensitively, so a
 * class called `Jwt` is indistinguishable from `Firebase\JWT\JWT` in any file that imports it —
 * `TokenValidator` does — and an unqualified call silently binds to the wrong class. That produced a fatal
 * on every authenticated page render, caught only because an end-to-end test exercised the authenticated
 * path rather than the class in isolation.
 */
final class JwtSegments
{
    private const SEGMENT_HEADER  = 0;
    private const SEGMENT_PAYLOAD = 1;

    /**
     * @return array<string, mixed>|null
     */
    public static function header(string $token): ?array
    {
        return self::segment($token, self::SEGMENT_HEADER);
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function payload(string $token): ?array
    {
        return self::segment($token, self::SEGMENT_PAYLOAD);
    }

    /**
     * @return array<string, mixed>|null Decoded claims, or null if the segment is not well-formed.
     */
    private static function segment(string $token, int $index): ?array
    {
        $segments = explode('.', $token);
        if (3 !== count($segments)) {
            return null;
        }

        $raw = $segments[$index];

        // base64url alphabet only, and non-empty. See the class docblock for why this cannot be left to
        // base64_decode()'s own checking.
        if (1 !== preg_match('/^[A-Za-z0-9_-]+$/', $raw)) {
            return null;
        }

        $decoded = base64_decode(strtr($raw, '-_', '+/'), true);
        if (false === $decoded || '' === $decoded) {
            return null;
        }

        /** @var array<string, mixed>|null $claims */
        $claims = json_decode($decoded, true);
        return is_array($claims) ? $claims : null;
    }
}
