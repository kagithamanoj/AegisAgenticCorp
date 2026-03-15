"""
Trade Dashboard — CSV + HTML trade log with colors.
Generates a beautiful, visual trade report that auto-updates.
"""

import csv
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


class TradeDashboard:
    """
    Generates and maintains a colorful CSV + HTML trade dashboard.
    - BUY = blue, SELL = orange
    - Profit = green, Loss = red
    - Auto-updates after every trade
    """
    
    def __init__(self, reports_dir: str = None):
        self.reports_dir = Path(reports_dir or os.getenv('REPORTS_DIR', 'reports'))
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.csv_file = self.reports_dir / 'trades.csv'
        self.html_file = self.reports_dir / 'dashboard.html'
        self.trades: List[Dict] = []
        
        # Initialize CSV if new
        if not self.csv_file.exists():
            self._write_csv_header()
    
    def _write_csv_header(self):
        """Write CSV header row."""
        with open(self.csv_file, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Timestamp', 'Cycle', 'Type', 'Side', 'Product', 
                'Size', 'Price', 'Notional', 'Fees',
                'Stop Loss', 'Take Profit', 'P&L', 'P&L %',
                'Equity After', 'Status', 'Rationale'
            ])
    
    def log_trade(self, trade_type: str, side: str, product_id: str,
                  size: float, price: float, notional: float = 0,
                  fees: float = 0, stop_loss: float = 0, take_profit: float = 0,
                  pnl: float = None, pnl_pct: float = None,
                  equity_after: float = 0, status: str = '',
                  rationale: str = '', cycle: int = 0):
        """Log a trade to CSV and rebuild HTML."""
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        
        row = {
            'timestamp': timestamp,
            'cycle': cycle,
            'type': trade_type,
            'side': side,
            'product_id': product_id,
            'size': size,
            'price': price,
            'notional': notional or (size * price),
            'fees': fees,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'pnl': pnl if pnl is not None else '',
            'pnl_pct': pnl_pct if pnl_pct is not None else '',
            'equity_after': equity_after,
            'status': status,
            'rationale': rationale
        }
        
        self.trades.append(row)
        
        # Append to CSV
        with open(self.csv_file, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                row['timestamp'], row['cycle'], row['type'], row['side'],
                row['product_id'], f"{row['size']:.8f}", f"${row['price']:,.2f}",
                f"${row['notional']:,.2f}", f"${row['fees']:.4f}",
                f"${row['stop_loss']:,.2f}" if row['stop_loss'] else '',
                f"${row['take_profit']:,.2f}" if row['take_profit'] else '',
                f"${row['pnl']:+.2f}" if isinstance(row['pnl'], (int, float)) else '',
                f"{row['pnl_pct']:+.1f}%" if isinstance(row['pnl_pct'], (int, float)) else '',
                f"${row['equity_after']:,.2f}" if row['equity_after'] else '',
                row['status'], row['rationale']
            ])
        
        # Rebuild HTML dashboard
        self._rebuild_html()
    
    def log_funding(self, atom_sold: float, atom_price: float, usd_received: float,
                    budget_remaining: float, equity_after: float, cycle: int = 0):
        """Log ATOM funding event."""
        self.log_trade(
            trade_type='FUND',
            side='SELL',
            product_id='ATOM-USD',
            size=atom_sold,
            price=atom_price,
            notional=usd_received,
            fees=usd_received * 0.006,
            equity_after=equity_after,
            status=f'Budget: ${budget_remaining:.2f} left',
            rationale=f'Sold ATOM for trading capital',
            cycle=cycle
        )
    
    def _rebuild_html(self):
        """Rebuild the HTML dashboard with all trades."""
        total_pnl = sum(t['pnl'] for t in self.trades if isinstance(t['pnl'], (int, float)))
        total_fees = sum(t['fees'] for t in self.trades)
        buys = sum(1 for t in self.trades if t['side'] == 'BUY')
        sells = sum(1 for t in self.trades if t['side'] == 'SELL')
        wins = sum(1 for t in self.trades if isinstance(t['pnl'], (int, float)) and t['pnl'] > 0)
        losses = sum(1 for t in self.trades if isinstance(t['pnl'], (int, float)) and t['pnl'] < 0)
        
        # Build table rows
        rows_html = ''
        for t in reversed(self.trades):  # Newest first
            side_class = 'buy' if t['side'] == 'BUY' else 'sell'
            pnl_class = ''
            pnl_str = ''
            pnl_pct_str = ''
            
            if isinstance(t['pnl'], (int, float)):
                pnl_class = 'profit' if t['pnl'] >= 0 else 'loss'
                pnl_str = f"${t['pnl']:+.2f}"
                if isinstance(t['pnl_pct'], (int, float)):
                    pnl_pct_str = f"{t['pnl_pct']:+.1f}%"
            
            rows_html += f'''
            <tr class="{side_class}">
                <td>{t['timestamp']}</td>
                <td>#{t['cycle']}</td>
                <td><span class="badge {t['type'].lower()}">{t['type']}</span></td>
                <td><span class="badge {side_class}">{t['side']}</span></td>
                <td class="product">{t['product_id']}</td>
                <td class="num">{t['size']:.6f}</td>
                <td class="num">${t['price']:,.2f}</td>
                <td class="num">${t['notional']:,.2f}</td>
                <td class="num fee">${t['fees']:.4f}</td>
                <td class="num {pnl_class}">{pnl_str}</td>
                <td class="num {pnl_class}">{pnl_pct_str}</td>
                <td class="num">${t['equity_after']:,.2f}</td>
                <td class="rationale">{t['rationale'][:50]}</td>
            </tr>'''
        
        pnl_color = '#00e676' if total_pnl >= 0 else '#ff1744'
        latest_equity = self.trades[-1]['equity_after'] if self.trades else 0
        
        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenClaw Trading Dashboard</title>
    <meta http-equiv="refresh" content="30">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
            background: #0a0a0f;
            color: #e0e0e0;
            padding: 20px;
        }}
        h1 {{
            font-size: 24px;
            color: #fff;
            margin-bottom: 5px;
        }}
        .subtitle {{
            color: #888;
            font-size: 12px;
            margin-bottom: 20px;
        }}
        .stats {{
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
            flex-wrap: wrap;
        }}
        .stat-card {{
            background: #1a1a2e;
            border: 1px solid #2a2a3e;
            border-radius: 8px;
            padding: 12px 18px;
            min-width: 140px;
        }}
        .stat-card .label {{
            font-size: 10px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        .stat-card .value {{
            font-size: 22px;
            font-weight: bold;
            margin-top: 4px;
        }}
        .stat-card .value.profit {{ color: #00e676; }}
        .stat-card .value.loss {{ color: #ff1744; }}
        .stat-card .value.neutral {{ color: #fff; }}
        .stat-card .value.blue {{ color: #448aff; }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }}
        thead th {{
            background: #1a1a2e;
            color: #aaa;
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #2a2a3e;
            position: sticky;
            top: 0;
        }}
        tbody td {{
            padding: 7px 10px;
            border-bottom: 1px solid #1a1a2e;
        }}
        tr:hover {{ background: #1a1a2e; }}
        .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .product {{ font-weight: bold; color: #fff; }}
        .rationale {{ color: #888; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
        .fee {{ color: #ff9800; }}
        .profit {{ color: #00e676 !important; font-weight: bold; }}
        .loss {{ color: #ff1744 !important; font-weight: bold; }}
        .badge {{
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
        }}
        .badge.buy {{ background: #1a237e; color: #448aff; }}
        .badge.sell {{ background: #4a1a00; color: #ff9800; }}
        .badge.fund {{ background: #1a3a1a; color: #66bb6a; }}
        .badge.entry {{ background: #1a237e; color: #448aff; }}
        .badge.exit_stop {{ background: #4a0000; color: #ff1744; }}
        .badge.exit_target {{ background: #004a00; color: #00e676; }}
        .badge.exit_manual {{ background: #3a3a00; color: #ffeb3b; }}
        .badge.exit_shutdown {{ background: #2a2a2a; color: #aaa; }}
        .target {{ 
            background: linear-gradient(135deg, #1b5e20 0%, #004d40 100%);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 16px;
            color: #69f0ae;
        }}
        .footer {{
            margin-top: 20px;
            color: #555;
            font-size: 11px;
        }}
    </style>
</head>
<body>
    <h1>🚀 OpenClaw Trading Dashboard</h1>
    <p class="subtitle">ATOM-Funded Micro Trades | Max Loss: $20 | Target: <span class="target">🎯 $1,000</span> | Auto-refreshes every 30s</p>
    
    <div class="stats">
        <div class="stat-card">
            <div class="label">Equity</div>
            <div class="value neutral">${latest_equity:,.2f}</div>
        </div>
        <div class="stat-card">
            <div class="label">Total P&L</div>
            <div class="value {'profit' if total_pnl >= 0 else 'loss'}">${total_pnl:+.2f}</div>
        </div>
        <div class="stat-card">
            <div class="label">Total Fees</div>
            <div class="value" style="color: #ff9800">${total_fees:.2f}</div>
        </div>
        <div class="stat-card">
            <div class="label">Trades</div>
            <div class="value blue">{len(self.trades)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Buys / Sells</div>
            <div class="value neutral">{buys} / {sells}</div>
        </div>
        <div class="stat-card">
            <div class="label">Win / Loss</div>
            <div class="value neutral">{wins}W / {losses}L</div>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Time (UTC)</th>
                <th>Cycle</th>
                <th>Type</th>
                <th>Side</th>
                <th>Product</th>
                <th>Size</th>
                <th>Price</th>
                <th>Notional</th>
                <th>Fees</th>
                <th>P&L</th>
                <th>P&L %</th>
                <th>Equity</th>
                <th>Rationale</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>
    
    <p class="footer">
        Last updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')} | 
        Dashboard auto-refreshes every 30 seconds | 
        CSV: <a href="trades.csv" style="color: #448aff">trades.csv</a>
    </p>
</body>
</html>'''
        
        with open(self.html_file, 'w') as f:
            f.write(html)
