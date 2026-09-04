#!/usr/bin/env node
/**
 * git pre-commit: scans staged files.
 * Exits 1 when there are findings, which stops the commit.
 */
import { repoRoot, gitFiles, runScan } from './scan-cli.mjs';

const root = repoRoot();
if (!root) process.exit(0);   // no repo means nothing to block

const files = gitFiles(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], root);
if (!files) process.exit(0);
if (files.length === 0) process.exit(0);

process.exit(runScan(files, root, 'staged'));
