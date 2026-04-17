# Gift Card Upload Plan

Scope: upload, process, and store gift card assets (no distribution).

## Upload types
- PDF (1 card per page): split into single-page PDFs.
- PDF (1 card per 4 pages): split into 4-page bundles.
- CSV (link): one asset per row with a gift card URL.

## Storage
- Raw files stored in a private bucket (e.g., `gift-cards-raw`).
- Processed PDFs stored in a private bucket (e.g., `gift-cards-processed`).
- CSV link assets stored as URLs only (no file storage).

## Database
- `gift_card_upload` tracks the upload batch, type, counts, status, and errors.
- `gift_card_asset` stores each generated asset with a required `value` and a single `asset_url`.

## Processing flow
1. Staff uploads a file and selects upload type.
2. Create a `gift_card_upload` row with status `uploaded`.
3. Background worker:
   - PDF types: split the PDF, store each chunk, create a `gift_card_asset` row per chunk.
   - CSV links: parse rows, create a `gift_card_asset` row per row.
4. Update `gift_card_upload` counts and status (`processed` or `failed`).

## Staff UI
- Upload form with type selector and provider/value defaults.
- Upload list with status, counts, and errors.
- Asset inventory view (optional) to verify counts and values.
