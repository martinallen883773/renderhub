#!/bin/bash
set -e
rm -rf node_modules
npm install --no-fund --no-audit
npm run db:push
