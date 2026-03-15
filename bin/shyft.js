#!/usr/bin/env node

import('../dist/index.js')
  .then(({ run }) => {
    run();
  })
  .catch((err) => {
    console.error('Failed to start CLI:', err);
    process.exit(1);
  });
