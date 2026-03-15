"""
Position Tracker — Tracks open positions, realized/unrealized P&L
Syncs with Coinbase /accounts and /orders/historical/fills
"""

import os
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Position:
    """Represents an open position."""
    product_id: str
    side: str  # 'long'
    entry_price: float
    size: float
    stop_loss: float
    take_profit: float
    entry_time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    order_id: str = ''
    stop_order_id: str = ''
    tp_order_id: str = ''
    fees_paid: float = 0.0
    
    @property
    def notional(self) -> float:
        return self.size * self.entry_price
    
    def unrealized_pnl(self, current_price: float) -> float:
        """Calculate true net unrealized P&L at current price (deducts expected exit fee)."""
        if self.side == 'long':
            expected_exit_fee = current_price * self.size * 0.006
            return (current_price - self.entry_price) * self.size - self.fees_paid - expected_exit_fee
        return 0
    
    def risk_amount(self) -> float:
        """Calculate risk amount (distance to stop × size plus fees)."""
        expected_exit_fee = self.stop_loss * self.size * 0.006
        return abs(self.entry_price - self.stop_loss) * self.size + self.fees_paid + expected_exit_fee
    
    def to_dict(self) -> Dict:
        return {
            'product_id': self.product_id,
            'side': self.side,
            'entry_price': self.entry_price,
            'size': self.size,
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit,
            'entry_time': self.entry_time,
            'order_id': self.order_id,
            'notional': self.notional,
            'fees_paid': self.fees_paid
        }


class PositionTracker:
    """Tracks all open positions and P&L."""
    
    def __init__(self):
        self.open_positions: Dict[str, Position] = {}  # product_id -> Position
        self.closed_trades: List[Dict] = []
        self.total_realized_pnl: float = 0.0
        self.total_fees: float = 0.0
    
    def open_position(self, product_id: str, entry_price: float, size: float,
                      stop_loss: float, take_profit: float, side: str = 'long',
                      order_id: str = '', fees: float = 0.0) -> Position:
        """Record a new open position."""
        if product_id in self.open_positions:
            logger.warning(f"Position already open for {product_id}, replacing")
        
        pos = Position(
            product_id=product_id,
            side=side,
            entry_price=entry_price,
            size=size,
            stop_loss=stop_loss,
            take_profit=take_profit,
            order_id=order_id,
            fees_paid=fees
        )
        self.open_positions[product_id] = pos
        self.total_fees += fees
        logger.info(f"Opened {side} {size:.8f} {product_id} @ ${entry_price:,.2f} "
                     f"(SL: ${stop_loss:,.2f}, TP: ${take_profit:,.2f})")
        return pos
    
    def close_position(self, product_id: str, exit_price: float, 
                       exit_type: str = 'manual', fees: float = 0.0) -> Optional[Dict]:
        """Close a position and record realized P&L."""
        if product_id not in self.open_positions:
            logger.warning(f"No open position for {product_id}")
            return None
        
        pos = self.open_positions.pop(product_id)
        # Calculate raw realized P&L exactly (gross profit - entry fees - exact exit fees)
        if pos.side == 'long':
            pnl = (exit_price - pos.entry_price) * pos.size - pos.fees_paid - fees
        else:
            pnl = 0.0
        
        closed = {
            'product_id': product_id,
            'side': pos.side,
            'entry_price': pos.entry_price,
            'exit_price': exit_price,
            'size': pos.size,
            'pnl': pnl,
            'fees': pos.fees_paid + fees,
            'entry_time': pos.entry_time,
            'exit_time': datetime.now(timezone.utc).isoformat(),
            'exit_type': exit_type,  # 'stop', 'target', 'manual', 'emergency'
            'hold_duration_info': 'calculated at close'
        }
        
        self.closed_trades.append(closed)
        self.total_realized_pnl += pnl
        self.total_fees += fees
        
        logger.info(f"Closed {product_id} @ ${exit_price:,.2f} | "
                     f"P&L: ${pnl:+.2f} | Type: {exit_type}")
        return closed
    
    def get_total_exposure(self) -> float:
        """Get total notional exposure across all positions."""
        return sum(pos.notional for pos in self.open_positions.values())
    
    def get_total_unrealized_pnl(self, prices: Dict[str, float]) -> float:
        """Get total unrealized P&L given current prices."""
        total = 0.0
        for pid, pos in self.open_positions.items():
            if pid in prices:
                total += pos.unrealized_pnl(prices[pid])
        return total
    
    def get_position_count(self) -> int:
        """Get number of open positions."""
        return len(self.open_positions)
    
    def has_position(self, product_id: str) -> bool:
        """Check if a position is open for a product."""
        return product_id in self.open_positions
    
    def get_position(self, product_id: str) -> Optional[Position]:
        """Get an open position."""
        return self.open_positions.get(product_id)
    
    def get_all_positions(self) -> List[Dict]:
        """Get all open positions as dicts."""
        return [pos.to_dict() for pos in self.open_positions.values()]
    
    def get_summary(self, prices: Dict[str, float] = None) -> Dict:
        """Get portfolio summary."""
        prices = prices or {}
        return {
            'open_positions': self.get_position_count(),
            'total_exposure': self.get_total_exposure(),
            'unrealized_pnl': self.get_total_unrealized_pnl(prices),
            'realized_pnl': self.total_realized_pnl,
            'total_fees': self.total_fees,
            'closed_trade_count': len(self.closed_trades),
            'positions': self.get_all_positions()
        }
