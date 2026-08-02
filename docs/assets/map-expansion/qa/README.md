# Milton Estates expansion QA evidence

The PNGs in this folder are independent rendered-map captures from the
Playwright canvas suite. They cover all six registered maps at the fixed
960×540 QA viewport and are refreshed with:

```sh
CAPTURE_MAP_QA=1 npx playwright test tests/e2e/map-expansion.spec.ts -g "independent QA evidence" --workers=1
```

The static acceptance command also records the two D-010 route estimates and
checks the 96px bicycle-clear route sweeps:

```text
milton_to_reidenbaugh: 72.5s (target 60–90s)
milton_to_bent_creek: 56.7s (target 45–75s)
```
