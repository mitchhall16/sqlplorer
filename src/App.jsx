import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Papa from 'papaparse';

const COLORS = ['#00F5D4', '#00BBF9', '#FEE440', '#F15BB5', '#9B5DE5', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

export default function App() {
  const [tables, setTables] = useState({});
  const [activeTable, setActiveTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [columnTypes, setColumnTypes] = useState({});
  const [filters, setFilters] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [activeView, setActiveView] = useState('table');
  const [fileName, setFileName] = useState('');
  const [parseLog, setParseLog] = useState([]);
  const [calculatedColumns, setCalculatedColumns] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sqlPasteInput, setSqlPasteInput] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [groupByColumn, setGroupByColumn] = useState('');
  const [aggregationType, setAggregationType] = useState('sum'); // 'sum' or 'count'
  const [topN, setTopN] = useState(10); // default to top 10 for cleaner charts
  const [drilldown, setDrilldown] = useState({ level: 'overview', cardId: null, programId: null, programName: null }); // drill-down state
  const [showParseLog, setShowParseLog] = useState(true);
  const [dashboardSort, setDashboardSort] = useState({ programs: { key: 'total_spend', dir: 'desc' }, cards: { key: 'total_spend', dir: 'desc' }, drilldown: { key: 'date', dir: 'desc' } });

  const data = useMemo(() => tables[activeTable] || [], [tables, activeTable]);

  // Find amount column in joined data
  const amountColumn = useMemo(() => {
    const joined = tables['transactions_joined'];
    if (!joined || joined.length === 0) return null;

    const cols = Object.keys(joined[0]);
    const amountPatterns = ['amount', 'total', 'price', 'cost', 'spend', 'value'];

    for (const col of cols) {
      const colLower = col.toLowerCase();
      if (amountPatterns.some(p => colLower.includes(p))) {
        // Check if it's actually numeric
        const sample = joined.slice(0, 10).map(r => r[col]);
        if (sample.some(v => !isNaN(parseFloat(v)))) {
          return col;
        }
      }
    }
    return null;
  }, [tables]);

  // Compute card summaries from transactions_joined
  const cardSummariesRaw = useMemo(() => {
    const joined = tables['transactions_joined'];
    if (!joined) return [];

    const byCard = {};
    joined.forEach(txn => {
      const cardId = txn.card_id;
      if (!byCard[cardId]) {
        byCard[cardId] = {
          card_id: cardId,
          card_program_id: txn.card_program_id,
          card_program_name: txn.card_program_name,
          transaction_count: 0,
          total_spend: 0
        };
      }
      byCard[cardId].transaction_count++;
      const amt = amountColumn ? parseFloat(txn[amountColumn]) || 0 : 0;
      byCard[cardId].total_spend += amt;
    });

    return Object.values(byCard);
  }, [tables, amountColumn]);

  // Sorted card summaries
  const cardSummaries = useMemo(() => {
    const { key, dir } = dashboardSort.cards;
    return [...cardSummariesRaw].sort((a, b) => {
      let aVal = a[key], bVal = b[key];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [cardSummariesRaw, dashboardSort.cards]);

  // Compute program summaries from transactions_joined
  const programSummariesRaw = useMemo(() => {
    const joined = tables['transactions_joined'];
    if (!joined) return [];

    const byProgram = {};
    const cardsByProgram = {};

    joined.forEach(txn => {
      const progId = txn.card_program_id;
      const progName = txn.card_program_name;
      const key = progId || 'unknown';

      if (!byProgram[key]) {
        byProgram[key] = {
          card_program_id: progId,
          card_program_name: progName,
          transaction_count: 0,
          total_spend: 0,
          card_count: 0
        };
        cardsByProgram[key] = new Set();
      }
      byProgram[key].transaction_count++;
      const amt = amountColumn ? parseFloat(txn[amountColumn]) || 0 : 0;
      byProgram[key].total_spend += amt;
      cardsByProgram[key].add(txn.card_id);
    });

    // Set card counts
    Object.keys(byProgram).forEach(key => {
      byProgram[key].card_count = cardsByProgram[key].size;
    });

    return Object.values(byProgram);
  }, [tables, amountColumn]);

  // Sorted program summaries
  const programSummaries = useMemo(() => {
    const { key, dir } = dashboardSort.programs;
    return [...programSummariesRaw].sort((a, b) => {
      let aVal = a[key], bVal = b[key];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [programSummariesRaw, dashboardSort.programs]);

  // Get transactions for drilldown
  // Get transactions for drilldown (raw, unsorted)
  const drilldownDataRaw = useMemo(() => {
    const joined = tables['transactions_joined'];
    if (!joined) return [];

    if (drilldown.level === 'card' && drilldown.cardId !== null) {
      return joined.filter(txn => txn.card_id === drilldown.cardId);
    }
    if (drilldown.level === 'program' && drilldown.programId !== null) {
      return joined.filter(txn => txn.card_program_id === drilldown.programId);
    }
    return [];
  }, [tables, drilldown]);

  // Sorted drilldown data
  const drilldownData = useMemo(() => {
    const { key, dir } = dashboardSort.drilldown;
    return [...drilldownDataRaw].sort((a, b) => {
      let aVal, bVal;
      if (key === 'amount') {
        aVal = amountColumn ? parseFloat(a[amountColumn]) || 0 : 0;
        bVal = amountColumn ? parseFloat(b[amountColumn]) || 0 : 0;
      } else if (key === 'date') {
        aVal = a.user_transaction_time || '';
        bVal = b.user_transaction_time || '';
      } else if (key === 'card_id') {
        aVal = a.card_id;
        bVal = b.card_id;
      } else {
        aVal = a[key];
        bVal = b[key];
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [drilldownDataRaw, dashboardSort.drilldown, amountColumn]);

  const detectColumnType = (values) => {
    const sample = values.filter(v => v !== null && v !== '' && v !== undefined).slice(0, 100);
    if (sample.length === 0) return 'text';
    
    const numericCount = sample.filter(v => {
      const cleaned = String(v).replace(/[$,€£¥]/g, '').trim();
      return !isNaN(parseFloat(cleaned)) && isFinite(cleaned);
    }).length;
    
    const dateCount = sample.filter(v => {
      if (typeof v !== 'string') return false;
      return !isNaN(Date.parse(v)) || /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v);
    }).length;
    
    if (numericCount > sample.length * 0.7) return 'number';
    if (dateCount > sample.length * 0.7) return 'date';
    
    const uniqueRatio = new Set(sample).size / sample.length;
    if (uniqueRatio < 0.3 && sample.length > 5) return 'category';
    
    return 'text';
  };

  const detectSpecialColumns = (cols, types) => {
    const patterns = {
      account: ['account', 'customer', 'client', 'user', 'name', 'buyer', 'company', 'org', 'vendor', 'member', 'supplier'],
      amount: ['amount', 'total', 'price', 'cost', 'spend', 'revenue', 'value', 'sum', 'payment', 'balance', 'unit_cost', 'unit_price', 'ext_cost', 'extended'],
      quantity: ['qty', 'quantity', 'count', 'units', 'num', 'number'],
      date: ['date', 'time', 'day', 'created', 'updated', 'timestamp', 'ordered', 'purchased'],
      category: ['category', 'type', 'group', 'class', 'department', 'section', 'family'],
      partNumber: ['part', 'sku', 'item', 'product', 'pn', 'part_number', 'partnumber', 'item_number', 'itemnumber', 'material']
    };

    const detected = {};
    
    Object.entries(patterns).forEach(([key, keywords]) => {
      for (const col of cols) {
        const colLower = col.toLowerCase().replace(/[_-]/g, '');
        if (keywords.some(k => colLower.includes(k.replace(/[_-]/g, '')))) {
          if (key === 'amount' || key === 'quantity') {
            if (types[col] === 'number') {
              detected[key] = col;
              break;
            }
          } else {
            detected[key] = col;
            break;
          }
        }
      }
    });

    if (!detected.amount) {
      detected.amount = cols.find(c => types[c] === 'number');
    }
    if (!detected.account && !detected.category) {
      detected.account = cols.find(c => types[c] === 'category' || types[c] === 'text');
    }

    return detected;
  };

  const parseSQLFile = (content) => {
    const logs = [];
    const extractedTables = {};
    const tableSchemas = {};
    
    let cleanContent = content
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\r\n/g, '\n');
    
    logs.push('🔍 Parsing SQL file...');
    
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'\[]?(\w+)[`"'\]]?\s*\(([\s\S]*?)\)(?:\s*ENGINE|\s*;|\s*$)/gi;
    let match;
    
    while ((match = createTableRegex.exec(cleanContent)) !== null) {
      const tableName = match[1];
      const columnsBlock = match[2];
      
      const columnDefs = [];
      const colRegex = /[`"'\[]?(\w+)[`"'\]]?\s+(INT|INTEGER|VARCHAR|TEXT|CHAR|DATE|DATETIME|TIMESTAMP|DECIMAL|FLOAT|DOUBLE|BOOLEAN|BOOL|BIGINT|SMALLINT|TINYINT|NUMERIC|REAL|MONEY|TIME|NVARCHAR|BIT)/gi;
      let colMatch;
      
      while ((colMatch = colRegex.exec(columnsBlock)) !== null) {
        columnDefs.push(colMatch[1]);
      }
      
      if (columnDefs.length > 0) {
        tableSchemas[tableName.toLowerCase()] = columnDefs;
        logs.push(`📋 Found table: ${tableName} (${columnDefs.length} columns)`);
      }
    }
    
    const insertRegex = /INSERT\s+INTO\s+[`"'\[]?(\w+)[`"'\]]?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]*?)(?=INSERT\s+INTO|CREATE|DROP|ALTER|UPDATE|DELETE|;?\s*$)/gi;
    
    while ((match = insertRegex.exec(cleanContent)) !== null) {
      const tableName = match[1].toLowerCase();
      const explicitColumns = match[2];
      const valuesBlock = match[3];
      
      let cols = [];
      if (explicitColumns) {
        cols = explicitColumns.split(',').map(c => c.trim().replace(/[`"'\[\]]/g, ''));
      } else if (tableSchemas[tableName]) {
        cols = tableSchemas[tableName];
      }
      
      const valueSetRegex = /\(([^)]+)\)/g;
      let valueMatch;
      const rows = [];
      
      while ((valueMatch = valueSetRegex.exec(valuesBlock)) !== null) {
        const valueStr = valueMatch[1];
        const values = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < valueStr.length; i++) {
          const char = valueStr[i];
          
          if (!inString && (char === "'" || char === '"')) {
            inString = true;
            stringChar = char;
          } else if (inString && char === stringChar && valueStr[i-1] !== '\\') {
            inString = false;
          } else if (!inString && char === ',') {
            values.push(current.trim());
            current = '';
            continue;
          }
          current += char;
        }
        values.push(current.trim());
        
        const cleanedValues = values.map(v => {
          v = v.trim();
          if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
            return v.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
          }
          if (v.toUpperCase() === 'NULL') return null;
          const num = parseFloat(v);
          if (!isNaN(num) && isFinite(v)) return num;
          return v;
        });
        
        if (cols.length === 0) {
          cols = cleanedValues.map((_, i) => `column_${i + 1}`);
        }
        
        const row = { _id: rows.length };
        cols.forEach((col, i) => {
          row[col] = cleanedValues[i] !== undefined ? cleanedValues[i] : null;
        });
        rows.push(row);
      }
      
      if (rows.length > 0) {
        if (!extractedTables[tableName]) {
          extractedTables[tableName] = { columns: cols, rows: [] };
        }
        extractedTables[tableName].rows.push(...rows);
        logs.push(`📥 Loaded ${rows.length} rows → ${tableName}`);
      }
    }
    
    const result = {};
    Object.entries(extractedTables).forEach(([name, { rows }]) => {
      result[name] = rows.map((row, idx) => ({ ...row, _id: idx }));
    });
    
    if (Object.keys(result).length === 0) {
      logs.push('⚠️ No data found. Make sure your SQL file has INSERT statements.');
    } else {
      const totalRows = Object.values(result).reduce((sum, rows) => sum + rows.length, 0);
      logs.push(`✅ Done! ${Object.keys(result).length} table(s), ${totalRows} total rows`);
    }
    
    return { tables: result, logs, schemas: tableSchemas };
  };

  const processTableData = (tableData, cols) => {
    const types = {};
    cols.forEach(col => {
      const values = tableData.map(row => row[col]);
      types[col] = detectColumnType(values);
    });
    
    const processedData = tableData.map((row, idx) => {
      const newRow = { _id: idx };
      cols.forEach(col => {
        if (types[col] === 'number' && row[col] !== null && row[col] !== undefined) {
          const cleaned = String(row[col]).replace(/[$,€£¥]/g, '').trim();
          newRow[col] = parseFloat(cleaned) || 0;
        } else {
          newRow[col] = row[col];
        }
      });
      return newRow;
    });
    
    return { processedData, types };
  };

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);
    setParseLog([]);
    setCalculatedColumns([]);
    setLoadError('');
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'sql') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        processContent(content, 'sql', file.name);
      };
      reader.readAsText(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processCSVResults(results, file.name);
        }
      });
    }
  }, []);

  const processContent = useCallback((content, type, name) => {
    if (type === 'sql') {
      const { tables: parsedTables, logs } = parseSQLFile(content);

      const updatedLogs = [...logs];

      if (Object.keys(parsedTables).length > 0) {
        // Process each table's data types
        Object.keys(parsedTables).forEach(tableName => {
          const tableData = parsedTables[tableName];
          const cols = Object.keys(tableData[0] || {}).filter(k => k !== '_id');
          const { processedData } = processTableData(tableData, cols);
          parsedTables[tableName] = processedData;
        });

        // Check for joinable tables (transactions + cards + card_programs)
        if (parsedTables['transactions'] && parsedTables['cards'] && parsedTables['card_programs']) {
          // Create lookup maps - try both string and number keys for flexibility
          const cardsMap = {};
          const cardIds = new Set();
          parsedTables['cards'].forEach(card => {
            cardsMap[card.id] = card;
            cardsMap[String(card.id)] = card;
            cardIds.add(card.id);
            cardIds.add(String(card.id));
          });
          const programsMap = {};
          parsedTables['card_programs'].forEach(prog => {
            programsMap[prog.id] = prog;
            programsMap[String(prog.id)] = prog;
          });

          // Join transactions with cards and card_programs
          let matchedCards = 0;
          let matchedPrograms = 0;
          const unmatchedCardIds = new Set();

          const joinedData = parsedTables['transactions'].map((txn, idx) => {
            // Try both the value and string version
            const card = cardsMap[txn.card_id] || cardsMap[String(txn.card_id)] || {};
            const programId = card.card_program_id;
            const program = programId ? (programsMap[programId] || programsMap[String(programId)]) : null;

            if (Object.keys(card).length > 0) {
              matchedCards++;
            } else {
              unmatchedCardIds.add(txn.card_id);
            }
            if (program) matchedPrograms++;

            let programName = 'Unknown Program';
            if (program && (program.display_name || program.name)) {
              programName = program.display_name || program.name;
            } else if (programId !== undefined && programId !== null) {
              programName = `Program #${programId}`;
            }

            return {
              _id: idx,
              ...txn,
              card_program_id: programId,
              card_program_name: programName
            };
          });

          parsedTables['transactions_joined'] = joinedData;
          const totalTxns = parsedTables['transactions'].length;

          if (matchedCards === totalTxns) {
            updatedLogs.push(`✅ All ${totalTxns} transactions matched to cards and programs`);
          } else {
            updatedLogs.push(`🔗 Joined: ${matchedCards}/${totalTxns} transactions matched cards (${Math.round(matchedCards/totalTxns*100)}%)`);
          }

          if (matchedCards < totalTxns) {
            const unmatchedSample = [...unmatchedCardIds].slice(0, 5);
            updatedLogs.push(`⚠️ ${unmatchedCardIds.size} unique card_ids not found in cards table`);
            updatedLogs.push(`   Sample unmatched card_ids: ${unmatchedSample.join(', ')}`);

            const sampleCardIds = [...cardIds].slice(0, 5);
            updatedLogs.push(`   Sample card.id values in cards table: ${sampleCardIds.join(', ')}`);
          }
        }

        // Prefer transactions_joined if it exists, else transactions, else first table
        let defaultTable = Object.keys(parsedTables)[0];
        if (parsedTables['transactions_joined']) {
          defaultTable = 'transactions_joined';
        } else if (parsedTables['transactions']) {
          defaultTable = 'transactions';
        }

        const tableData = parsedTables[defaultTable];
        const cols = Object.keys(tableData[0] || {}).filter(k => k !== '_id');

        const { types } = processTableData(tableData, cols);

        setTables(parsedTables);
        setActiveTable(defaultTable);
        setColumns(cols);
        setColumnTypes(types);
        setFilters({});
        setSelectedCategory('all');

        // Default to dashboard view if we have joined transaction data
        if (parsedTables['transactions_joined']) {
          setActiveView('dashboard');
          setDrilldown({ level: 'overview', cardId: null, programId: null, programName: null });
        }
      }

      setParseLog(updatedLogs);
      setShowParseLog(true);
    } else {
      // Parse as CSV
      Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processCSVResults(results, name);
        }
      });
    }
  }, []);

  const processCSVResults = useCallback((results, name) => {
    const parsedData = results.data;
    const cols = results.meta.fields || [];
    
    const { processedData, types } = processTableData(parsedData, cols);
    
    const tableName = name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    setTables({ [tableName]: processedData });
    setActiveTable(tableName);
    setColumns(cols);
    setColumnTypes(types);
    setFilters({});
    setSelectedCategory('all');
    setParseLog([`✅ Loaded ${processedData.length} rows`]);
  }, []);

  const handleURLFetch = useCallback(async () => {
    if (!urlInput.trim()) return;
    
    setIsLoading(true);
    setLoadError('');
    setParseLog([]);
    setCalculatedColumns([]);
    
    try {
      // Extract filename from URL
      const urlObj = new URL(urlInput.trim());
      let name = urlObj.pathname.split('/').pop() || 'data';
      
      // Handle Google Sheets URLs
      let fetchUrl = urlInput.trim();
      if (urlInput.includes('docs.google.com/spreadsheets')) {
        // Convert to CSV export URL
        const match = urlInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
          fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
          name = 'google_sheet.csv';
        }
      }
      
      setParseLog(['🔗 Fetching URL...']);
      
      const response = await fetch(fetchUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      
      if (!content || content.trim().length === 0) {
        throw new Error('Empty response received');
      }
      
      setFileName(name);
      setParseLog(prev => [...prev, `📥 Downloaded ${(content.length / 1024).toFixed(1)} KB`]);
      
      // Detect file type from URL or content
      const ext = name.split('.').pop().toLowerCase();
      
      if (ext === 'sql' || content.trim().toUpperCase().startsWith('CREATE') || content.includes('INSERT INTO')) {
        processContent(content, 'sql', name);
      } else {
        processContent(content, 'csv', name);
      }
      
    } catch (err) {
      console.error('Fetch error:', err);
      let errorMsg = err.message;
      
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMsg = 'CORS blocked or network error. Try a direct file link (raw GitHub, public CSV) or download and upload instead.';
      }
      
      setLoadError(errorMsg);
      setParseLog(prev => [...prev, `❌ Error: ${errorMsg}`]);
    } finally {
      setIsLoading(false);
    }
  }, [urlInput, processContent]);

  const handlePasteSQL = useCallback(() => {
    if (!sqlPasteInput.trim()) return;

    setParseLog([]);
    setCalculatedColumns([]);
    setLoadError('');
    setFileName('pasted_sql');

    processContent(sqlPasteInput, 'sql', 'pasted_sql');
    setSqlPasteInput('');
    setShowPasteArea(false);
  }, [sqlPasteInput, processContent]);

  const switchTable = useCallback((tableName) => {
    const tableData = tables[tableName];
    if (!tableData || tableData.length === 0) return;

    const cols = Object.keys(tableData[0] || {}).filter(k => k !== '_id');
    const types = {};
    cols.forEach(col => {
      const values = tableData.map(row => row[col]);
      types[col] = detectColumnType(values);
    });

    setActiveTable(tableName);
    setColumns(cols);
    setColumnTypes(types);
    setFilters({});
    setSelectedCategory('all');
    setSortConfig({ key: null, direction: 'asc' });
    setCalculatedColumns([]);
  }, [tables]);

  const detectedColumns = useMemo(() => detectSpecialColumns(columns, columnTypes), [columns, columnTypes]);
  
  const uniqueCategories = useMemo(() => {
    const catCol = detectedColumns.category || detectedColumns.account;
    if (!catCol) return [];
    return [...new Set(data.map(row => row[catCol]))].filter(Boolean).sort();
  }, [data, detectedColumns]);

  // Extract unique months from date column
  const uniqueMonths = useMemo(() => {
    const dateCol = detectedColumns.date;
    if (!dateCol) return [];

    const months = new Set();
    data.forEach(row => {
      const dateVal = row[dateCol];
      if (!dateVal) return;

      let date;
      if (typeof dateVal === 'string') {
        const isoMatch = dateVal.match(/\d{4}-\d{2}-\d{2}/);
        if (isoMatch) {
          date = new Date(isoMatch[0]);
        } else {
          date = new Date(dateVal);
        }
      }

      if (date && !isNaN(date.getTime())) {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        months.add(JSON.stringify({ key: monthKey, label: monthLabel }));
      }
    });

    return [...months].map(m => JSON.parse(m)).sort((a, b) => a.key.localeCompare(b.key));
  }, [data, detectedColumns]);

  // Get groupable columns (all non-numeric columns, but allow all for flexibility)
  const groupableColumns = useMemo(() => {
    // Return all columns - let user decide what to group by
    return columns;
  }, [columns]);

  const addCalculatedColumn = useCallback(() => {
    const qtyCol = detectedColumns.quantity;
    const priceCol = detectedColumns.amount;
    
    if (qtyCol && priceCol) {
      const newCalcCol = {
        name: 'ext_total',
        label: 'Extended Total',
        formula: `${qtyCol} × ${priceCol}`,
        calculate: (row) => (parseFloat(row[qtyCol]) || 0) * (parseFloat(row[priceCol]) || 0)
      };
      
      if (!calculatedColumns.find(c => c.name === 'ext_total')) {
        setCalculatedColumns(prev => [...prev, newCalcCol]);
      }
    }
  }, [detectedColumns, calculatedColumns]);

  const filteredData = useMemo(() => {
    let result = [...data];

    const catCol = detectedColumns.category || detectedColumns.account;
    if (selectedCategory !== 'all' && catCol) {
      result = result.filter(row => row[catCol] === selectedCategory);
    }

    // Filter by month
    const dateCol = detectedColumns.date;
    if (selectedMonth !== 'all' && dateCol) {
      result = result.filter(row => {
        const dateVal = row[dateCol];
        if (!dateVal) return false;

        let date;
        if (typeof dateVal === 'string') {
          const isoMatch = dateVal.match(/\d{4}-\d{2}-\d{2}/);
          if (isoMatch) {
            date = new Date(isoMatch[0]);
          } else {
            date = new Date(dateVal);
          }
        }

        if (date && !isNaN(date.getTime())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          return monthKey === selectedMonth;
        }
        return false;
      });
    }

    Object.entries(filters).forEach(([col, value]) => {
      if (value) {
        result = result.filter(row =>
          String(row[col] || '').toLowerCase().includes(value.toLowerCase())
        );
      }
    });

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        const calcCol = calculatedColumns.find(c => c.name === sortConfig.key);
        if (calcCol) {
          aVal = calcCol.calculate(a);
          bVal = calcCol.calculate(b);
        }

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, filters, sortConfig, selectedCategory, selectedMonth, detectedColumns, calculatedColumns]);

  const stats = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const amountCol = detectedColumns.amount;
    const qtyCol = detectedColumns.quantity;
    
    const result = { count: filteredData.length };
    
    if (amountCol) {
      const amounts = filteredData.map(row => parseFloat(row[amountCol])).filter(v => !isNaN(v));
      if (amounts.length > 0) {
        result.total = amounts.reduce((a, b) => a + b, 0);
        result.avg = result.total / amounts.length;
        result.max = Math.max(...amounts);
      }
    }
    
    if (qtyCol) {
      const qtys = filteredData.map(row => parseFloat(row[qtyCol])).filter(v => !isNaN(v));
      if (qtys.length > 0) {
        result.totalQty = qtys.reduce((a, b) => a + b, 0);
      }
    }
    
    if (calculatedColumns.find(c => c.name === 'ext_total')) {
      result.extendedTotal = filteredData.reduce((sum, row) => {
        const calc = calculatedColumns.find(c => c.name === 'ext_total');
        return sum + (calc ? calc.calculate(row) : 0);
      }, 0);
    }
    
    return result;
  }, [filteredData, detectedColumns, calculatedColumns]);

  const categoryBreakdown = useMemo(() => {
    // Use selected groupByColumn or fall back to detected category/account
    const catCol = groupByColumn || detectedColumns.category || detectedColumns.account;
    const amountCol = detectedColumns.amount;
    const qtyCol = detectedColumns.quantity;

    if (!catCol) return [];

    const breakdown = {};
    // Use filteredData instead of data to respect month/category filters
    filteredData.forEach(row => {
      const cat = row[catCol];
      if (!cat) return;

      if (!breakdown[cat]) {
        breakdown[cat] = { name: String(cat).slice(0, 25), value: 0, qty: 0, count: 0, fullName: String(cat) };
      }

      breakdown[cat].count++;

      if (amountCol && qtyCol && calculatedColumns.find(c => c.name === 'ext_total')) {
        const calc = calculatedColumns.find(c => c.name === 'ext_total');
        breakdown[cat].value += calc.calculate(row);
      } else if (amountCol) {
        breakdown[cat].value += parseFloat(row[amountCol]) || 0;
      }

      if (qtyCol) {
        breakdown[cat].qty += parseFloat(row[qtyCol]) || 0;
      }
    });

    // Sort by aggregationType - either sum (value) or count
    const sortKey = aggregationType === 'count' ? 'count' : 'value';
    const sorted = Object.values(breakdown).sort((a, b) => b[sortKey] - a[sortKey]);
    // Apply topN limit if set
    return topN > 0 ? sorted.slice(0, topN) : sorted;
  }, [filteredData, detectedColumns, calculatedColumns, groupByColumn, aggregationType, topN]);

  const timeSeriesData = useMemo(() => {
    const dateCol = detectedColumns.date;
    const amountCol = detectedColumns.amount;
    const catCol = groupByColumn || detectedColumns.category || detectedColumns.account;

    if (!dateCol || !amountCol) return { data: [], categories: [] };

    // Get top categories from categoryBreakdown
    const topCategories = categoryBreakdown.map(c => c.fullName);

    const byDateAndCat = {};
    const allDates = new Set();

    filteredData.forEach(row => {
      const dateVal = row[dateCol];
      const cat = catCol ? row[catCol] : 'All';
      if (!dateVal) return;

      // Only include top categories if we have them
      if (catCol && topCategories.length > 0 && !topCategories.includes(cat)) return;

      let dateStr;
      if (typeof dateVal === 'string') {
        const isoMatch = dateVal.match(/\d{4}-\d{2}-\d{2}/);
        if (isoMatch) {
          dateStr = isoMatch[0];
        } else {
          const date = new Date(dateVal);
          if (!isNaN(date.getTime())) {
            dateStr = date.toISOString().split('T')[0];
          }
        }
      }

      if (!dateStr) return;
      allDates.add(dateStr);

      if (!byDateAndCat[dateStr]) byDateAndCat[dateStr] = {};
      byDateAndCat[dateStr][cat] = (byDateAndCat[dateStr][cat] || 0) + (parseFloat(row[amountCol]) || 0);
    });

    const sortedDates = [...allDates].sort();
    const categories = topCategories.length > 0 ? topCategories : ['All'];

    const chartData = sortedDates.map(date => {
      const row = { date };
      categories.forEach(cat => {
        row[cat] = byDateAndCat[date]?.[cat] || 0;
      });
      return row;
    });

    return { data: chartData, categories };
  }, [filteredData, detectedColumns, groupByColumn, categoryBreakdown]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatNumber = (num, prefix = '$') => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    if (Math.abs(num) >= 1000000) return `${prefix}${(num / 1000000).toFixed(2)}M`;
    if (Math.abs(num) >= 1000) return `${prefix}${(num / 1000).toFixed(1)}K`;
    return `${prefix}${num.toFixed(2)}`;
  };

  const formatCell = (value, type) => {
    if (value === null || value === undefined) return <span style={{ opacity: 0.3 }}>—</span>;
    if (type === 'number' && !isNaN(value)) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  };

  const exportCSV = () => {
    const allCols = [...columns, ...calculatedColumns.map(c => c.name)];
    const csvRows = [allCols.join(',')];
    
    filteredData.forEach(row => {
      const values = allCols.map(col => {
        const calcCol = calculatedColumns.find(c => c.name === col);
        const val = calcCol ? calcCol.calculate(row) : row[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvRows.push(values.join(','));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTable}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #0d0d12 0%, #1a1a2e 40%, #16213e 100%)',
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      color: '#e0e0e0',
      padding: '20px 24px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: #00F5D4; border-radius: 3px; }
        
        .glow { text-shadow: 0 0 20px rgba(0, 245, 212, 0.4); }
        
        .card {
          background: rgba(20, 20, 35, 0.9);
          border: 1px solid rgba(0, 245, 212, 0.15);
          border-radius: 10px;
          backdrop-filter: blur(10px);
        }
        
        .btn {
          background: linear-gradient(135deg, #00F5D4, #00BBF9);
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          color: #0a0a0f;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0, 245, 212, 0.3);
        }
        
        .btn-ghost {
          background: transparent;
          border: 1px solid rgba(0, 245, 212, 0.25);
          color: #00F5D4;
        }
        
        .btn-ghost:hover { background: rgba(0, 245, 212, 0.1); }
        .btn-ghost.active { background: rgba(0, 245, 212, 0.15); border-color: #00F5D4; }
        
        input, select {
          background: rgba(10, 10, 15, 0.9);
          border: 1px solid rgba(0, 245, 212, 0.2);
          border-radius: 6px;
          padding: 8px 12px;
          color: #e0e0e0;
          font-family: inherit;
          font-size: 12px;
        }
        
        input:focus, select:focus {
          outline: none;
          border-color: #00F5D4;
        }
        
        table { width: 100%; border-collapse: collapse; }
        
        th {
          background: rgba(0, 245, 212, 0.08);
          padding: 12px 10px;
          text-align: left;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #00F5D4;
          cursor: pointer;
          position: sticky;
          top: 0;
          white-space: nowrap;
          border-bottom: 1px solid rgba(0, 245, 212, 0.2);
        }
        
        th:hover { background: rgba(0, 245, 212, 0.15); }
        
        td {
          padding: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          font-size: 12px;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        tr:hover td { background: rgba(0, 245, 212, 0.03); }
        
        .stat-val {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 24px;
          font-weight: 700;
          background: linear-gradient(135deg, #00F5D4, #00BBF9);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .upload-zone {
          border: 2px dashed rgba(0, 245, 212, 0.25);
          border-radius: 12px;
          padding: 50px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .upload-zone:hover {
          border-color: #00F5D4;
          background: rgba(0, 245, 212, 0.03);
        }
        
        .tag {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          font-weight: 600;
        }
        
        .tag-number { background: rgba(0, 187, 249, 0.2); color: #00BBF9; }
        .tag-text { background: rgba(254, 228, 64, 0.2); color: #FEE440; }
        .tag-date { background: rgba(241, 91, 181, 0.2); color: #F15BB5; }
        .tag-category { background: rgba(155, 93, 229, 0.2); color: #9B5DE5; }
        .tag-calc { background: rgba(0, 245, 212, 0.2); color: #00F5D4; }
        
        .tab {
          padding: 6px 14px;
          background: rgba(10, 10, 15, 0.5);
          border: 1px solid rgba(0, 245, 212, 0.15);
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          color: #e0e0e0;
          transition: all 0.2s;
        }
        
        .tab:hover { border-color: rgba(0, 245, 212, 0.4); }
        .tab.active { background: rgba(0, 245, 212, 0.12); border-color: #00F5D4; color: #00F5D4; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }} className="glow">
            DATA<span style={{ color: '#00BBF9' }}>_</span>EXPLORER
          </h1>
          <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: 11 }}>
            SQL • CSV • Excel • BOM → Instant insights
          </p>
        </div>
        {fileName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ opacity: 0.5, fontSize: 12 }}>📁 {fileName}</span>
            <span style={{ color: '#00F5D4', fontSize: 12, fontWeight: 500 }}>{data.length} rows</span>
            <button className="btn btn-ghost" onClick={exportCSV} style={{ padding: '6px 12px' }}>
              ⬇️ Export
            </button>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      {Object.keys(tables).length === 0 && (
        <div style={{ marginBottom: 24 }}>
          {/* File Upload */}
          <label className="upload-zone" style={{ display: 'block', marginBottom: 16 }}>
            <input type="file" accept=".sql,.csv,.xlsx,.xls,.tsv" onChange={handleFileUpload} style={{ display: 'none' }} />
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗄️</div>
            <div style={{ fontSize: 16, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 6 }}>
              Drop your file here
            </div>
            <div style={{ opacity: 0.4, fontSize: 12, marginBottom: 16 }}>
              .sql • .csv • .xlsx • .xls • .tsv
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="tag tag-category">SQL dumps</span>
              <span className="tag tag-number">Spreadsheets</span>
              <span className="tag tag-date">BOMs</span>
            </div>
          </label>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(0, 245, 212, 0.2)' }} />
            <span style={{ opacity: 0.5, fontSize: 12 }}>or load from URL</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(0, 245, 212, 0.2)' }} />
          </div>

          {/* URL Input */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Paste URL to .sql, .csv, or Google Sheet..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleURLFetch()}
                style={{ flex: 1, minWidth: 250 }}
              />
              <button 
                className="btn" 
                onClick={handleURLFetch}
                disabled={isLoading || !urlInput.trim()}
                style={{ opacity: isLoading || !urlInput.trim() ? 0.5 : 1 }}
              >
                {isLoading ? '⏳ Loading...' : '🔗 Load URL'}
              </button>
            </div>
            
            <div style={{ marginTop: 12, fontSize: 11, opacity: 0.5 }}>
              Works with: Raw GitHub links, public CSV URLs, Google Sheets (public/anyone with link)
            </div>

            {loadError && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 100, 100, 0.1)', borderRadius: 6, fontSize: 12, color: '#ff6b6b' }}>
                ⚠️ {loadError}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(0, 245, 212, 0.2)' }} />
            <span style={{ opacity: 0.5, fontSize: 12 }}>or paste SQL directly</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(0, 245, 212, 0.2)' }} />
          </div>

          {/* Paste SQL */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPasteArea ? 12 : 0 }}>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                Copy SQL from DB Fiddle, SQLFiddle, or anywhere else
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setShowPasteArea(!showPasteArea)}
                style={{ padding: '6px 14px' }}
              >
                {showPasteArea ? '✕ Close' : '📋 Paste SQL'}
              </button>
            </div>

            {showPasteArea && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  placeholder="Paste your CREATE TABLE and INSERT statements here..."
                  value={sqlPasteInput}
                  onChange={(e) => setSqlPasteInput(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 200,
                    background: 'rgba(10, 10, 15, 0.9)',
                    border: '1px solid rgba(0, 245, 212, 0.2)',
                    borderRadius: 6,
                    padding: 12,
                    color: '#e0e0e0',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    resize: 'vertical'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <div style={{ fontSize: 10, opacity: 0.4 }}>
                    Supports: CREATE TABLE, INSERT INTO statements
                  </div>
                  <button
                    className="btn"
                    onClick={handlePasteSQL}
                    disabled={!sqlPasteInput.trim()}
                    style={{ opacity: sqlPasteInput.trim() ? 1 : 0.5 }}
                  >
                    🚀 Load SQL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parse Log - dismissible */}
      {parseLog.length > 0 && Object.keys(tables).length > 0 && showParseLog && (
        <div className="card" style={{
          padding: 12,
          marginBottom: 20,
          background: parseLog.some(l => l.includes('⚠️')) ? 'rgba(255,150,50,0.05)' : 'rgba(0,245,212,0.05)',
          borderColor: parseLog.some(l => l.includes('⚠️')) ? 'rgba(255,150,50,0.2)' : 'rgba(0,245,212,0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                {parseLog.some(l => l.includes('⚠️')) ? '⚠️ Data Issues Found' : '✅ Data Loaded'}
              </span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>
                {Object.keys(tables).length} tables • {Object.values(tables).reduce((s, t) => s + t.length, 0).toLocaleString()} rows
              </span>
            </div>
            <button
              onClick={() => setShowParseLog(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 16,
                padding: '0 4px'
              }}
            >
              ✕
            </button>
          </div>
          {parseLog.some(l => l.includes('⚠️') || l.includes('Sample')) && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {parseLog.filter(l => l.includes('⚠️') || l.includes('Sample') || l.includes('🔗')).map((log, i) => (
                <div key={i} style={{
                  padding: '2px 0',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: log.includes('⚠️') ? '#ffaa50' : '#e0e0e0'
                }}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      {Object.keys(tables).length > 0 && (
        <>
          {/* Table Tabs */}
          {Object.keys(tables).length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ opacity: 0.5, fontSize: 11 }}>Tables:</span>
              {Object.keys(tables).map(tableName => (
                <button
                  key={tableName}
                  className={`tab ${activeTable === tableName ? 'active' : ''}`}
                  onClick={() => switchTable(tableName)}
                >
                  {tableName} ({tables[tableName].length})
                </button>
              ))}
            </div>
          )}

          {/* Schema Display */}
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5 }}>
                Columns — {activeTable}
              </span>
              {detectedColumns.quantity && detectedColumns.amount && !calculatedColumns.find(c => c.name === 'ext_total') && (
                <button className="btn" onClick={addCalculatedColumn} style={{ padding: '5px 12px', fontSize: 10 }}>
                  ➕ Add Qty × Price
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {columns.map(col => (
                <div key={col} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  padding: '6px 10px',
                  background: 'rgba(10, 10, 15, 0.5)',
                  borderRadius: 6,
                  fontSize: 11
                }}>
                  <span>{col}</span>
                  <span className={`tag tag-${columnTypes[col]}`}>{columnTypes[col]}</span>
                  {col === detectedColumns.account && <span title="Account/Name">👤</span>}
                  {col === detectedColumns.amount && <span title="Amount/Cost">💰</span>}
                  {col === detectedColumns.quantity && <span title="Quantity">📦</span>}
                  {col === detectedColumns.date && <span title="Date">📅</span>}
                  {col === detectedColumns.category && <span title="Category">🏷️</span>}
                  {col === detectedColumns.partNumber && <span title="Part Number">🔧</span>}
                </div>
              ))}
              {calculatedColumns.map(col => (
                <div key={col.name} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  padding: '6px 10px',
                  background: 'rgba(0, 245, 212, 0.1)',
                  borderRadius: 6,
                  fontSize: 11,
                  border: '1px solid rgba(0, 245, 212, 0.3)'
                }}>
                  <span>{col.label}</span>
                  <span className="tag tag-calc">calc</span>
                  <span title={col.formula}>🧮</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5, marginBottom: 6 }}>Records</div>
                <div className="stat-val">{stats.count.toLocaleString()}</div>
              </div>
              {stats.total !== undefined && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5, marginBottom: 6 }}>Total</div>
                  <div className="stat-val">{formatNumber(stats.total)}</div>
                </div>
              )}
              {stats.avg !== undefined && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5, marginBottom: 6 }}>Average</div>
                  <div className="stat-val">{formatNumber(stats.avg)}</div>
                </div>
              )}
              {stats.totalQty !== undefined && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5, marginBottom: 6 }}>Total Qty</div>
                  <div className="stat-val">{formatNumber(stats.totalQty, '')}</div>
                </div>
              )}
              {stats.extendedTotal !== undefined && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5, marginBottom: 6 }}>Extended Total</div>
                  <div className="stat-val">{formatNumber(stats.extendedTotal)}</div>
                </div>
              )}
              {stats.max !== undefined && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.5, marginBottom: 6 }}>Largest</div>
                  <div className="stat-val">{formatNumber(stats.max)}</div>
                </div>
              )}
            </div>
          )}

          {/* Filters & Controls */}
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {uniqueCategories.length > 0 && (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ minWidth: 180 }}
                  >
                    <option value="all">All ({uniqueCategories.length} groups)</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{String(cat)}</option>
                    ))}
                  </select>
                )}
                {uniqueMonths.length > 0 && (
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    style={{ minWidth: 150 }}
                  >
                    <option value="all">All Months</option>
                    {uniqueMonths.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                )}
                {columns.slice(0, 3).map(col => (
                  <input
                    key={col}
                    type="text"
                    placeholder={`${col}...`}
                    value={filters[col] || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, [col]: e.target.value }))}
                    style={{ width: 100 }}
                  />
                ))}
                {(Object.values(filters).some(v => v) || selectedMonth !== 'all' || selectedCategory !== 'all') && (
                  <button className="btn btn-ghost" onClick={() => { setFilters({}); setSelectedMonth('all'); setSelectedCategory('all'); }} style={{ padding: '6px 12px' }}>
                    Clear All
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {tables['transactions_joined'] && (
                  <button
                    className={`btn btn-ghost ${activeView === 'dashboard' ? 'active' : ''}`}
                    onClick={() => { setActiveView('dashboard'); setDrilldown({ level: 'overview', cardId: null, programId: null, programName: null }); }}
                    style={{ padding: '6px 14px' }}
                  >
                    🏠 Dashboard
                  </button>
                )}
                <button
                  className={`btn btn-ghost ${activeView === 'table' ? 'active' : ''}`}
                  onClick={() => setActiveView('table')}
                  style={{ padding: '6px 14px' }}
                >
                  📋 Table
                </button>
                <button
                  className={`btn btn-ghost ${activeView === 'charts' ? 'active' : ''}`}
                  onClick={() => setActiveView('charts')}
                  style={{ padding: '6px 14px' }}
                >
                  📊 Charts
                </button>
              </div>
            </div>

            {/* Chart Controls - only show when in chart view */}
            {activeView === 'charts' && (
              <div style={{ display: 'flex', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, opacity: 0.6 }}>Group by:</span>
                <select
                  value={groupByColumn}
                  onChange={(e) => setGroupByColumn(e.target.value)}
                  style={{ minWidth: 140 }}
                >
                  <option value="">Auto-detect</option>
                  {groupableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>Show:</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className={`btn btn-ghost ${aggregationType === 'sum' ? 'active' : ''}`}
                    onClick={() => setAggregationType('sum')}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    💰 Total Spend
                  </button>
                  <button
                    className={`btn btn-ghost ${aggregationType === 'count' ? 'active' : ''}`}
                    onClick={() => setAggregationType('count')}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    🔢 # Transactions
                  </button>
                </div>
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>Limit:</span>
                <select
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  style={{ minWidth: 80 }}
                >
                  <option value={0}>All</option>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={25}>Top 25</option>
                  <option value={50}>Top 50</option>
                </select>
              </div>
            )}
          </div>

          {/* Dashboard View */}
          {activeView === 'dashboard' && tables['transactions_joined'] && (
            <div>
              {/* Summary Stats */}
              {drilldown.level === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>TOTAL TRANSACTIONS</div>
                    <div className="stat-val">{tables['transactions_joined'].length.toLocaleString()}</div>
                  </div>
                  <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>TOTAL SPEND</div>
                    <div className="stat-val">${programSummaries.reduce((s, p) => s + p.total_spend, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>CARD PROGRAMS</div>
                    <div className="stat-val">{programSummaries.filter(p => p.card_program_name !== 'Unknown Program').length}</div>
                  </div>
                  <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>ACTIVE CARDS</div>
                    <div className="stat-val">{cardSummaries.length}</div>
                  </div>
                </div>
              )}

              {/* Warning for unmatched data - show parse log details */}
              {drilldown.level === 'overview' && programSummaries.some(p => p.card_program_name === 'Unknown Program') && (
                <div className="card" style={{ padding: 16, marginBottom: 20, background: 'rgba(255,150,50,0.1)', borderColor: 'rgba(255,150,50,0.3)' }}>
                  <div style={{ fontSize: 13, color: '#ffaa50', fontWeight: 500, marginBottom: 8 }}>
                    ⚠️ Some transactions couldn't be matched to card programs
                  </div>
                  <div style={{ fontSize: 12, color: '#e0e0e0', opacity: 0.8 }}>
                    {parseLog.filter(l => l.includes('⚠️') || l.includes('Sample') || l.includes('Joined')).map((log, i) => (
                      <div key={i} style={{ padding: '2px 0', fontFamily: 'monospace' }}>{log}</div>
                    ))}
                  </div>
                  {parseLog.filter(l => l.includes('Sample')).length === 0 && (
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
                      Check the Parse Log above for details, or card_id values in transactions may not exist in the cards table.
                    </div>
                  )}
                </div>
              )}

              {/* Breadcrumb */}
              {drilldown.level !== 'overview' && (
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setDrilldown({ level: 'overview', cardId: null, programId: null, programName: null })}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    ← Back to Overview
                  </button>
                  <span style={{ opacity: 0.5 }}>|</span>
                  <span style={{ color: '#00F5D4' }}>
                    {drilldown.level === 'card' && `Card #${drilldown.cardId}`}
                    {drilldown.level === 'program' && drilldown.programName}
                  </span>
                </div>
              )}

              {/* Overview - Card Programs & Cards side by side */}
              {drilldown.level === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
                  {/* Card Programs */}
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>💳 Card Programs</span>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>{programSummaries.filter(p => p.card_program_name !== 'Unknown Program').length} programs</span>
                    </h3>
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      <table style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th
                              style={{ textAlign: 'left', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, programs: { key: 'card_program_name', dir: s.programs.key === 'card_program_name' && s.programs.dir === 'asc' ? 'desc' : 'asc' } }))}
                            >
                              Program {dashboardSort.programs.key === 'card_program_name' && (dashboardSort.programs.dir === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              style={{ textAlign: 'right', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, programs: { key: 'card_count', dir: s.programs.key === 'card_count' && s.programs.dir === 'desc' ? 'asc' : 'desc' } }))}
                            >
                              Cards {dashboardSort.programs.key === 'card_count' && (dashboardSort.programs.dir === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              style={{ textAlign: 'right', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, programs: { key: 'transaction_count', dir: s.programs.key === 'transaction_count' && s.programs.dir === 'desc' ? 'asc' : 'desc' } }))}
                            >
                              Transactions {dashboardSort.programs.key === 'transaction_count' && (dashboardSort.programs.dir === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              style={{ textAlign: 'right', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, programs: { key: 'total_spend', dir: s.programs.key === 'total_spend' && s.programs.dir === 'desc' ? 'asc' : 'desc' } }))}
                            >
                              Total Spend {dashboardSort.programs.key === 'total_spend' && (dashboardSort.programs.dir === 'asc' ? '↑' : '↓')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {programSummaries.filter(p => p.card_program_name !== 'Unknown Program').map((prog, idx) => (
                            <tr
                              key={prog.card_program_id || idx}
                              onClick={() => setDrilldown({ level: 'program', cardId: null, programId: prog.card_program_id, programName: prog.card_program_name })}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ color: COLORS[idx % COLORS.length] }}>{prog.card_program_name}</td>
                              <td style={{ textAlign: 'right', opacity: 0.7 }}>{prog.card_count}</td>
                              <td style={{ textAlign: 'right', opacity: 0.7 }}>{prog.transaction_count.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', color: '#00F5D4', fontVariantNumeric: 'tabular-nums' }}>
                                ${prog.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🪪 Cards</span>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>{cardSummaries.length} cards</span>
                    </h3>
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      <table style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th
                              style={{ textAlign: 'left', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, cards: { key: 'card_id', dir: s.cards.key === 'card_id' && s.cards.dir === 'asc' ? 'desc' : 'asc' } }))}
                            >
                              Card ID {dashboardSort.cards.key === 'card_id' && (dashboardSort.cards.dir === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              style={{ textAlign: 'left', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, cards: { key: 'card_program_name', dir: s.cards.key === 'card_program_name' && s.cards.dir === 'asc' ? 'desc' : 'asc' } }))}
                            >
                              Program {dashboardSort.cards.key === 'card_program_name' && (dashboardSort.cards.dir === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              style={{ textAlign: 'right', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, cards: { key: 'transaction_count', dir: s.cards.key === 'transaction_count' && s.cards.dir === 'desc' ? 'asc' : 'desc' } }))}
                            >
                              Transactions {dashboardSort.cards.key === 'transaction_count' && (dashboardSort.cards.dir === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              style={{ textAlign: 'right', cursor: 'pointer' }}
                              onClick={() => setDashboardSort(s => ({ ...s, cards: { key: 'total_spend', dir: s.cards.key === 'total_spend' && s.cards.dir === 'desc' ? 'asc' : 'desc' } }))}
                            >
                              Total Spend {dashboardSort.cards.key === 'total_spend' && (dashboardSort.cards.dir === 'asc' ? '↑' : '↓')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cardSummaries.slice(0, 100).map((card, idx) => (
                            <tr
                              key={card.card_id}
                              onClick={() => setDrilldown({ level: 'card', cardId: card.card_id, programId: null, programName: null })}
                              style={{ cursor: 'pointer' }}
                            >
                              <td>#{card.card_id}</td>
                              <td style={{ opacity: 0.7 }}>{card.card_program_name}</td>
                              <td style={{ textAlign: 'right', opacity: 0.7 }}>{card.transaction_count}</td>
                              <td style={{ textAlign: 'right', color: '#00F5D4', fontVariantNumeric: 'tabular-nums' }}>
                                ${card.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {cardSummaries.length > 100 && (
                        <div style={{ padding: 12, textAlign: 'center', opacity: 0.5, fontSize: 11 }}>
                          Showing top 100 of {cardSummaries.length} cards
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Drilldown - Show transactions for selected card or program */}
              {(drilldown.level === 'card' || drilldown.level === 'program') && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      {drilldown.level === 'card' ? `Transactions for Card #${drilldown.cardId}` : `Transactions for ${drilldown.programName}`}
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.5 }}>
                      {drilldownData.length} transactions |
                      Total: ${drilldownData.reduce((sum, t) => sum + (amountColumn ? parseFloat(t[amountColumn]) || 0 : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </h3>
                  <div style={{ maxHeight: 500, overflow: 'auto' }}>
                    <table style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th
                            style={{ textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => setDashboardSort(s => ({ ...s, drilldown: { key: 'date', dir: s.drilldown.key === 'date' && s.drilldown.dir === 'desc' ? 'asc' : 'desc' } }))}
                          >
                            Date {dashboardSort.drilldown.key === 'date' && (dashboardSort.drilldown.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th
                            style={{ textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => setDashboardSort(s => ({ ...s, drilldown: { key: 'card_id', dir: s.drilldown.key === 'card_id' && s.drilldown.dir === 'asc' ? 'desc' : 'asc' } }))}
                          >
                            Card ID {dashboardSort.drilldown.key === 'card_id' && (dashboardSort.drilldown.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th
                            style={{ textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => setDashboardSort(s => ({ ...s, drilldown: { key: 'card_program_name', dir: s.drilldown.key === 'card_program_name' && s.drilldown.dir === 'asc' ? 'desc' : 'asc' } }))}
                          >
                            Program {dashboardSort.drilldown.key === 'card_program_name' && (dashboardSort.drilldown.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th
                            style={{ textAlign: 'right', cursor: 'pointer' }}
                            onClick={() => setDashboardSort(s => ({ ...s, drilldown: { key: 'amount', dir: s.drilldown.key === 'amount' && s.drilldown.dir === 'desc' ? 'asc' : 'desc' } }))}
                          >
                            Amount {dashboardSort.drilldown.key === 'amount' && (dashboardSort.drilldown.dir === 'asc' ? '↑' : '↓')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {drilldownData.map((txn, idx) => (
                          <tr key={txn._id || idx}>
                            <td>{txn.user_transaction_time}</td>
                            <td>#{txn.card_id}</td>
                            <td style={{ opacity: 0.7 }}>{txn.card_program_name}</td>
                            <td style={{ textAlign: 'right', color: '#00F5D4', fontVariantNumeric: 'tabular-nums' }}>
                              ${(amountColumn ? parseFloat(txn[amountColumn]) || 0 : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table View */}
          {activeView === 'table' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ maxHeight: 600, overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      {columns.map(col => (
                        <th key={col} onClick={() => handleSort(col)}>
                          {col}
                          {sortConfig.key === col && (
                            <span style={{ marginLeft: 6 }}>
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                      ))}
                      {calculatedColumns.map(col => (
                        <th key={col.name} onClick={() => handleSort(col.name)} style={{ background: 'rgba(0, 245, 212, 0.12)' }}>
                          {col.label}
                          {sortConfig.key === col.name && (
                            <span style={{ marginLeft: 6 }}>
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row, idx) => (
                      <tr key={row._id ?? idx}>
                        {columns.map(col => (
                          <td key={col} style={{
                            color: columnTypes[col] === 'number' ? '#00F5D4' : 'inherit',
                            fontVariantNumeric: columnTypes[col] === 'number' ? 'tabular-nums' : 'normal'
                          }}>
                            {formatCell(row[col], columnTypes[col])}
                          </td>
                        ))}
                        {calculatedColumns.map(col => (
                          <td key={col.name} style={{ color: '#00F5D4', fontVariantNumeric: 'tabular-nums', background: 'rgba(0, 245, 212, 0.03)' }}>
                            {col.calculate(row).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: 12, textAlign: 'center', opacity: 0.5, fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {filteredData.length.toLocaleString()} rows
              </div>
            </div>
          )}

          {/* Charts View */}
          {activeView === 'charts' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
              {categoryBreakdown.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                    {aggregationType === 'count' ? '# Transactions' : 'Total Spend'} by {groupByColumn || detectedColumns.category || detectedColumns.account || 'Category'}
                    {selectedMonth !== 'all' && ` (${uniqueMonths.find(m => m.key === selectedMonth)?.label || selectedMonth})`}
                  </h3>
                  <ResponsiveContainer width="100%" height={Math.max(320, categoryBreakdown.length * 28)}>
                    <BarChart data={categoryBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis
                        type="number"
                        stroke="#555"
                        tickFormatter={(v) => aggregationType === 'count' ? v.toLocaleString() : formatNumber(v)}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis type="category" dataKey="name" stroke="#555" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(0, 245, 212, 0.3)', borderRadius: 6, fontSize: 11, color: '#e0e0e0' }}
                        labelStyle={{ color: '#e0e0e0' }}
                        itemStyle={{ color: '#e0e0e0' }}
                        formatter={(value, name, props) => {
                          const item = props.payload;
                          if (aggregationType === 'count') {
                            return [`${value.toLocaleString()} transactions`, item.fullName || item.name];
                          }
                          return [formatNumber(value), item.fullName || item.name];
                        }}
                        labelFormatter={() => ''}
                      />
                      <Bar dataKey={aggregationType === 'count' ? 'count' : 'value'} radius={[0, 4, 4, 0]}>
                        {categoryBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {categoryBreakdown.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                    Distribution ({aggregationType === 'count' ? 'by count' : 'by spend'})
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={1}
                        dataKey={aggregationType === 'count' ? 'count' : 'value'}
                      >
                        {categoryBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(0, 245, 212, 0.3)', borderRadius: 6, fontSize: 11, color: '#e0e0e0' }}
                        labelStyle={{ color: '#e0e0e0' }}
                        itemStyle={{ color: '#e0e0e0' }}
                        formatter={(value) => aggregationType === 'count' ? [`${value.toLocaleString()} transactions`, ''] : [formatNumber(value), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                    {categoryBreakdown.map((entry, index) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[index % COLORS.length] }} />
                        {entry.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {timeSeriesData.data.length > 1 && (
                <div className="card" style={{ padding: 20, gridColumn: '1 / -1' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                    Spend Over Time by {groupByColumn || detectedColumns.category || detectedColumns.account || 'Category'}
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeSeriesData.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="date" stroke="#555" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#555" tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(0, 245, 212, 0.3)', borderRadius: 6, fontSize: 11, color: '#e0e0e0' }}
                        labelStyle={{ color: '#e0e0e0' }}
                        itemStyle={{ color: '#e0e0e0' }}
                        formatter={(value, name) => [formatNumber(value), name]}
                      />
                      {timeSeriesData.categories.map((cat, idx) => (
                        <Line
                          key={cat}
                          type="monotone"
                          dataKey={cat}
                          name={cat}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: COLORS[idx % COLORS.length] }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                    {timeSeriesData.categories.map((cat, idx) => (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                        <div style={{ width: 12, height: 3, borderRadius: 2, background: COLORS[idx % COLORS.length] }} />
                        {String(cat).slice(0, 20)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {categoryBreakdown.length === 0 && timeSeriesData.data.length <= 1 && (
                <div className="card" style={{ padding: 32, textAlign: 'center', opacity: 0.5, gridColumn: '1 / -1' }}>
                  Charts need numeric columns (amounts, costs, quantities) or date columns to display.
                </div>
              )}
            </div>
          )}

          {/* Upload New */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <label>
              <input type="file" accept=".sql,.csv,.xlsx,.xls,.tsv" onChange={handleFileUpload} style={{ display: 'none' }} />
              <span className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                📁 Upload Different File
              </span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
