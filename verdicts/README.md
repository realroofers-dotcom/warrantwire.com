# The human verdicts

One file per company, named by ticker: `TOVX.json`. The company page
(`/company.html?t=TOVX`) reads it and shows what is in it beneath the
automatic verdict. Nothing automatic ever writes here.

Until the readers' desk is built, this folder **is** the desk: Mark edits the
file, commits, pushes, and the verdict is live. Every commit is dated and
signed, so the record is searchable by name and by date in the git history.

## Shape

```json
{
  "ticker": "TOVX",
  "company": "Theriva Biologics, Inc.",
  "founder": {
    "name": "Mark Nejmeh",
    "title": "founder",
    "written": "2026-09-12T14:05:00Z",
    "revised": null,
    "advice": false,
    "verdict": "One or two sentences. What the warrant paper adds up to.",
    "notes": "Anything longer. Optional."
  },
  "readers": [
    {
      "name": "A Real Name",
      "title": "CPA, licensed",
      "written": "2026-09-13T09:00:00Z",
      "revised": null,
      "advice": true,
      "price": 75,
      "verdict": "...",
      "notes": ""
    }
  ]
}
```

## Rules

- `written` and `revised` are ISO 8601 with the time, in UTC. A verdict with no
  `written` date is treated as not written.
- `advice` may be `true` only for a reader whose licence has been checked.
  Everyone else is an opinion, and the page says so.
- A change to a verdict sets `revised`; it never deletes what `written` said.
  The old text stays in git history under the old date.
- Warrants only. A verdict does not evaluate the company's products.
