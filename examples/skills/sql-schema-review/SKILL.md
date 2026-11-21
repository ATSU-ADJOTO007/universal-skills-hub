---
name: sql-schema-review
description: Reviews a SQL database schema or migration for naming, keys, indexes, constraints and data types before it is applied.
tags: [database, sql, review]
license: MIT
---

# SQL schema review

Use this skill when the user shares a `CREATE TABLE` statement, a migration file or a schema dump and asks for a review.

## Checklist

- Every table has a primary key.
- Foreign keys reference an indexed column and declare an `ON DELETE` behaviour.
- Columns used in frequent `WHERE` or `JOIN` clauses have an index.
- Money is stored with an exact type (`NUMERIC`), never a float.
- Timestamps store a time zone when the database supports it.
- Names follow one convention (snake_case, singular or plural, not both).
- `NOT NULL` and `CHECK` constraints protect required values.
- A migration that rewrites a large table explains how it avoids long locks.

## Output

Group the findings by severity: blocking, recommended, optional. Quote the exact line for each finding.

See `references/naming.md` for the naming convention used by default.
