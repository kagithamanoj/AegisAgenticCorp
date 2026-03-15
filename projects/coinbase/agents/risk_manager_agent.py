"""
Risk Manager Agent — Emma
Reviews trade candidates, enforces risk, computes position sizes.
"""

import os
import logging
import json
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from datetime import datetime, timezone

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from risk_engine import RiskEngine, TradeCandidate, ApprovedTrade
from position_tracker import PositionTracker
from trade_logger import TradeLogger

logger = logging.getLogger(__name__)


class RiskManagerAgent:
    """
    Emma — Risk Manager Agent
    Protects capital at all costs. Gates every trade decision.
    """
    
    AGENT_NAME = 'Emma'
    
    def __init__(self, risk_engine: RiskEngine, trade_logger: TradeLogger):
        self.risk = risk_engine
        self.logger = trade_logger
    
    def review_candidates(self, candidates: List[TradeCandidate]) -> List[Tuple[bool, Optional[ApprovedTrade], str]]:
        """
        Review all trade candidates from Research Agent.
        Returns list of (approved, ApprovedTrade/None, reason) tuples.
        """
        results = []
        
        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='REVIEW_START',
            rationale=f"Reviewing {len(candidates)} candidates",
            details={'risk_status': self.risk.get_status()}
        )
        
        for candidate in candidates:
            approved, trade, reason = self.risk.evaluate_trade(candidate)
            
            if not approved:
                self.logger.log_decision(
                    agent=self.AGENT_NAME,
                    action='TRADE_REJECTED',
                    rationale=f"{candidate.product_id}: {reason}",
                    details={
                        'product_id': candidate.product_id,
                        'entry': candidate.entry_price,
                        'stop': candidate.stop_loss,
                        'target': candidate.take_profit,
                        'rr': candidate.reward_risk_ratio
                    }
                )
                logger.info(f"❌ {candidate.product_id} REJECTED: {reason}")
            else:
                logger.info(f"✅ {candidate.product_id} APPROVED: size={trade.size:.8f}, "
                           f"risk=${trade.risk_usd:.2f}")
            
            results.append((approved, trade, reason))
        
        approved_count = sum(1 for a, _, _ in results if a)
        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='REVIEW_COMPLETE',
            rationale=f"Approved {approved_count}/{len(candidates)} candidates"
        )
        
        return results

    def review_from_blackboard(self, session_id: str = None) -> List[Tuple[bool, Optional[ApprovedTrade], str]]:
        """
        Check blackboard/research/candidates.json and review them.
        Files the approved trades to blackboard/risk/approved.json.
        """
        blackboard_dir = Path(__file__).parent.parent / 'blackboard'
        input_file = blackboard_dir / 'research' / 'candidates.json'
        
        if not input_file.exists():
            return []
            
        logger.info(f"🧐 Emma reviewing candidates from {input_file}")
        
        try:
            with open(input_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            logger.error(f"Failed to read candidates from blackboard: {e}")
            return []
            
        candidates = []
        for d in data:
            # [v2026.2.21 Alignment] Filter by session_id if provided
            if session_id and d.get('session_id') != session_id:
                logger.debug(f"⏭️ Skipping candidate {d['product_id']} from different session: {d.get('session_id')}")
                continue

            candidates.append(TradeCandidate(
                product_id=d['product_id'],
                direction=d['direction'],
                entry_price=d['entry_price'],
                stop_loss=d['stop_loss'],
                take_profit=d['take_profit'],
                rationale=d['rationale']
            ))
            
        results = self.review_candidates(candidates)
        
        # File approved trades
        approved_trades = []
        for (approved, trade, reason), candidate in zip(results, candidates):
            if approved and trade:
                approved_trades.append({
                    'product_id': trade.product_id,
                    'size': trade.size,
                    'entry_price': trade.entry_price,
                    'stop_loss': trade.stop_loss,
                    'take_profit': trade.take_profit,
                    'risk_usd': trade.risk_usd,
                    'reason': reason,
                    'session_id': session_id,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                })
        
        if approved_trades:
            output_file = blackboard_dir / 'risk' / 'approved.json'
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w') as f:
                json.dump(approved_trades, f, indent=4)
            logger.info(f"✅ Emma filed {len(approved_trades)} approved trades to blackboard/risk/approved.json")
            
        # Clean up input file after processing
        input_file.unlink()
        
        return results
    
    def on_trade_fill(self, product_id: str, fill_price: float, size: float, 
                      fees: float, stop_loss: float, take_profit: float):
        """Called when Execution Agent reports a fill."""
        self.risk.positions.open_position(
            product_id=product_id,
            entry_price=fill_price,
            size=size,
            stop_loss=stop_loss,
            take_profit=take_profit,
            fees=fees
        )
        
        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='POSITION_OPENED',
            rationale=f"Tracking new position: {size:.8f} {product_id} @ ${fill_price:,.2f}",
            details={
                'product_id': product_id,
                'size': size,
                'entry': fill_price,
                'stop': stop_loss,
                'target': take_profit,
                'exposure_after': self.risk.positions.get_total_exposure()
            }
        )
    
    def on_trade_exit(self, product_id: str, exit_price: float, exit_type: str, fees: float = 0):
        """Called when a position is closed (stop, target, or manual)."""
        closed = self.risk.positions.close_position(product_id, exit_price, exit_type, fees)
        
        if closed:
            pnl = closed['pnl']
            
            # Record loss for 24hr tracking
            if pnl < 0:
                self.risk.record_loss(pnl)
            
            self.logger.log_trade(
                trade_type=f'exit_{exit_type}',
                product_id=product_id,
                side='sell',
                size=closed['size'],
                price=exit_price,
                fees=fees,
                agent=self.AGENT_NAME,
                rationale=f"Exit {exit_type}: P&L ${pnl:+.2f}",
                details=closed
            )
            
            self.logger.log_decision(
                agent=self.AGENT_NAME,
                action='POSITION_CLOSED',
                rationale=f"{product_id} closed ({exit_type}): P&L ${pnl:+.2f}",
                details={
                    'pnl': pnl,
                    'exit_type': exit_type,
                    'total_realized_pnl': self.risk.positions.total_realized_pnl,
                    'loss_24hr': self.risk._get_24hr_total_loss()
                }
            )
        
        return closed
    
    def check_positions(self, current_prices: Dict[str, float]):
        """Check all open positions for stop-loss or take-profit triggers."""
        triggers = []
        
        for pid, pos in list(self.risk.positions.open_positions.items()):
            price = current_prices.get(pid)
            if price is None:
                continue
            
            if price <= pos.stop_loss:
                triggers.append(('stop', pid, price))
                logger.warning(f"🔴 STOP-LOSS triggered: {pid} @ ${price:,.2f} (stop: ${pos.stop_loss:,.2f})")
            elif price >= pos.take_profit:
                triggers.append(('target', pid, price))
                logger.info(f"🟢 TAKE-PROFIT triggered: {pid} @ ${price:,.2f} (target: ${pos.take_profit:,.2f})")
        
        return triggers
    
    def emergency_close_all(self) -> List[str]:
        """Emergency: request closure of all positions."""
        positions_to_close = list(self.risk.positions.open_positions.keys())
        
        if positions_to_close:
            self.logger.log_decision(
                agent=self.AGENT_NAME,
                action='EMERGENCY_CLOSE_ALL',
                rationale=f"Closing {len(positions_to_close)} positions: {', '.join(positions_to_close)}",
                details={'risk_status': self.risk.get_status()}
            )
        
        return positions_to_close
    
    def should_halt(self) -> Tuple[bool, str]:
        """Check if trading should be halted."""
        if self.risk.trading_halted:
            return True, self.risk.halt_reason
        
        if self.risk.check_daily_drawdown():
            return True, self.risk.halt_reason
        
        return False, ''
    
    def get_status_report(self) -> Dict:
        """Get comprehensive status report."""
        return {
            'agent': self.AGENT_NAME,
            'risk_status': self.risk.get_status(),
            'positions': self.risk.positions.get_all_positions(),
            'realized_pnl': self.risk.positions.total_realized_pnl,
            'total_fees': self.risk.positions.total_fees
        }
