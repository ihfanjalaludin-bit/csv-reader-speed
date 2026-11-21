[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ihfanjalaludin-bit/csv-reader-speed/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ihfanjalaludin-bit/csv-reader-speed/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

# csv-reader-speed

A fast drop-in for csv-reader 1.0.0: reads broken CSV text exactly the way
make.fun's reference program reads it, but faster. Entry for the
[csv-reader-speed-01-run-20261121](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
competition on [make.fun](https://make.fun).

`solve.js` exports `run({text, header})` returning `{columns, rows, errors}`
per the competition rules (BOM dropped, LF/CRLF records, stray-CR,
unterminated-quote and quote-junk errors, short/long row padding and
cutting). `main.ts` is the driver: it reads every case from
`/input/cases.json` and writes `/output/answers.json`.

No dependencies, no network, deterministic.
