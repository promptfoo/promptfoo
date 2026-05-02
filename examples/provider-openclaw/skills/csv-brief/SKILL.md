---
name: csv_brief
description: Summarize the simple sales CSV probe in a fixed output format.
---

When the user asks `analyze sales csv`, read the CSV that follows and reply with exactly:

ROWS=<data row count> TOTAL=<sum of revenue> TOP_REGION=<region with the highest total revenue>
