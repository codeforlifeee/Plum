/**
 * OWNER    : Khare
 * DUE      : D2 18:00
 * TASK     :
 *   checkFireTrend {district, days} -> daily fire_count & frp_sum for the last N days from Attribution table (fallback: curated/fires via Athena). Contract = agentTools.checkFireTrend.
 * DONE WHEN: Agent tool returns real numbers.
 * GUIDE    : docs/team/KHARE.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */

export const handler = async (event) => {
  const district = event.district || 'Sangrur';
  const days = event.days || 3;
  
  const isMock = process.env.MOCK_MODE === '1' || process.env.PT_LOCAL === '1';
  
  if (isMock) {
    // Generate dummy data based on district and days
    const trend = [];
    const date = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(date);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      
      trend.push({
        date: dayStr,
        fire_count: Math.floor(Math.random() * 50) + 10,
        frp_sum: Math.floor(Math.random() * 500) + 100
      });
    }
    return { district, trend };
  }
  
  // Real implementation: read the Attribution table (pk=date#<date>, sk=district#<district>).
  try {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb');

    const region = process.env.AWS_REGION || 'ap-south-1';
    const table = process.env.PT_TABLE_ATTRIBUTION || process.env.TABLE_ATTRIBUTION || 'pt-dev-Attribution';
    const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

    const daily = [];
    const date = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(date);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const res = await docClient.send(new GetCommand({
        TableName: table,
        Key: { pk: `date#${dayStr}`, sk: `district#${district}` },
      }));
      const item = res.Item || null;
      daily.push({
        date: dayStr,
        fire_count: item?.fire_count ?? 0,
        frp_sum_mw: item?.frp_sum_mw ?? 0,
      });
    }

    // Simple trend: last day's fire_count vs the first non-zero day.
    const firstNonZero = daily.find((x) => x.fire_count > 0)?.fire_count;
    const last = daily[daily.length - 1]?.fire_count ?? 0;
    const trend_pct = firstNonZero ? Math.round(((last - firstNonZero) / firstNonZero) * 100) / 100 : 0;

    return { district, days, daily, trend_pct };
  } catch (err) {
    console.error('Failed to fetch fire trend:', err);
    throw err;
  }
};
