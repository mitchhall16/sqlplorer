export async function onRequestPost(context) {
  const { request, env } = context;
  const API_KEY = env.ANTHROPIC_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { question, schema, sampleData, rowCount, aggregations } = await request.json();

    if (!question) {
      return new Response(JSON.stringify({ error: 'Question is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Format aggregations for the prompt
    let aggText = '';
    if (aggregations && aggregations.columnStats) {
      const stats = aggregations.columnStats;
      aggText = Object.entries(stats).map(([col, info]) => {
        if (!info) return `**${col}**: no data`;
        let text = `**${col}**:`;
        if (info.topValues && info.topValues.length > 0) {
          text += ` ${info.uniqueCount || 0} unique values. Top by count: ${info.topValues.slice(0, 10).map(([v, c]) => `${v}(${c})`).join(', ')}`;
        }
        if (info.sum !== undefined && info.sum !== null) {
          const sum = typeof info.sum === 'number' ? info.sum.toFixed(2) : info.sum;
          const avg = typeof info.avg === 'number' ? info.avg.toFixed(2) : info.avg;
          text += ` [sum: ${sum}, avg: ${avg}, min: ${info.min}, max: ${info.max}]`;
        }
        return text;
      }).join('\n');
    }

    // Format grouped aggregations (top cards/programs by spend/count)
    let groupedAggText = '';
    if (aggregations && aggregations.groupedStats) {
      const gs = aggregations.groupedStats;
      const sections = [];

      if (gs.topCardsBySpend && gs.topCardsBySpend.length > 0) {
        sections.push(`**Top Cards by Total Spend:**\n${gs.topCardsBySpend.map((item, i) => `${i + 1}. ${item.key}: $${item.sum.toLocaleString()}`).join('\n')}`);
      }
      if (gs.topProgramsBySpend && gs.topProgramsBySpend.length > 0) {
        sections.push(`**Top Programs by Total Spend:**\n${gs.topProgramsBySpend.map((item, i) => `${i + 1}. ${item.key}: $${item.sum.toLocaleString()}`).join('\n')}`);
      }
      if (gs.topCardsByCount && gs.topCardsByCount.length > 0) {
        sections.push(`**Top Cards by Transaction Count:**\n${gs.topCardsByCount.map((item, i) => `${i + 1}. ${item.key}: ${item.count} transactions`).join('\n')}`);
      }
      if (gs.topProgramsByCount && gs.topProgramsByCount.length > 0) {
        sections.push(`**Top Programs by Transaction Count:**\n${gs.topProgramsByCount.map((item, i) => `${i + 1}. ${item.key}: ${item.count} transactions`).join('\n')}`);
      }
      if (gs.topMerchantsBySpend && gs.topMerchantsBySpend.length > 0) {
        sections.push(`**Top Merchants by Total Spend:**\n${gs.topMerchantsBySpend.map((item, i) => `${i + 1}. ${item.key}: $${item.sum.toLocaleString()}`).join('\n')}`);
      }
      if (gs.topMerchantsByCount && gs.topMerchantsByCount.length > 0) {
        sections.push(`**Top Merchants by Transaction Count:**\n${gs.topMerchantsByCount.map((item, i) => `${i + 1}. ${item.key}: ${item.count} transactions`).join('\n')}`);
      }

      groupedAggText = sections.join('\n\n');
    }

    const prompt = `You are a data analyst. Answer the user's question about their data.

## COLUMNS
${schema.join(', ')}

## TOP RANKINGS (computed from ALL ${rowCount} rows)
${groupedAggText || 'No grouped rankings available'}

## COLUMN STATISTICS (computed from ALL ${rowCount} rows)
${aggText || 'No statistics available'}

## SAMPLE DATA (first 10 rows for reference only)
${JSON.stringify(sampleData.slice(0, 10), null, 2)}

## QUESTION
${question}

## RULES
1. JUST ANSWER directly with numbers/results.
2. USE the pre-computed aggregations above - they are computed from the FULL dataset. DO NOT calculate from sample data.
3. Show top 3-5 results when ranking.
4. Under 150 words, use bullets or tables.

## CRITICAL: HANDLING "UNKNOWN" VALUES
If you're asked about programs/cards and the NAME field only has one value like "Unknown Program":
- Say: "All are labeled 'Unknown Program', but by ID:"
- Then show the breakdown by the ID field (card_program_id, card_id, etc.)

Example - if asked "which program has most transactions?" and all names are "Unknown Program":
"All transactions show 'Unknown Program' as the name. By card_program_id:
1. prog_abc123 - 8 transactions
2. prog_xyz789 - 6 transactions
3. prog_def456 - 4 transactions"

This gives the user useful data even when names aren't populated.

Now answer with actual data:`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return new Response(JSON.stringify({ error: 'AI API error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await response.json();
    const answer = result.content[0].text;

    return new Response(JSON.stringify({ answer }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Ask API error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
