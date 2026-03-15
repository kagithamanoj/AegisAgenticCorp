"""
Risk Engine — Core Risk Management Logic
Enforces all hard constraints: per-trade risk, exposure limits, drawdown, 24hr loss cap.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

try:
    from .position_tracker import PositionTracker
    from .trade_logger import TradeLogger
except ImportError:
    from position_tracker import PositionTracker
    from trade_logger import TradeLogger

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[3]))  # Access root for models
try:
    from models.minimax import MinimaxOpenClawAgent
except ImportError:
    logger.warning("Minimax models not found, Risk AI validation disabled")
    MinimaxOpenClawAgent = None

logger = logging.getLogger(__name__)


@dataclass
class TradeCandidate:
    """A candidate trade proposed by the Research Agent."""
    product_id: str
    direction: str  # 'long'
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_usd: float = 0.0
    risk_pct: float = 0.0
    reward_risk_ratio: float = 0.0
    rationale: str = ''
    signals: Dict = None
    
    def __post_init__(self):
        if self.signals is None:
            self.signals = {}
        # Calculate derived fields (including exact 0.6% round-trip fees)
        entry_fee = self.entry_price * 0.006
        stop_fee = self.stop_loss * 0.006
        target_fee = self.take_profit * 0.006
        
        risk_per_unit = abs(self.entry_price - self.stop_loss) + entry_fee + stop_fee
        reward_per_unit = abs(self.take_profit - self.entry_price) - entry_fee - target_fee
        
        if risk_per_unit > 0:
            self.reward_risk_ratio = reward_per_unit / risk_per_unit


@dataclass
class ApprovedTrade:
    """A trade approved by the Risk Manager with exact parameters."""
    product_id: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    size: float  # In base currency (e.g., BTC)
    risk_usd: float
    notional: float
    rationale: str = ''


class RiskEngine:
    """
    Core risk management engine.
    Enforces all hard constraints and approves/rejects trades.
    """
    
    def __init__(self, position_tracker: PositionTracker, trade_logger: TradeLogger):
        self.positions = position_tracker
        self.logger = trade_logger
        
        # Load config from environment
        self.starting_capital = float(os.getenv('STARTING_CAPITAL', '500'))
        self.max_risk_pct = float(os.getenv('MAX_RISK_PCT', '1.0')) / 100  # 1%
        self.max_exposure_pct = float(os.getenv('MAX_EXPOSURE_PCT', '25.0')) / 100  # 25%
        self.max_daily_drawdown_pct = float(os.getenv('MAX_DAILY_DRAWDOWN_PCT', '5.0')) / 100  # 5%
        self.max_24hr_loss = float(os.getenv('MAX_24HR_LOSS', '100'))  # $100
        self.min_reward_risk = float(os.getenv('MIN_REWARD_RISK', '2.0'))  # 2:1
        
        # State
        self.current_equity = self.starting_capital
        self.previous_day_close_equity = self.starting_capital
        self.losses_24hr: List[Dict] = []  # Track losses within rolling 24hr window
        self.trading_halted = False
        self.halt_reason = ''
        self.day_start_equity = self.starting_capital
        
        # Initialize Minimax AI Persona
        self.ai = None
        if MinimaxOpenClawAgent and os.getenv('MINIMAX_API_KEY'):
            try:
                self.ai = MinimaxOpenClawAgent('Emma', 'Risk')
                logger.info("🧠 Emma AI (Minimax M2.5) initialized for portfolio validation")
            except Exception as e:
                logger.error(f"Failed to init Risk AI: {e}")
        
        logger.info(f"RiskEngine initialized: equity=${self.current_equity}, "
                     f"max_risk={self.max_risk_pct*100}%, max_exposure={self.max_exposure_pct*100}%, "
                     f"max_24hr_loss=${self.max_24hr_loss}")
    
    def update_equity(self, cash_balance: float, positions_value: float = 0):
        """Update current equity from Coinbase account data."""
        self.current_equity = cash_balance + positions_value
        logger.debug(f"Equity updated: ${self.current_equity:.2f} (cash: ${cash_balance:.2f}, positions: ${positions_value:.2f})")
    
    def record_loss(self, loss_amount: float):
        """Record a realized loss for 24hr tracking."""
        if loss_amount > 0:
            return  # Not a loss
        
        self.losses_24hr.append({
            'amount': abs(loss_amount),
            'timestamp': datetime.now(timezone.utc)
        })
        self._check_24hr_loss()
    
    def _get_24hr_total_loss(self) -> float:
        """Calculate total losses in rolling 24hr window."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        self.losses_24hr = [l for l in self.losses_24hr if l['timestamp'] > cutoff]
        return sum(l['amount'] for l in self.losses_24hr)
    
    def _check_24hr_loss(self):
        """Check if 24hr loss limit has been breached."""
        total_loss = self._get_24hr_total_loss()
        if total_loss >= self.max_24hr_loss:
            self.trading_halted = True
            self.halt_reason = f"24hr loss limit breached: ${total_loss:.2f} >= ${self.max_24hr_loss}"
            self.logger.log_decision(
                agent='Emma',
                action='EMERGENCY_HALT',
                rationale=self.halt_reason,
                details={'total_24hr_loss': total_loss, 'limit': self.max_24hr_loss}
            )
            logger.critical(f"🚨 TRADING HALTED: {self.halt_reason}")
    
    def check_daily_drawdown(self) -> bool:
        """Check if daily drawdown limit has been breached."""
        drawdown = (self.previous_day_close_equity - self.current_equity) / self.previous_day_close_equity
        if drawdown >= self.max_daily_drawdown_pct:
            self.trading_halted = True
            self.halt_reason = (f"Daily drawdown breached: {drawdown*100:.1f}% >= "
                               f"{self.max_daily_drawdown_pct*100:.1f}%")
            self.logger.log_decision(
                agent='Emma',
                action='DAILY_DRAWDOWN_HALT',
                rationale=self.halt_reason,
                details={
                    'drawdown_pct': drawdown * 100,
                    'prev_close': self.previous_day_close_equity,
                    'current_equity': self.current_equity
                }
            )
            logger.warning(f"⚠️ DAILY HALT: {self.halt_reason}")
            return True
        return False
    
    def new_trading_day(self):
        """Reset daily counters for a new trading day."""
        self.previous_day_close_equity = self.current_equity
        self.day_start_equity = self.current_equity
        # Only un-halt if it was a daily drawdown halt (not 24hr loss)
        if '24hr' not in self.halt_reason:
            self.trading_halted = False
            self.halt_reason = ''
        logger.info(f"New trading day. Equity: ${self.current_equity:.2f}")
    
    def evaluate_trade(self, candidate: TradeCandidate) -> Tuple[bool, Optional[ApprovedTrade], str]:
        """
        Evaluate a trade candidate against all risk constraints.
        Returns: (approved, ApprovedTrade or None, reason)
        """
        # Check if trading is halted
        if self.trading_halted:
            return False, None, f"Trading halted: {self.halt_reason}"
        
        # Check daily drawdown
        if self.check_daily_drawdown():
            return False, None, f"Daily drawdown limit breached"
        
        # Check reward:risk ratio
        if candidate.reward_risk_ratio < self.min_reward_risk:
            return False, None, (f"R:R too low: {candidate.reward_risk_ratio:.1f}:1 "
                                f"(min {self.min_reward_risk:.1f}:1)")
        
        # Check if already in this position
        if self.positions.has_position(candidate.product_id):
            return False, None, f"Already have position in {candidate.product_id}"
        
        # Calculate position size based on max risk
        max_risk_usd = self.current_equity * self.max_risk_pct
        
        entry_fee = candidate.entry_price * 0.006
        stop_fee = candidate.stop_loss * 0.006
        risk_per_unit_with_fees = abs(candidate.entry_price - candidate.stop_loss) + entry_fee + stop_fee
        
        if risk_per_unit_with_fees <= 0:
            return False, None, "Invalid stop loss (zero risk per unit)"
        
        # Size to risk exactly max_risk_usd (so chart loss + all fees = max_risk_usd)
        raw_size = max_risk_usd / risk_per_unit_with_fees
        notional = raw_size * candidate.entry_price
        
        # Check exposure limit
        current_exposure = self.positions.get_total_exposure()
        max_exposure_usd = self.current_equity * self.max_exposure_pct
        remaining_exposure = max_exposure_usd - current_exposure
        
        if remaining_exposure <= 0:
            return False, None, (f"Exposure limit reached: ${current_exposure:.2f} / "
                                f"${max_exposure_usd:.2f}")
        
        # Cap position to remaining exposure
        if notional > remaining_exposure:
            notional = remaining_exposure
            raw_size = notional / candidate.entry_price
            actual_risk = raw_size * risk_per_unit_with_fees
            logger.info(f"Position capped by exposure: ${notional:.2f} (risk: ${actual_risk:.2f})")
        
        # Final risk check
        actual_risk = raw_size * risk_per_unit_with_fees
        if actual_risk > max_risk_usd * 1.01:  # 1% tolerance
            return False, None, f"Risk too high: ${actual_risk:.2f} > ${max_risk_usd:.2f}"
        
        # Check 24hr loss headroom
        loss_24hr = self._get_24hr_total_loss()
        if loss_24hr + actual_risk > self.max_24hr_loss:
            return False, None, (f"24hr loss headroom insufficient: "
                                f"${loss_24hr:.2f} used + ${actual_risk:.2f} risk > ${self.max_24hr_loss}")
        
        # === AI PORTFOLIO RISK VALIDATION LAYER ===
        if self.ai:
            prompt = (
                f"I am evaluating a long trade on {candidate.product_id} with entry ${candidate.entry_price:.2f}. "
                f"Mathematical size is {raw_size:.8f}, which risks exactly ${actual_risk:.2f} if stopped out at ${candidate.stop_loss:.2f}. "
                f"Total portfolio equity is ${self.current_equity:.2f}. Total open exposure (if approved) will be ${current_exposure + notional:.2f} "
                f"(max allowed is ${max_exposure_usd:.2f}). "
                f"We are under STRICT rules to capture realized gains within the next 5 hours and experience NO LOSSES due to geopolitical volatility. "
                f"If there is any doubt this will immediately move into profit, you MUST reject it. Protect capital at all costs! "
                f"Start your response with 'YES' or 'NO', followed by a 1-sentence risk rationale."
            )
            
            logger.info(f"🧠 Asking Emma AI to validate portfolio risk for {candidate.product_id}...")
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import nest_asyncio
                    nest_asyncio.apply()
                    
                response = loop.run_until_complete(
                    self.ai.think_and_respond(task=prompt, thinking_budget=2048)
                )
                
                ai_text = response.get('response', '').strip()
                logger.info(f"🧠 AI Response: {ai_text}")
                
                if not ai_text.upper().startswith('YES'):
                    logger.warning(f"❌ Emma AI Rejected {candidate.product_id} risk: {ai_text}")
                    self.logger.log_decision('Emma', 'AI_RISK_REJECTED', f"AI Rejected {candidate.product_id}: {ai_text}")
                    return False, None, f"AI Risk Reject: {ai_text}"
                    
                candidate.rationale += f" | Risk AI: {ai_text}"
            except Exception as e:
                logger.error(f"Risk AI validation failed: {e}")
                # Fail open to keep trading moving if AI crashes
                
        # APPROVED
        approved = ApprovedTrade(
            product_id=candidate.product_id,
            direction=candidate.direction,
            entry_price=candidate.entry_price,
            stop_loss=candidate.stop_loss,
            take_profit=candidate.take_profit,
            size=raw_size,
            risk_usd=actual_risk,
            notional=notional,
            rationale=candidate.rationale
        )
        
        self.logger.log_decision(
            agent='Emma',
            action='TRADE_APPROVED',
            rationale=f"Approved {candidate.product_id}: size={raw_size:.8f}, "
                     f"risk=${actual_risk:.2f}, R:R={candidate.reward_risk_ratio:.1f}:1",
            details={
                'product_id': candidate.product_id,
                'size': raw_size,
                'risk_usd': actual_risk,
                'notional': notional,
                'entry': candidate.entry_price,
                'stop': candidate.stop_loss,
                'target': candidate.take_profit,
                'rr_ratio': candidate.reward_risk_ratio,
                'exposure_after': current_exposure + notional,
                'loss_24hr': loss_24hr
            }
        )
        
        return True, approved, "Trade approved"
    
    def get_status(self) -> Dict:
        """Get current risk engine status."""
        return {
            'equity': self.current_equity,
            'starting_capital': self.starting_capital,
            'total_pnl': self.current_equity - self.starting_capital,
            'total_pnl_pct': ((self.current_equity / self.starting_capital) - 1) * 100,
            'exposure': self.positions.get_total_exposure(),
            'exposure_pct': (self.positions.get_total_exposure() / self.current_equity * 100) if self.current_equity > 0 else 0,
            'max_exposure': self.current_equity * self.max_exposure_pct,
            'loss_24hr': self._get_24hr_total_loss(),
            'max_24hr_loss': self.max_24hr_loss,
            'daily_drawdown_pct': ((self.previous_day_close_equity - self.current_equity) / self.previous_day_close_equity * 100) if self.previous_day_close_equity > 0 else 0,
            'trading_halted': self.trading_halted,
            'halt_reason': self.halt_reason,
            'open_positions': self.positions.get_position_count()
        }
