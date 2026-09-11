# The human verdicts

**Written at https://warrantwire.com/write/verdict** — the desk, behind the
login the site already has (`/write/login`). The founder signs in and writes
as founder; a registered reader signs in and writes as a reader. Every
verdict is stored in the `warrantwire_writing` database (`w_verdicts`), under
a real name, with the time it was written; every revision keeps the earlier
words in `w_verdict_history` with their dates. Nothing is silently rewritten.

The company page reads them from `/api/w/verdicts?ticker=TOVX`.

The JSON-file-per-company approach that lived in this folder (v1.2) is
superseded and was never used. The folder stays only for this note.

## Rules

- Warrants only. A verdict does not evaluate the company's products.
- Opinion, not advice — unless the writer's role, set by the editor, carries
  the word "licensed". A writer cannot grant that to himself.
- The founder's verdict is requested on the company page at $200; readers
  price theirs.
