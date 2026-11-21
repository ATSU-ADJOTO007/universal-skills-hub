# Default naming convention

- Tables: plural snake_case (`invoices`, `invoice_lines`).
- Primary key: `id`.
- Foreign key: `<singular table>_id` (`invoice_id`).
- Indexes: `idx_<table>_<columns>`.
- Unique constraints: `uq_<table>_<columns>`.
