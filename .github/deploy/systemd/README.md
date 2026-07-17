# php-fpm reload watcher (root-side, shared with the frontend)

The GitHub Actions deploy (`.github/workflows/deploy.yaml`) runs as a chrooted SSH user that cannot reload
php-fpm. After rsync it drops `tmp/restart.txt` in the docroot and waits (up to ~60s, fatal on timeout) for a
root-side watcher to reload php-fpm and consume the sentinel — the file disappearing is the deploy's proof the
reload actually ran. Without the reload, freshly deployed `.mo` translation catalogs only take effect when
php-fpm naturally recycles its workers (php-fpm caches each `.mo` in the worker for its whole lifetime).

## Actual setup on the VPS

This vhost does **not** have its own unit pair. It shares the frontend's watcher:

- `/etc/systemd/system/litcal-fpm-reload.path` — carries one `PathExists=` line per watched sentinel,
  including this vhost's `<vhost-root>/tmp/restart.txt` (the real, non-chroot path under
  `/var/www/vhosts/...` — the deploy user is chrooted, so the `VPS_APP_PATH` seen in CI is jail-relative).
- `/etc/systemd/system/litcal-fpm-reload.service` → runs `/usr/local/sbin/litcal-fpm-reload.sh`, which
  gracefully reloads php-fpm and removes the sentinel(s) it handled.

When onboarding another vhost to this mechanism: add its sentinel path as an additional `PathExists=` line in
the `.path` unit, teach `litcal-fpm-reload.sh` to remove that sentinel after a successful reload, then run
`systemctl daemon-reload && systemctl restart litcal-fpm-reload.path` (required for edited `PathExists=` lines
to take effect).

## Verifying (as root)

```bash
touch <vhost-root>/tmp/restart.txt
sleep 5
ls <vhost-root>/tmp/restart.txt 2>&1     # expected: No such file or directory
journalctl -u litcal-fpm-reload.service -n 5
```

The deploy workflow itself is the end-to-end test: a run only passes the "Signal php-fpm reload" step if the
watcher consumed the sentinel.
