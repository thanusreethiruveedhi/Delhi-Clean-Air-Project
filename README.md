# Delhi School Clean-Air Readiness Loop

**Portfolio project by Thiruveedhi Thanusree from team GREEN TRIO **  
B.Tech III Year, CSE-AI, Section A · Roll No. 242TA31243
 
## What this project is

This is an offline, student-built prototype for a human-verified school clean-air readiness workflow. It has two separate parts:

1. **Historical context:** a chart and summary from the supplied Delhi AQI workbook. The workbook has 2,191 daily city-level rows from 2018–2024. It is used only for retrospective description.
2. **AI-enabled review prototype:** a small browser-based Isolation Forest that can score an uploaded station-level CSV with at least 30 model-eligible records per station. It never trains on the supplied historical workbook. Its output is only a neutral review cue for a person to investigate.

The model is an educational prototype implementation, not a validated service. It fits and ranks the same uploaded batch, not a separately reviewed historical baseline versus new records as proposed for the future 3B pilot. It is not the scikit-learn library; the browser code uses the original higher-is-more-unusual score direction, whereas scikit-learn score_samples uses lower-is-more-abnormal scores. Higher scores mean more unusual relative to the uploaded batch; a score is **not** a probability, cause, health warning, or proof that a measurement is wrong.


## Try a data review

The supplied historical workbook is intentionally not eligible for the model: it has no station ID, time-of-day timestamp, per-record source link, or verified provenance. No real station-history CSV is supplied.

To use the review panel later, obtain authorized, verified station history and save it as a CSV with these columns:

```text
station_id,observed_at,aqi,source_url
```

- `station_id`: the official monitoring station identifier.
- `observed_at`: ISO 8601 timestamp with timezone, for example `2026-11-13T08:30:00+05:30` or `2026-11-13T03:00:00Z`.
- `aqi`: non-negative numeric AQI value.
- `source_url`: HTTPS link to the relevant official source.

A blank template is at `data/station_history_template.csv`. The prototype checks formatting and duplicates, identifies repeated-value runs, checks the newest record against the freshness window you choose, then scores each station with at least 30 model-eligible observations. It uses AQI and change from the previous station record. The file limit is 5,000 observation rows. Only the first 100 queue candidates are shown; the total is disclosed if this limit is reached. The default review share and freshness window are demonstration settings, not calibrated policies.

The reviewer must tick the source/permission/metadata attestation before running the review. The page cannot verify that a URL is official, that data is authentic, that units or methods are suitable, or that the person is authorized to use the data. A reviewer must do that. The uploaded file is processed in the browser and is not sent to a server by this project. Do not enter student or individual health information.

## How to read the output

- **Higher Isolation Forest score:** more unusual relative to the records uploaded for that station; not a probability.
- **Repeated-value cue:** the same AQI value appears across at least three consecutive records; it may be valid, so check the source.
- **Freshness hold:** the newest station record is older than the reviewer-selected number of hours, or appears future-dated. This is not a government threshold.
- **Held row:** missing/invalid required fields, duplicate station/timestamp, future timestamp, or stale latest station record. The model does not fit or score it. Repeated-value cue rows are also excluded from model fitting/scoring and remain visible for human review. Older non-latest observations can remain as historical batch context.
- **Reviewer note:** stays temporarily in the current browser tab and disappears when results are cleared or the page closes.

The AI stops at a review cue. A school focal person checks the official source and records valid, stale, or unresolved. Only school leadership checks current CAQM/GNCTD directions and decides any school communication or operational response. This prototype sends no messages and does not decide school closure, class mode, or health guidance.

## Dataset caveats

The supplied workbook has no provided source URL or documentation of AQI method/averaging period or pollutant units. All of 2022 and 29 February 2020 are missing; no gaps were filled. The PM2.5 and PM10 columns are exact fixed multiples of AQI, so they are excluded as independent evidence. The historical data is not a live feed, forecast, or model-training set.

## Project files

- `index.html`, `styles.css`, `app.js`, `core.js`: offline UI and analysis implementation.
- `historical-data.js`: the 2,191 historical date/AQI observations, used only to draw the retrospective chart.
- `data/historical_delhi_aqi.csv`: transparent CSV extract with City, Date, AQI only.
- `data/station_history_template.csv`: blank header template for future verified data.
- `tests/core.test.js`: basic software tests; run with `node tests/core.test.js` if Node.js is installed.
- The updated combined portfolio PDF and START_HERE_Submission_Checklist.txt are supplied separately in the main submission pack.

## Suggested next step before any real pilot

Obtain verified station-level records with documented source, unit/method and timestamps; have a reviewer label flagged and sampled unflagged rows; measure false alerts, missed issues, freshness catches, and review workload; and get school feedback before considering any operational use. No pilot or real-world deployment is claimed in this portfolio.

## References

- CPCB National Air Quality Index: <https://airquality.cpcb.gov.in/AQI_India/>
- CAQM GRAP orders: <https://caqm.nic.in/landingpage/pages/grap/grap-orders>
- Original assignment references and discussion: see the supplied 2A–4B portfolio PDFs.

Technical reference: [scikit-learn IsolationForest documentation](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html). This project implements a small JavaScript educational variant; it does not call scikit-learn.

## Public sharing

The original dataset source and licence are not documented. The pack is prepared for the internship submission, not a grant of dataset redistribution rights. Before publishing the dataset publicly (for example in GitHub), ask the mentor/source owner about permission; the project code can be shared without claiming ownership of external data.
