# Data Explorer

A simple data visualization tool that parses SQL dumps, CSV, Excel, and BOM files. No SQL knowledge required.

## Features

- **Upload any data file**: `.sql`, `.csv`, `.xlsx`, `.xls`, `.tsv`
- **Load from URL**: Paste a link to a CSV, SQL file, or Google Sheet
- **Auto-detects columns**: Numbers, dates, text, categories
- **Smart column recognition**: Finds accounts, amounts, quantities, dates, part numbers
- **Filter & sort**: Click any column header, use filter boxes
- **BOM support**: Add calculated columns (Qty × Unit Cost = Extended Total)
- **Charts**: Bar charts, pie charts, time series
- **Export**: Download filtered data as CSV

## URL Loading

Paste a URL to load data directly:

- **Raw GitHub**: `https://raw.githubusercontent.com/user/repo/main/data.csv`
- **Google Sheets**: Just paste the normal sheet URL (must be "Anyone with link" access)
- **Direct CSV/SQL links**: Any public URL ending in `.csv` or `.sql`

Note: Some servers block cross-origin requests (CORS). If a URL doesn't work, download the file and upload it instead.

## Deploy to Cloudflare Pages

### Option 1: GitHub + Cloudflare

1. Push this folder to a GitHub repo
2. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
3. Connect your GitHub account
4. Select your repo
5. Build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
6. Deploy

### Option 2: Direct Upload

1. Run locally first:
   ```bash
   npm install
   npm run build
   ```
2. Go to Cloudflare Pages → Create Project → Upload Assets
3. Drag the `dist` folder

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## File Structure

```
sql-explorer-app/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    └── App.jsx
```

## What It Parses

### SQL Files
- `CREATE TABLE` statements (extracts column names)
- `INSERT INTO ... VALUES` statements (extracts data)
- Supports MySQL, PostgreSQL, SQLite syntax

### CSV / Excel
- Standard comma-separated or Excel files
- First row = headers
- Auto-converts currency symbols ($, €, £) to numbers

### BOMs (Bill of Materials)
Works great with columns like:
- `part_number`, `sku`, `item`
- `quantity`, `qty`
- `unit_cost`, `price`
- `supplier`, `vendor`
- `category`, `type`

Click "Add Qty × Price" to create an Extended Total column automatically.
