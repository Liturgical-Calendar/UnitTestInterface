/**
 * `window.LitCalConfig` is emitted by `layout/footer.php` on every page. Only the members the
 * e2e specs actually read are declared here; the object itself carries the WebSocket and API
 * connection settings too.
 */
declare global {
    interface Window {
        LitCalConfig: {
            locale: string;
            isAuthenticated: boolean;
            oidcEnabled: boolean;
            oidcOrgScoped: boolean;
        };
    }
}

export {};
