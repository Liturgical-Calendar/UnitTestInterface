import { APIRequestContext } from '@playwright/test';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

/**
 * Seeding stored runs for the replay/endpoint specs, independently of `results/` retention state.
 *
 * ## Why this exists (issue #65)
 *
 * `results.php` keeps `RETENTION_PER_TYPE = 50` runs per run type, and prunes **on every POST**:
 * it globs `{runType}-*.json`, `rsort()`s by file name — which begins with the run's timestamp, so
 * name order is timestamp order — and unlinks everything past the 50th.
 *
 * A fixture POSTed with a fixed *past* timestamp is therefore deleted by its own POST as soon as
 * 50 newer runs exist: the write succeeds, `pruneRuns()` removes the file a moment later, and the
 * endpoint still answers `{ok: true, file}`. The spec then waits for a `#pastRunsSelect` option
 * that has no file behind it and fails on a `selectOption` timeout ("did not find some options")
 * that says nothing about retention. Every full page run the suite itself drives POSTs a run, so
 * the suite walks itself into that state — which is how these specs came to pass early in a
 * session and fail later with nobody's code having changed. That cost two false diagnoses.
 *
 * ## What makes seeding independent of it
 *
 * `seedStoredRun()` writes the fixture straight into `results/` instead of POSTing it. Retention
 * runs only inside a POST, and `listRuns()` caps nothing on read, so a directory holding 50 runs
 * of that type — or 500 — changes nothing: the fixture is on disk and in the dropdown either way.
 * This is isolation from the mechanism, not a bigger margin before it bites.
 *
 * `postStoredRun()` is for `results-endpoint.spec.ts`, whose subject *is* the POST route and which
 * therefore cannot avoid triggering retention. It stamps the run with the current UTC second so
 * the run sorts above everything already stored and survives its own prune.
 *
 * Both verify the stored run over HTTP before handing it back, so a fixture that never reached the
 * server the browser talks to (a pruned file, or a `results/` directory that isn't the one the
 * frontend serves) reports itself as that, instead of as a mystery timeout later in the spec.
 */

/** A stored-run envelope as `results.php` validates it. `timestamp` is supplied by this module. */
export type SeedableRun = Record<string, unknown>;

const RESULTS_DIR = path.join(__dirname, '..', 'results');

/**
 * Monotonic seed clock, in whole UTC seconds — the resolution of a stored run's file name.
 * Two seeds within one second would otherwise collide on a single file name, the later one
 * silently overwriting the earlier.
 */
let lastSeededSecond = 0;

/** Next unique stamp as `YYYY-MM-DDTHH:MM:SSZ`, never behind the wall clock. */
const freshStamp = (): string => {
    lastSeededSecond = Math.max(Math.floor(Date.now() / 1000), lastSeededSecond + 1);
    return new Date(lastSeededSecond * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
};

/** The name `results.php` stores a run under (mirrors its own `$name` construction). */
const fileNameFor = (runType: string, timestamp: string): string => `${runType}-${timestamp.replace(/:/g, '-')}.json`;

/** File names seeded so far, awaiting `removeSeededRuns()`. */
const seededFiles: string[] = [];

/** Read the stored run back through the app, so an unreachable or pruned fixture fails loudly here. */
const verifyStored = async (request: APIRequestContext, file: string, timestamp: string): Promise<void> => {
    const check = await request.get(`results.php?file=${encodeURIComponent(file)}`);
    if (!check.ok()) {
        throw new Error(
            `Seeded run ${file} could not be read back from results.php (${check.status()}). `
            + 'Either results.php retention (RETENTION_PER_TYPE) pruned it, or the server under test is not '
            + `serving ${RESULTS_DIR}. See e2e/storedRuns.ts and issue #65.`
        );
    }
    const stored = await check.json();
    if (stored?.timestamp !== timestamp) {
        throw new Error(`Seeded run ${file} holds timestamp ${stored?.timestamp}, expected ${timestamp} — it was overwritten.`);
    }
};

/**
 * Write `run` into `results/` as a stored run and return its file name.
 *
 * Deliberately not a POST: see the header comment. Any `timestamp` on `run` is replaced with a
 * fresh unique one, and the file is registered for `removeSeededRuns()`.
 */
export const seedStoredRun = async (request: APIRequestContext, run: SeedableRun): Promise<string> => {
    const timestamp = freshStamp();
    const runType = run.runType;
    if (runType !== 'calendars' && runType !== 'resources') {
        throw new Error(`Cannot seed a run with runType ${JSON.stringify(runType)}`);
    }
    const file = fileNameFor(runType, timestamp);
    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(path.join(RESULTS_DIR, file), JSON.stringify({ ...run, timestamp }, null, 2), 'utf8');
    seededFiles.push(file);
    await verifyStored(request, file, timestamp);
    return file;
};

/**
 * Store `run` through `results.php`'s POST route and return the file name it answered with.
 *
 * For specs whose subject is the endpoint itself. The run is stamped with the current UTC second
 * so retention — which this POST triggers — cannot evict it, and is registered for cleanup.
 */
export const postStoredRun = async (request: APIRequestContext, run: SeedableRun): Promise<string> => {
    const timestamp = freshStamp();
    const save = await request.post('results.php', { data: { ...run, timestamp } });
    if (!save.ok()) {
        throw new Error(`Storing a run failed: results.php answered ${save.status()} ${await save.text()}`);
    }
    const { file } = await save.json();
    if (typeof file !== 'string') {
        throw new Error(`results.php accepted the run but named no file: ${JSON.stringify(file)}`);
    }
    seededFiles.push(file);
    await verifyStored(request, file, timestamp);
    return file;
};

/**
 * Delete every run seeded so far. Seeded runs live in the real `results/` directory, which real
 * users browse via the "Past Runs" dropdown, and they look like broken partial runs when replayed.
 */
export const removeSeededRuns = async (): Promise<void> => {
    const files = seededFiles.splice(0, seededFiles.length);
    for (const file of files) {
        await unlink(path.join(RESULTS_DIR, file)).catch(() => { /* already removed by a parallel project */ });
    }
};
