# Code review: 2026-09-04

Issue 3 deployment and CI findings were addressed in the release scripts and
workflow. Deployment rollback captures and server-normalizes the prior
workload, guards against concurrent edits, waits for rollback health, retains
first-release recovery state, and preserves artifacts when recovery fails.
Pull requests run with read-only package access; only the isolated `main`
publishing job has package write access, and third-party actions are pinned to
commit SHAs. The publishing image packages the tested production `dist`
artifact without passing its write-capable token into dependency installation.

The combined fixes also cover frontend route and service-worker cache behavior,
SDK/cloud-save resilience, map-editor write protection, inventory presentation,
and gamepad input handling. Related tests and contracts remain in their
respective source areas.

Read-only GitHub inspection found no branch protection or repository rulesets;
required pull-request review and the `Test application` check still need to be
configured externally. Deployment and GitHub settings were not changed.

Validation completed locally for 58 Vitest files (276 tests), six executable
deployment rollback tests, map validation, TypeScript builds, export and asset
checks, production Vite build, service-worker cache validation, shell syntax,
manifest dry-run, and diff checks. The gameplay full E2E rerun passed 22 tests
with one expected skip, including the two scenarios that had transiently
failed on their initial run. The local Docker image build remains unavailable
because the Docker daemon is not running.
