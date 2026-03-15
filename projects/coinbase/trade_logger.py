"""
Trade Logger — Decision & Trade Logging System
Every agent decision is logged with timestamp, market state, rationale, and outcome.
"""

import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class TradeLogger:
    """JSON-based trade and decision logger."""
    
    def __init__(self, reports_dir: str = None):
        self.reports_dir = Path(reports_dir or os.getenv('REPORTS_DIR', 'reports'))
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self._today_file = None
        self._today_date = None
    
    def _get_today_file(self) -> Path:
        """Get or create today's log file."""
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        if today != self._today_date:
            self._today_date = today
            self._today_file = self.reports_dir / f"{today}.json"
            if not self._today_file.exists():
                self._write_file(self._today_file, {
                    'date': today,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'decisions': [],
                    'trades': [],
                    'daily_summary': None
                })
        return self._today_file
    
    def _read_file(self, path: Path) -> Dict:
        """Read JSON log file."""
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {'decisions': [], 'trades': [], 'daily_summary': None}
    
    def _write_file(self, path: Path, data: Dict):
        """Write JSON log file."""
        with open(path, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    
    def log_decision(self, agent: str, action: str, rationale: str, 
                     market_state: Dict = None, details: Dict = None):
        """Log an agent decision."""
        entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'agent': agent,
            'action': action,
            'rationale': rationale,
            'market_state': market_state or {},
            'details': details or {}
        }
        
        log_file = self._get_today_file()
        data = self._read_file(log_file)
        data['decisions'].append(entry)
        self._write_file(log_file, data)
        
        logger.info(f"[{agent}] {action}: {rationale}")
        return entry
    
    def log_trade(self, trade_type: str, product_id: str, side: str,
                  size: float, price: float, fees: float = 0,
                  order_id: str = None, rationale: str = '',
                  agent: str = 'Dev', details: Dict = None):
        """Log a trade execution."""
        entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'type': trade_type,  # 'entry', 'exit_stop', 'exit_target', 'exit_manual'
            'product_id': product_id,
            'side': side,  # 'buy' or 'sell'
            'size': size,
            'price': price,
            'notional': size * price,
            'fees': fees,
            'order_id': order_id,
            'agent': agent,
            'rationale': rationale,
            'details': details or {}
        }
        
        log_file = self._get_today_file()
        data = self._read_file(log_file)
        data['trades'].append(entry)
        self._write_file(log_file, data)
        
        logger.info(f"[TRADE] {trade_type} {side} {size:.8f} {product_id} @ ${price:,.2f} (fees: ${fees:.4f})")
        return entry
    
    def log_daily_summary(self, summary: Dict):
        """Write end-of-day summary."""
        log_file = self._get_today_file()
        data = self._read_file(log_file)
        data['daily_summary'] = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            **summary
        }
        self._write_file(log_file, data)
        logger.info(f"[SUMMARY] Daily P&L: ${summary.get('daily_pnl', 0):+.2f}")
    
    def get_today_trades(self) -> List[Dict]:
        """Get all trades from today."""
        log_file = self._get_today_file()
        data = self._read_file(log_file)
        return data.get('trades', [])
    
    def get_today_decisions(self) -> List[Dict]:
        """Get all decisions from today."""
        log_file = self._get_today_file()
        data = self._read_file(log_file)
        return data.get('decisions', [])
