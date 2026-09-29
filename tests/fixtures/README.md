# Report fixtures

`reports/` holds one sample report per `/qf-run` runner row, in the format that
slug's CLI parser reads. `scripts/check-report-fixtures.sh` feeds each one to
`qf validate --format <slug>` (the file's basename, or the directory's name), and
`scripts/check-skills.mjs` fails when a runner row has no fixture in its parser's
format. Nothing else may live under `reports/`: every file there is validated.

What each fixture proves is **that the CLI parses the report shape**, not that the
exact /qf-run command line was executed.

- `cypress/` was produced by the same reporter Cypress uses — mochawesome 8.1.1 on
  mocha 12 — with /qf-run's reporter options
  (`reportFilename=[name],overwrite=false,html=false,json=true,quiet=true`), running
  one spec per process as Cypress does: `cypress/e2e/admin/login.cy.js`, then
  `cypress/e2e/shop/login.cy.js`. Both specs are named `login`, so `[name]` gives
  both reports the same filename; `overwrite=false` is why the second one is
  `login_001.json` rather than a replacement of the first. With the default
  `overwrite=true` the directory holds only `login.json` and the admin spec's
  results are lost. It was not produced by `cypress run` itself (no browser in the
  fixture pipeline); absolute paths are rewritten to `/project`.
- `junit/` holds two Surefire-style `TEST-*.xml` files, one per test class. It does
  not model the module-prefixed names (`core__TEST-…xml`) /qf-run gives files
  collected from a multi-module build; the CLI parses by content, not by name.
