'use strict';

const args = require('yargs').argv;

const fs = require('fs');
const readline = require('readline');

const filePath = args.path || '/tmp/access.log';
const time = args.time || 10000;

const seconds = time / 1000;
let currentPosition = 0;

try {
    if (fs.existsSync(filePath)) {
        fs.stat(filePath, {}, function (err, stats) {
            if (err) throw err;
            currentPosition = stats.size;
            console.log(`Waiting ${seconds} seconds before starting`);
            setTimeout(processLogs, time);
        })
    } else {
        console.warn(`There is no file existing at provided path ${filePath}`);
    }
} catch (err) {
    console.warn(err);
}

// open file
// set position to last line
// read file during 10 seconds
// after these 10 seconds, close file
// and do it again
function processLogs() {
    const start = new Date();
    const end = new Date(start.getTime() + time);
    let logs = {};
    let visitorsIP = [];
    const stream = fs.createReadStream(filePath, {
        encoding: 'utf-8',
        flags: 'r',
        start: currentPosition
    });
    stream.on('data', function (chunk) {
        currentPosition += chunk.length;
        const lines = chunk.toString().split("\n");

        if (lines) {
            lines.forEach(function (line) {
                if (line !== '') {
                    const result = line.match(/^(\S+) (\S+) (\S+) \[([\w:/]+\s[+\-]\d{4})\] "(\S+)\s?(\S+)?\s?(\S+)?" (\d{3}|-) (\d+|-)\s?"?([^"]*)"?\s?"?([^"]*)?"?$/);
                    if (result) {
                        let ip = result[1];

                        if (visitorsIP.indexOf(ip) === -1) {
                            visitorsIP.push(ip);
                        }

                        let urlParts = result[6].split('/');
                        const section = urlParts[1];
                        const code = result[8];

                        // check if section has already been created
                        if (typeof logs[section] === 'undefined') {
                            logs[section] = {
                                visits: 0
                            };
                        }

                        logs[section].visits += 1;

                        if (typeof logs[section].codes === 'undefined') {
                            logs[section].codes = {};
                        }

                        if (typeof logs[section].codes[code] === 'undefined') {
                            logs[section].codes[code] = 0;
                        }

                        logs[section].codes[code] += 1;
                    } else {
                        console.warn('Skipping wrongly formatted line: ', line);
                    }
                }
            })
        }
        // console.log(chunk.toString().split("\n"));
    })
        .on('close', function () {
            let sortable = [];

            for (const [key, value] of Object.entries(logs)) {
                sortable.push([key, value.visits]);
            }

            sortable.sort(function (a, b) {
                return b[1] - a[1];
            });
            // sortable = sortable.slice(0, 10);

            const stats = {};

            // console.log(sortable);
            sortable.forEach(function (item) {
                // calculate error rates
                let errorRate = 0;
                let redirectionRate = 0;
                let total = logs[item[0]].visits;
                let errors = 0;
                let redirections = 0;
                for (const [code, number] of Object.entries(logs[item[0]].codes)) {
                    if (code.substr(0, 1) === '4' || code.substr(0, 1) === '5') {
                        errors += number;
                    } else if (code.substr(0, 1) === '3') {
                        redirections += number;
                    }
                }

                errorRate = (errors / total) * 100;
                redirectionRate = (redirections / total) * 100;

                stats[item[0]] = {
                    visits: item[1],
                    error_rates: errorRate,
                    redirection_rates: redirectionRate
                }
            });

            if (stats) {
                const now = new Date();
                console.info(`Here is what happened from ${start} to ${end} for log file ${filePath} (last ${seconds} seconds)`);
                console.table(stats);
                console.info(`${visitorsIP.length} unique visits`);
            } else {
                console.info('No stats to display');
            }
        })

    setTimeout(processLogs, time);
}