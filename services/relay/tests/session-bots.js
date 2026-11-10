// Simulated users for load-testing a relay.
//
// Puts N bots in one session. Each bot behaves like the Unity client: it
// joins, then sends head and hand position updates through the `message`
// channel. Every bot also listens, so the run measures what a real class
// would experience: whether everyone gets in, how long relayed updates take
// to arrive, and whether any are lost.
//
// Usage (from services/relay, after `npm --prefix tests install`):
//
//   node tests/session-bots.js --url https://relay.example.edu --bots 20 --seconds 60
//
// Options:
//   --url <url>          relay base URL             (default http://localhost:3000)
//   --session <id>       session to join            (default 9000)
//   --bots <n>           number of simulated users  (default 10)
//   --seconds <n>        how long to send for       (default 30)
//   --rate <hz>          updates per second for each of head, left hand and
//                        right hand                 (default 30, i.e. 90 messages/s per bot)
//   --auth <secret>      the relay's client secret, if it requires one
//   --first-client <id>  client id of the first bot (default 1000)
//   --ramp-ms <ms>       delay between bots joining (default 200)
//   --max-loss <pct>     fail the run above this percentage of lost
//                        deliveries                 (default 1)
//   --json               print the summary as JSON only
//
// Exit code 0 means every bot joined, none dropped, and loss stayed under
// --max-loss.
//
// Deliveries grow with the square of the class size: 30 bots at the default
// rate send 2,700 messages a second and receive 78,300. All bots share this
// one process, so watch "bot process lag" in the summary: when it is high,
// the bots are the bottleneck, not the relay. Lower --rate or run fewer bots
// per process.
//
// Use a session id no real class is using: bots show up as avatars.

/* jshint esversion: 8 */

const ioc = require('socket.io-client');

// The relay ignores a socket's messages for its first 2 seconds (see
// socket-repair-center.js), so bots wait this long after joining.
const SETTLE_MS = 2300;
const DRAIN_MS = 2000;

function parseArgs (argv) {
    const options = {
        url: 'http://localhost:3000',
        session: 9000,
        bots: 10,
        seconds: 30,
        rate: 30,
        auth: '',
        'first-client': 1000,
        'ramp-ms': 200,
        'max-loss': 1,
        json: false
    };

    for (let i = 0; i < argv.length; i++) {
        const name = argv[i].replace(/^--/, '');

        if (!argv[i].startsWith('--') || !(name in options)) {
            console.error(`Unknown option: ${argv[i]}`);
            process.exit(2);
        }

        if (typeof options[name] === 'boolean') {
            options[name] = true;
        } else {
            const value = argv[++i];

            if (value === undefined) {
                console.error(`Missing value for --${name}`);
                process.exit(2);
            }

            options[name] = typeof options[name] === 'number' ? Number(value) : value;

            if (Number.isNaN(options[name])) {
                console.error(`--${name} needs a number`);
                process.exit(2);
            }
        }
    }

    return options;
}

const wait = ms => new Promise(res => setTimeout(res, ms));

function percentile (sorted, p) {
    if (sorted.length === 0) {
        return null;
    }

    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

class Bot {
    constructor (options, clientId, stats) {
        this.options = options;
        this.clientId = clientId;
        this.stats = stats;
        this.joined = false;
        this.dropped = false;
        this.sent = 0;
        this.received = 0;
        this.timer = null;
    }

    join () {
        const started = Date.now();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 10000);

            this.socket = ioc(this.options.url.replace(/\/+$/, '') + '/sync', {
                query: this.options.auth ? { auth: this.options.auth } : {},
                reconnection: false,
                forceNew: true,
                timeout: 8000
            });

            const fail = (reason) => {
                this.stats.problems.push(`client ${this.clientId}: ${reason}`);

                clearTimeout(timeout);

                resolve(false);
            };

            this.socket.on('connect', () => {
                this.socket.emit('join', [this.options.session, this.clientId]);
            });

            this.socket.on('connect_error', e => fail(`could not connect (${e && e.message ? e.message : e})`));
            this.socket.on('error', e => fail(`socket error (${e})`));
            this.socket.on('failedToJoin', (session, reason) => fail(`failed to join (${reason})`));
            this.socket.on('rejectUser', reason => fail(`rejected (${reason})`));

            this.socket.on('successfullyJoined', () => {
                this.joined = true;
                this.stats.joinTimes.push(Date.now() - started);

                clearTimeout(timeout);

                resolve(true);
            });

            this.socket.on('disconnect', (reason) => {
                if (this.joined && !this.leaving) {
                    this.dropped = true;
                    this.stats.problems.push(`client ${this.clientId}: dropped mid-run (${reason})`);
                }
            });

            this.socket.on('message', (data) => {
                if (!data || data.type !== 'sync' || typeof data.ts !== 'number') {
                    return;
                }

                this.received += 1;
                this.stats.latencies.push(Date.now() - data.ts);
            });
        });
    }

    // Walk in a small circle, sending head and both hands each tick.
    startSending () {
        const base = this.clientId * 10;
        let tick = 0;

        this.timer = setInterval(() => {
            const angle = (tick++ / this.options.rate) * 0.5;
            const x = Math.cos(angle) + (this.clientId % 10);
            const z = Math.sin(angle);

            [[0, 1.6, 0], [1, 1.1, -0.3], [2, 1.1, 0.3]].forEach(([entityType, y, offset]) => {
                this.socket.emit('message', {
                    session_id: this.options.session,
                    client_id: this.clientId,
                    type: 'sync',
                    message: JSON.stringify({
                        clientId: this.clientId,
                        entityId: base + entityType,
                        entityType: entityType,
                        scaleFactor: 1,
                        rot: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) },
                        pos: { x: x + offset, y: y, z: z }
                    }),
                    ts: Date.now()
                });

                this.sent += 1;
            });
        }, 1000 / this.options.rate);
    }

    stopSending () {
        clearInterval(this.timer);
    }

    leave () {
        this.leaving = true;

        if (this.socket) {
            if (this.joined) {
                this.socket.emit('leave', [this.options.session, this.clientId]);
            }

            this.socket.close();
        }
    }
}

async function main () {
    const options = parseArgs(process.argv.slice(2));
    const log = options.json ? () => {} : console.log;
    const stats = { joinTimes: [], latencies: [], problems: [] };

    // how late this process's own timers fire: high values mean the bots,
    // not the relay, are the bottleneck
    let worstLag = 0;
    let lastBeat = Date.now();

    const heartbeat = setInterval(() => {
        const now = Date.now();

        worstLag = Math.max(worstLag, now - lastBeat - 100);
        lastBeat = now;
    }, 100);

    log(`Joining ${options.bots} bots to session ${options.session} on ${options.url} ...`);

    const bots = [];

    for (let i = 0; i < options.bots; i++) {
        const bot = new Bot(options, options['first-client'] + i, stats);

        bots.push(bot);
        bot.joining = bot.join();

        await wait(options['ramp-ms']);
    }

    await Promise.all(bots.map(bot => bot.joining));

    const joined = bots.filter(bot => bot.joined);

    log(`${joined.length} of ${options.bots} joined. Sending for ${options.seconds} s ...`);

    if (joined.length > 0) {
        await wait(SETTLE_MS);

        worstLag = 0;

        joined.forEach(bot => bot.startSending());

        await wait(options.seconds * 1000);

        joined.forEach(bot => bot.stopSending());

        await wait(DRAIN_MS);
    }

    clearInterval(heartbeat);

    const sent = joined.reduce((sum, bot) => sum + bot.sent, 0);
    const received = joined.reduce((sum, bot) => sum + bot.received, 0);
    const expected = sent * Math.max(joined.length - 1, 0);
    const lossPct = expected > 0 ? Math.max(0, (1 - received / expected) * 100) : 0;
    const dropped = bots.filter(bot => bot.dropped).length;
    const latencies = stats.latencies.sort((a, b) => a - b);

    const summary = {
        url: options.url,
        session: options.session,
        bots_requested: options.bots,
        bots_joined: joined.length,
        bots_dropped: dropped,
        seconds: options.seconds,
        messages_sent: sent,
        deliveries_expected: expected,
        deliveries_received: received,
        loss_pct: Number(lossPct.toFixed(3)),
        latency_ms: {
            p50: percentile(latencies, 50),
            p95: percentile(latencies, 95),
            p99: percentile(latencies, 99),
            max: latencies.length ? latencies[latencies.length - 1] : null
        },
        join_ms_max: stats.joinTimes.length ? Math.max(...stats.joinTimes) : null,
        bot_process_lag_ms_max: worstLag,
        problems: stats.problems
    };

    summary.passed = summary.bots_joined === options.bots && dropped === 0 && lossPct <= options['max-loss'];

    bots.forEach(bot => bot.leave());

    if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        log('');
        log(`Joined:      ${summary.bots_joined} of ${summary.bots_requested} (slowest join ${summary.join_ms_max} ms)`);
        log(`Dropped:     ${summary.bots_dropped}`);
        log(`Sent:        ${sent} messages (${Math.round(sent / Math.max(options.seconds, 1))}/s)`);
        log(`Delivered:   ${received} of ${expected} expected (${summary.loss_pct}% lost)`);
        log(latencies.length
            ? `Latency:     p50 ${summary.latency_ms.p50} ms, p95 ${summary.latency_ms.p95} ms, p99 ${summary.latency_ms.p99} ms, max ${summary.latency_ms.max} ms`
            : 'Latency:     no deliveries to measure');
        log(`Bot process lag: up to ${worstLag} ms${worstLag > 100 ? '  <- the bots were overloaded; lower --rate or --bots' : ''}`);
        stats.problems.slice(0, 20).forEach(problem => log(`Problem:     ${problem}`));
        log('');
        log(summary.passed ? 'PASS' : 'FAIL');
    }

    await wait(300); // let leave messages go out

    process.exit(summary.passed ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
