#!/usr/bin/env node
/**
 * git pre-commit: staged dosyaları tarar.
 * Bulgu varsa 1 ile çıkar ve commit durur.
 */
import { repoRoot, gitFiles, runScan } from './scan-cli.mjs';

const root = repoRoot();
if (!root) process.exit(0);   // repo yoksa engelleyecek bir şey de yok

const files = gitFiles(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], root);
if (!files) process.exit(0);
if (files.length === 0) process.exit(0);

process.exit(runScan(files, root, 'staged'));
