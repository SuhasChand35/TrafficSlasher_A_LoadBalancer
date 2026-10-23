'use strict';
// Launches three backends as separate processes: one fast, one medium, one slow.
// Separate processes matter: you can kill one (Ctrl+C in its place, or `kill <pid>`)
// and watch the balancer's health checks react.
const { spawn } = require('child_process');
const path = require('path');

const fleet = [
  { port: 4001, latency: 30 },
  { port: 4002, latency: 80 },
  { port: 4003, latency: 200 },
];

const children = fleet.map(({ port, latency }) =>
  spawn(process.execPath, [path.join(__dirname, 'backend.js'), port, latency], { stdio: 'inherit' })
);

process.on('SIGINT', () => {
  children.forEach((c) => c.kill());
  process.exit(0);
});
