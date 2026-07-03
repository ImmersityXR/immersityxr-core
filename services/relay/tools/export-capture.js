// Convert a session capture into per-message-type CSV files for analysis.
//
// Usage:
//   node tools/export-capture.js <capture directory> [output directory]
//
// e.g.
//   node tools/export-capture.js captures/123/1718040000000
//   -> captures/123/1718040000000/export/<type>.csv
//
// Reads both capture formats:
//   - data.ndjson  (current: one JSON message per line; torn final lines
//                   from an interrupted recording are skipped with a count)
//   - data         (legacy: a single JSON array written at record-stop)
//
// Messages are grouped by their `type` field (messages without one go to
// "untyped.csv"). Columns are the union of top-level keys across the group;
// the nested `message` payload is flattened one level (message.foo columns).

/* jshint esversion: 8 */

const fs = require('fs');
const path = require('path');

function fail (msg) {
    console.error(msg);
    process.exit(1);
}

function loadMessages (captureDir) {
    const ndjsonPath = path.join(captureDir, 'data.ndjson');
    const legacyPath = path.join(captureDir, 'data');

    const messages = [];
    let skipped = 0;

    if (fs.existsSync(ndjsonPath)) {
        const lines = fs.readFileSync(ndjsonPath, 'utf8').split('\n');

        lines.forEach((line) => {
            if (line.length === 0) {
                return;
            }

            try {
                messages.push(JSON.parse(line));
            } catch (e) {
                skipped += 1; // torn line from an interrupted recording
            }
        });
    } else if (fs.existsSync(legacyPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));

            if (Array.isArray(parsed)) {
                parsed.forEach(m => messages.push(m));
            } else {
                fail('Legacy data file did not contain a JSON array.');
            }
        } catch (e) {
            fail(`Could not parse legacy data file: ${e}`);
        }
    } else {
        fail(`No data.ndjson or data file found in ${captureDir}`);
    }

    return { messages, skipped };
}

// Flatten the nested `message` payload one level: { message: { a: 1 } }
// becomes column "message.a". Everything else stays top-level.
function flatten (msg) {
    const row = {};

    Object.keys(msg).forEach((key) => {
        const value = msg[key];

        if (key === 'message' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.keys(value).forEach((innerKey) => {
                row[`message.${innerKey}`] = value[innerKey];
            });
        } else {
            row[key] = value;
        }
    });

    return row;
}

function csvEscape (value) {
    if (value === null || value === undefined) {
        return '';
    }

    let str = typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (/[",\n]/.test(str)) {
        str = '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
}

function main () {
    const captureDir = process.argv[2];

    if (!captureDir) {
        fail('Usage: node tools/export-capture.js <capture directory> [output directory]');
    }

    const outDir = process.argv[3] || path.join(captureDir, 'export');

    const { messages, skipped } = loadMessages(captureDir);

    if (messages.length === 0) {
        fail('Capture contains no messages.');
    }

    // group by message type
    const groups = new Map();

    messages.forEach((msg) => {
        const type = (msg && msg.type !== undefined && msg.type !== null && String(msg.type).length > 0)
            ? String(msg.type).replace(/[^A-Za-z0-9_-]/g, '_')
            : 'untyped';

        if (!groups.has(type)) {
            groups.set(type, []);
        }

        groups.get(type).push(flatten(msg));
    });

    fs.mkdirSync(outDir, { recursive: true });

    groups.forEach((rows, type) => {
        // union of keys across the group, in first-seen order
        const columns = [];

        rows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!columns.includes(key)) {
                    columns.push(key);
                }
            });
        });

        const out = [columns.join(',')];

        rows.forEach((row) => {
            out.push(columns.map(col => csvEscape(row[col])).join(','));
        });

        const outPath = path.join(outDir, `${type}.csv`);

        fs.writeFileSync(outPath, out.join('\n') + '\n');

        console.log(`${outPath}: ${rows.length} rows, ${columns.length} columns`);
    });

    if (skipped > 0) {
        console.log(`Skipped ${skipped} unparseable line(s) (torn write from an interrupted recording).`);
    }

    console.log(`Exported ${messages.length} messages in ${groups.size} type group(s).`);
}

main();
