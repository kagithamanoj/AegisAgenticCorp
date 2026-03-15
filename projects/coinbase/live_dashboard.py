"""
Live Trading Dashboard Server
Serves a real-time HTML dashboard that auto-refreshes with system status,
trade log, and cycle activity.
"""

import http.server
import json
import os
import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone

PORT = 8888
PROJECT_DIR = Path(__file__).parent
REPORTS_DIR = PROJECT_DIR / 'reports'


def get_log_tail(n=40):
    """Get last N lines from the latest log."""
    log_file = REPORTS_DIR / 'latest.log'
    if not log_file.exists():
        # Try to find any log
        logs = sorted(REPORTS_DIR.glob('latest*.log'), key=os.path.getmtime, reverse=True)
        if logs:
            log_file = logs[0]
        else:
            return []
    
    try:
        with open(log_file, 'r') as f:
            lines = f.readlines()
        return [l.strip() for l in lines[-n:]]
    except:
        return []


def get_trade_data():
    """Load today's trade decisions from JSON."""
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    json_file = REPORTS_DIR / f'{today}.json'
    if json_file.exists():
        with open(json_file, 'r') as f:
            return json.load(f)
    return {"decisions": []}


def get_csv_trades():
    """Load trade history from CSV."""
    csv_file = REPORTS_DIR / 'trades.csv'
    if not csv_file.exists():
        return []
    trades = []
    with open(csv_file, 'r') as f:
        import csv
        reader = csv.DictReader(f)
        for row in reader:
            trades.append(row)
    return trades


def parse_log_line(line):
    """Parse a log line into structured data with color hints."""
    if '🔄 CYCLE' in line:
        return 'cycle', line
    elif '📭 No trade setups' in line:
        return 'info', line
    elif '🔭 Discovery Complete' in line:
        return 'discovery', line
    elif '🔭 Dynamic Market' in line:
        return 'discovery', line
    elif '📊' in line or 'Setup found' in line:
        return 'signal', line
    elif '🧠' in line:
        return 'ai', line
    elif '❌' in line or 'ERROR' in line:
        return 'error', line
    elif '⚡' in line or 'FILLED' in line:
        return 'trade', line
    elif '💤 Sleeping' in line:
        return 'sleep', line
    elif '🚀' in line or 'SYSTEM' in line:
        return 'system', line
    elif '💰' in line or '💸' in line:
        return 'fund', line
    elif '🧵 Session' in line:
        return 'session', line
    elif '✨' in line or '📰' in line:
        return 'content', line
    elif '────' in line or '═══' in line:
        return 'divider', line
    else:
        return 'default', line


def build_dashboard_html():
    """Build the full live dashboard HTML."""
    log_lines = get_log_tail(50)
    trade_data = get_trade_data()
    csv_trades = get_csv_trades()
    
    decisions = trade_data.get('decisions', [])
    
    # Extract latest status from decisions
    latest_status = {}
    total_cycles = 0
    total_scanned = 0
    total_candidates = 0
    for d in reversed(decisions):
        if d.get('action') == 'CYCLE_START' and not latest_status:
            latest_status = d.get('details', {}).get('risk_status', {})
            # Extract cycle number
            match = re.search(r'Cycle (\d+)', d.get('rationale', ''))
            if match:
                total_cycles = int(match.group(1))
        if d.get('action') == 'MARKET_SCAN_COMPLETE':
            match = re.search(r'Found (\d+) candidates from (\d+) pairs', d.get('rationale', ''))
            if match and total_scanned == 0:
                total_candidates = int(match.group(1))
                total_scanned = int(match.group(2))

    equity = latest_status.get('equity', 0)
    total_pnl = latest_status.get('total_pnl', 0)
    total_pnl_pct = latest_status.get('total_pnl_pct', 0)
    exposure = latest_status.get('exposure', 0)
    exposure_pct = latest_status.get('exposure_pct', 0)
    open_positions = latest_status.get('open_positions', 0)
    trading_halted = latest_status.get('trading_halted', False)
    loss_24hr = latest_status.get('loss_24hr', 0)
    
    pnl_class = 'profit' if total_pnl >= 0 else 'loss'
    status_class = 'halted' if trading_halted else 'active'
    status_text = '🔴 HALTED' if trading_halted else '🟢 ACTIVE'
    
    # Build log feed
    log_html = ''
    color_map = {
        'cycle': '#64b5f6',
        'info': '#90a4ae',
        'discovery': '#ce93d8',
        'signal': '#ffd54f',
        'ai': '#4fc3f7',
        'error': '#ef5350',
        'trade': '#66bb6a',
        'sleep': '#546e7a',
        'system': '#fff176',
        'fund': '#ffb74d',
        'session': '#78909c',
        'content': '#a5d6a7',
        'divider': '#37474f',
        'default': '#78909c',
    }
    
    for line in log_lines:
        cat, text = parse_log_line(line)
        color = color_map.get(cat, '#78909c')
        # Escape HTML
        text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        if cat == 'divider':
            log_html += f'<div class="log-line divider">{text}</div>\n'
        elif cat == 'error':
            log_html += f'<div class="log-line error">{text}</div>\n'
        else:
            log_html += f'<div class="log-line" style="color: {color}">{text}</div>\n'
    
    # Build trade history rows
    trade_rows = ''
    for t in reversed(csv_trades[-20:]):
        side = t.get('Side', '')
        side_class = 'buy' if side == 'BUY' else 'sell'
        pnl_val = t.get('P&L', '')
        pnl_td_class = ''
        if pnl_val:
            pnl_td_class = 'profit' if not pnl_val.startswith('-') else 'loss'
        
        trade_rows += f'''
        <tr class="{side_class}">
            <td>{t.get('Timestamp', '')}</td>
            <td>#{t.get('Cycle', '')}</td>
            <td><span class="badge {t.get('Type', '').lower()}">{t.get('Type', '')}</span></td>
            <td><span class="badge {side_class}">{side}</span></td>
            <td class="product">{t.get('Product', '')}</td>
            <td class="num">{t.get('Price', '')}</td>
            <td class="num">{t.get('Notional', '')}</td>
            <td class="num fee">{t.get('Fees', '')}</td>
            <td class="num {pnl_td_class}">{pnl_val}</td>
            <td class="num">{t.get('Equity After', '')}</td>
            <td class="rationale">{t.get('Rationale', '')[:60]}</td>
        </tr>'''

    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenClaw Live Dashboard</title>
    <meta http-equiv="refresh" content="10">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0a0a12;
            color: #c8cad0;
            min-height: 100vh;
        }}
        .header {{
            background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
            border-bottom: 1px solid rgba(99, 179, 237, 0.15);
            padding: 18px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .header h1 {{
            font-size: 20px;
            color: #fff;
            font-weight: 700;
            letter-spacing: -0.5px;
        }}
        .header h1 span {{ color: #63b3ed; }}
        .header .status {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .header .status-badge {{
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
        }}
        .header .status-badge.active {{
            background: rgba(72, 187, 120, 0.15);
            color: #68d391;
            border: 1px solid rgba(72, 187, 120, 0.3);
        }}
        .header .status-badge.halted {{
            background: rgba(245, 101, 101, 0.15);
            color: #fc8181;
            border: 1px solid rgba(245, 101, 101, 0.3);
        }}
        .header .time {{
            color: #718096;
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
        }}
        .container {{ padding: 20px 28px; }}
        
        /* Stat Cards */
        .stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin-bottom: 24px;
        }}
        .stat-card {{
            background: linear-gradient(145deg, #12141d 0%, #1a1d2e 100%);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 16px 20px;
            transition: transform 0.2s, border-color 0.2s;
        }}
        .stat-card:hover {{
            transform: translateY(-2px);
            border-color: rgba(99, 179, 237, 0.2);
        }}
        .stat-card .label {{
            font-size: 10px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            font-weight: 600;
        }}
        .stat-card .value {{
            font-size: 26px;
            font-weight: 700;
            margin-top: 6px;
            font-family: 'JetBrains Mono', monospace;
        }}
        .stat-card .sub {{ font-size: 11px; color: #718096; margin-top: 2px; }}
        .profit {{ color: #68d391 !important; }}
        .loss {{ color: #fc8181 !important; }}
        .neutral {{ color: #e2e8f0; }}
        .blue {{ color: #63b3ed; }}
        .orange {{ color: #f6ad55; }}
        .purple {{ color: #b794f4; }}
        
        /* Two Column Layout */
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }}
        @media (max-width: 1200px) {{ .grid {{ grid-template-columns: 1fr; }} }}
        
        .panel {{
            background: linear-gradient(145deg, #12141d 0%, #1a1d2e 100%);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            overflow: hidden;
        }}
        .panel-header {{
            padding: 12px 18px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid rgba(255,255,255,0.04);
            font-size: 13px;
            font-weight: 600;
            color: #a0aec0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .panel-header .count {{
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            color: #4a5568;
        }}
        
        /* Log Feed */
        .log-feed {{
            padding: 12px 16px;
            max-height: 450px;
            overflow-y: auto;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            line-height: 1.6;
        }}
        .log-feed::-webkit-scrollbar {{ width: 4px; }}
        .log-feed::-webkit-scrollbar-track {{ background: transparent; }}
        .log-feed::-webkit-scrollbar-thumb {{ background: #2d3748; border-radius: 2px; }}
        .log-line {{ padding: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
        .log-line.divider {{ color: #2d3748 !important; }}
        .log-line.error {{ color: #fc8181 !important; background: rgba(245,101,101,0.05); padding: 2px 4px; border-radius: 3px; }}
        
        /* Trade Table */
        .trade-table-wrap {{
            max-height: 450px;
            overflow-y: auto;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
        }}
        thead th {{
            background: rgba(0,0,0,0.3);
            color: #718096;
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 9px;
            letter-spacing: 0.8px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            position: sticky;
            top: 0;
        }}
        tbody td {{
            padding: 6px 10px;
            border-bottom: 1px solid rgba(255,255,255,0.02);
        }}
        tr:hover {{ background: rgba(99, 179, 237, 0.03); }}
        .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .product {{ font-weight: 600; color: #e2e8f0; }}
        .rationale {{ color: #718096; font-size: 10px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
        .fee {{ color: #f6ad55; }}
        .badge {{
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .badge.buy {{ background: rgba(99,179,237,0.15); color: #63b3ed; }}
        .badge.sell {{ background: rgba(246,173,85,0.15); color: #f6ad55; }}
        .badge.fund {{ background: rgba(104,211,145,0.15); color: #68d391; }}
        .badge.entry {{ background: rgba(99,179,237,0.15); color: #63b3ed; }}
        
        .empty-state {{
            text-align: center;
            padding: 60px 20px;
            color: #4a5568;
        }}
        .empty-state .icon {{ font-size: 36px; margin-bottom: 10px; }}
        .empty-state p {{ font-size: 13px; }}
        
        .footer {{
            text-align: center;
            padding: 14px;
            color: #4a5568;
            font-size: 10px;
            font-family: 'JetBrains Mono', monospace;
        }}
        .pulse {{
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #68d391;
            animation: pulse-anim 2s infinite;
            margin-right: 6px;
        }}
        @keyframes pulse-anim {{
            0%, 100% {{ opacity: 1; box-shadow: 0 0 0 0 rgba(104,211,145,0.6); }}
            50% {{ opacity: 0.7; box-shadow: 0 0 0 8px rgba(104,211,145,0); }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 <span>OpenClaw</span> Live Trading Dashboard</h1>
        <div class="status">
            <span class="status-badge {status_class}">{status_text}</span>
            <span class="time">{now}</span>
        </div>
    </div>
    
    <div class="container">
        <div class="stats">
            <div class="stat-card">
                <div class="label">Equity</div>
                <div class="value neutral">${equity:,.2f}</div>
                <div class="sub">Starting: $10.00</div>
            </div>
            <div class="stat-card">
                <div class="label">Total P&L</div>
                <div class="value {pnl_class}">${total_pnl:+,.2f}</div>
                <div class="sub">{total_pnl_pct:+.1f}%</div>
            </div>
            <div class="stat-card">
                <div class="label">24hr Loss</div>
                <div class="value orange">${loss_24hr:.2f}</div>
                <div class="sub">Max: $20.00</div>
            </div>
            <div class="stat-card">
                <div class="label">Exposure</div>
                <div class="value blue">${exposure:.2f}</div>
                <div class="sub">{exposure_pct:.1f}%</div>
            </div>
            <div class="stat-card">
                <div class="label">Positions</div>
                <div class="value neutral">{open_positions}</div>
            </div>
            <div class="stat-card">
                <div class="label">Cycles Today</div>
                <div class="value purple">{total_cycles}</div>
                <div class="sub">{total_scanned} pairs scanned</div>
            </div>
        </div>
        
        <div class="grid">
            <div class="panel">
                <div class="panel-header">
                    <span>📡 Live Activity Feed</span>
                    <span class="count"><span class="pulse"></span>Auto-refresh 10s</span>
                </div>
                <div class="log-feed" id="logFeed">
                    {log_html if log_html else '<div class="empty-state"><div class="icon">📡</div><p>Waiting for activity...</p></div>'}
                </div>
            </div>
            
            <div class="panel">
                <div class="panel-header">
                    <span>💰 Trade History</span>
                    <span class="count">{len(csv_trades)} trades</span>
                </div>
                <div class="trade-table-wrap">
                    {'<table><thead><tr><th>Time</th><th>Cycle</th><th>Type</th><th>Side</th><th>Product</th><th>Price</th><th>Notional</th><th>Fees</th><th>P&L</th><th>Equity</th><th>Rationale</th></tr></thead><tbody>' + trade_rows + '</tbody></table>' if trade_rows else '<div class="empty-state"><div class="icon">🎯</div><p>No trades yet — Alex is hunting...</p></div>'}
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        OpenClaw Crypto Trading System | Scanning 751 pairs every 2 minutes | 
        Auto-refreshes every 10 seconds
    </div>
    
    <script>
        // Auto-scroll log to bottom
        const feed = document.getElementById('logFeed');
        if (feed) feed.scrollTop = feed.scrollHeight;
    </script>
</body>
</html>'''
    return html


class DashboardHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/dashboard':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            html = build_dashboard_html()
            self.wfile.write(html.encode())
        elif self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            data = get_trade_data()
            self.wfile.write(json.dumps(data, indent=2).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Suppress request logs


if __name__ == '__main__':
    print(f"\n{'='*50}")
    print(f"🚀 OpenClaw Live Dashboard")
    print(f"{'='*50}")
    print(f"   URL: http://localhost:{PORT}")
    print(f"   Auto-refreshes every 10 seconds")
    print(f"   Press Ctrl+C to stop")
    print(f"{'='*50}\n")
    
    server = http.server.HTTPServer(('', PORT), DashboardHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Dashboard server stopped.")
        server.server_close()
