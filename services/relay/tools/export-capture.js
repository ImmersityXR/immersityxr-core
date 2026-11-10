// Convert a session capture into CSV files for analysis.
//
// Usage:
//   node tools/export-capture.js <capture directory> [output directory]
//
// e.g.
//   node tools/export-capture.js captures/123/1718040000000
//   -> captures/123/1718040000000/export/*.csv
//
// For a format version 2 capture (see capture-writer.js) this writes:
//
//   positions.csv     one row per position update: head, hands and objects,
//                     with position, rotation (quaternion) and scale
//   interactions.csv  grab, drop, show, hide, lock, menu use, ...
//   drawing.csv       draw stroke segments and stroke actions
//   presence.csv      who joined and left, and when
//   <type>.csv        any other message type, payload flattened one level
//   <kind>.csv        older array-based events (update, interact, draw)
//   snapshot.json     the session state when recording started
//
// Every row has t_ms (ms since the capture started, on the relay's clock),
// seq (arrival order) and client (the sender, as the relay knew it). Rows are
// in arrival order. Torn final lines from an interrupted recording are
// skipped and counted.
//
// Captures made before format version 2 are split into one CSV per message
// `type`, as this tool did before.

/* jshint esversion: 9 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Entity_Type and INTERACTIONS in the Unity client
// (Runtime/Scripts/RuntimeSession/EntityType.cs and InteractionType.cs)
const ENTITY_TYPES = {
    '-1': 'none',
    0: 'head',
    1: 'left_hand',
    2: 'right_hand',
    3: 'object',
    4: 'physics_object',
    5: 'main_player',
    8: 'physics_end',
    10: 'line',
    11: 'line_end',
    12: 'line_delete',
    13: 'line_show',
    14: 'line_hide'
};

const INTERACTIONS = {
    0: 'look',
    1: 'look_end',
    2: 'show',
    3: 'hide',
    4: 'grab',
    5: 'drop',
    6: 'change_scene',
    7: 'slice_object',
    8: 'lock',
    9: 'unlock',
    10: 'line',
    11: 'line_end',
    12: 'show_menu',
    13: 'hide_menu',
    14: 'settings_tab',
    15: 'people_tab',
    16: 'interaction_tab',
    17: 'create_tab'
};

const COMMON = ['t_ms', 'seq', 'client'];

// Tables with known columns. `row` returns the cells after the common ones.
const TABLES = {
    positions: {
        columns: ['entity_id', 'entity_type', 'entity', 'pos_x', 'pos_y', 'pos_z',
            'rot_x', 'rot_y', 'rot_z', 'rot_w', 'scale', 'client_ts'],
        row: (m, ts) => {
            const pos = m.pos || {};
            const rot = m.rot || {};

            return [m.entityId, m.entityType, ENTITY_TYPES[m.entityType], pos.x, pos.y, pos.z,
                rot.x, rot.y, rot.z, rot.w, m.scaleFactor, ts];
        }
    },
    interactions: {
        columns: ['source_entity_id', 'target_entity_id', 'interaction_type', 'interaction', 'client_ts'],
        row: (m, ts) => [m.sourceEntity_id, m.targetEntity_id, m.interactionType, INTERACTIONS[m.interactionType], ts]
    },
    drawing: {
        columns: ['stroke_id', 'stroke_type', 'action', 'line_width', 'pos_x', 'pos_y', 'pos_z',
            'color_r', 'color_g', 'color_b', 'color_a', 'client_ts'],
        row: (m, ts) => {
            const pos = m.curStrokePos || {};
            const color = m.curColor || {};

            return [m.strokeId, m.strokeType, ENTITY_TYPES[m.strokeType], m.lineWidth, pos.x, pos.y, pos.z,
                color.x, color.y, color.z, color.w, ts];
        }
    },
    presence: {
        columns: ['event'],
        row: (kind) => [kind]
    }
};

const MESSAGE_TABLES = { sync: 'positions', interaction: 'interactions', draw: 'drawing' };

function fail (msg) {
    console.error(msg);
    process.exit(1);
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

function csvLine (cells) {
    return cells.map(csvEscape).join(',') + '\n';
}

function safeName (name) {
    return String(name).replace(/[^A-Za-z0-9_-]/g, '_') || 'untyped';
}

// Flatten an object one level: { a: 1, b: { c: 2 } } keeps b as JSON.
function flatten (prefix, value) {
    const row = {};

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach((key) => {
            row[prefix ? `${prefix}.${key}` : key] = value[key];
        });
    } else if (Array.isArray(value)) {
        value.forEach((v, i) => { row[`v${i}`] = v; });
    } else if (value !== undefined) {
        row[prefix || 'value'] = value;
    }

    return row;
}

function writeTable (outPath, columns, rows) {
    const out = [csvLine(columns)];

    rows.forEach((row) => {
        out.push(csvLine(columns.map(col => row[col])));
    });

    fs.writeFileSync(outPath, out.join(''));
}

// ---------------------------------------------------------------------------
// Format version 2
// ---------------------------------------------------------------------------

async function exportV2 (captureDir, outDir) {
    const streams = {};
    const counts = {};
    const other = new Map(); // table name -> rows of unknown shape, kept in memory
    let skipped = 0;
    let total = 0;

    const add = (table, common, cells) => {
        if (!streams[table]) {
            streams[table] = fs.createWriteStream(path.join(outDir, `${table}.csv`));
            streams[table].write(csvLine(COMMON.concat(TABLES[table].columns)));
            counts[table] = 0;
        }

        streams[table].write(csvLine(common.concat(cells)));
        counts[table] += 1;
    };

    const addOther = (table, common, payload) => {
        if (!other.has(table)) {
            other.set(table, []);
        }

        const row = { t_ms: common[0], seq: common[1], client: common[2] };

        other.get(table).push(Object.assign(row, payload));
    };

    const lines = readline.createInterface({
        input: fs.createReadStream(path.join(captureDir, 'data.ndjson')),
        crlfDelay: Infinity
    });

    for await (const line of lines) {
        if (line.length === 0) {
            continue;
        }

        let event;

        try {
            event = JSON.parse(line);
        } catch (e) {
            skipped += 1; // torn line from an interrupted recording

            continue;
        }

        total += 1;

        const common = [event.t, event.seq, event.client];
        const data = event.data;

        if (event.kind === 'snapshot') {
            fs.writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify(data, null, 2));
        } else if (event.kind === 'joined' || event.kind === 'left') {
            add('presence', common, TABLES.presence.row(event.kind));
        } else if (event.kind === 'message' && data) {
            const table = MESSAGE_TABLES[data.type];
            const payload = data.message;

            if (table && payload !== null && typeof payload === 'object') {
                add(table, common, TABLES[table].row(payload, data.ts));
            } else {
                addOther(safeName(data.type), common,
                    Object.assign(flatten('message', payload), { client_ts: data.ts }));
            }
        } else {
            // older array-based events and anything added later
            addOther(safeName(event.kind), common, flatten('data', data));
        }
    }

    await Promise.all(Object.values(streams).map(s => new Promise(res => s.end(res))));

    Object.keys(counts).forEach((table) => {
        console.log(`${path.join(outDir, table + '.csv')}: ${counts[table]} rows`);
    });

    other.forEach((rows, table) => {
        const columns = [];
        const seen = new Set();

        rows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!seen.has(key)) {
                    seen.add(key);
                    columns.push(key);
                }
            });
        });

        // don't overwrite one of the typed tables
        const name = TABLES[table] ? `${table}_other` : table;

        writeTable(path.join(outDir, `${name}.csv`), columns, rows);

        console.log(`${path.join(outDir, name + '.csv')}: ${rows.length} rows`);
    });

    return { total, skipped };
}

// ---------------------------------------------------------------------------
// Captures from before format version 2: one CSV per message `type`
// ---------------------------------------------------------------------------

function loadLegacyMessages (captureDir) {
    const ndjsonPath = path.join(captureDir, 'data.ndjson');
    const legacyPath = path.join(captureDir, 'data');

    const messages = [];
    let skipped = 0;

    if (fs.existsSync(ndjsonPath)) {
        fs.readFileSync(ndjsonPath, 'utf8').split('\n').forEach((line) => {
            if (line.length === 0) {
                return;
            }

            try {
                messages.push(JSON.parse(line));
            } catch (e) {
                skipped += 1;
            }
        });
    } else {
        try {
            const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));

            if (!Array.isArray(parsed)) {
                fail('Legacy data file did not contain a JSON array.');
            }

            parsed.forEach(m => messages.push(m));
        } catch (e) {
            fail(`Could not parse legacy data file: ${e}`);
        }
    }

    return { messages, skipped };
}

function exportLegacy (captureDir, outDir) {
    const { messages, skipped } = loadLegacyMessages(captureDir);

    const groups = new Map();

    messages.forEach((msg) => {
        const type = safeName(msg && msg.type !== undefined && msg.type !== null ? msg.type : '');

        if (!groups.has(type)) {
            groups.set(type, []);
        }

        const row = {};

        Object.keys(msg).forEach((key) => {
            if (key === 'message') {
                Object.assign(row, flatten('message', msg[key]));
            } else {
                row[key] = msg[key];
            }
        });

        groups.get(type).push(row);
    });

    groups.forEach((rows, type) => {
        const columns = [];

        rows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!columns.includes(key)) {
                    columns.push(key);
                }
            });
        });

        writeTable(path.join(outDir, `${type}.csv`), columns, rows);

        console.log(`${path.join(outDir, type + '.csv')}: ${rows.length} rows, ${columns.length} columns`);
    });

    return { total: messages.length, skipped };
}

async function main () {
    const captureDir = process.argv[2];

    if (!captureDir) {
        fail('Usage: node tools/export-capture.js <capture directory> [output directory]');
    }

    const outDir = process.argv[3] || path.join(captureDir, 'export');

    const hasNdjson = fs.existsSync(path.join(captureDir, 'data.ndjson'));

    if (!hasNdjson && !fs.existsSync(path.join(captureDir, 'data'))) {
        fail(`No data.ndjson or data file found in ${captureDir}`);
    }

    let manifest = {};

    try {
        manifest = JSON.parse(fs.readFileSync(path.join(captureDir, 'manifest.json'), 'utf8'));
    } catch (e) {
        // captures older than the manifest have none
    }

    fs.mkdirSync(outDir, { recursive: true });

    const isV2 = hasNdjson && manifest.format_version >= 2;

    const { total, skipped } = isV2
        ? await exportV2(captureDir, outDir)
        : exportLegacy(captureDir, outDir);

    if (total === 0) {
        fail('Capture contains no events.');
    }

    if (skipped > 0) {
        console.log(`Skipped ${skipped} unparseable line(s) (torn write from an interrupted recording).`);
    }

    console.log(`Exported ${total} ${isV2 ? 'events' : 'messages'} from a format version ${manifest.format_version || 1} capture.`);
}

main();
