"""
ATOM Funding Module — Sells small ATOM amounts to fund trading capital.
Max $10 per sale. Tracks total ATOM sold to stay within budget.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Dict, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class AtomFunder:
    """
    Manages funding by selling small amounts of ATOM.
    Max $10 per sale, tracks total sold.
    """
    
    def __init__(self, client, trade_logger, dry_run: bool = True):
        self.client = client
        self.logger = trade_logger
        self.dry_run = dry_run
        
        self.max_sell_usd = float(os.getenv('MAX_ATOM_SELL_USD', '10'))
        self.max_total_loss = float(os.getenv('MAX_TOTAL_LOSS', '20'))
        self.total_atom_sold_usd = 0.0
        self.funding_events = []
    
    def get_atom_balance(self) -> float:
        """Get current ATOM balance."""
        try:
            accounts = self.client.get_accounts()
            for acc in accounts.accounts:
                bal = acc.available_balance
                if isinstance(bal, dict):
                    if bal.get('currency') == 'ATOM':
                        return float(bal.get('value', 0))
                elif hasattr(bal, 'currency') and hasattr(bal, 'value'):
                    if bal.currency == 'ATOM':
                        return float(bal.value)
            return 0.0
        except Exception as e:
            logger.error(f"Error getting ATOM balance: {e}")
            return 0.0
    
    def get_atom_price(self) -> float:
        """Get current ATOM-USD price."""
        try:
            product = self.client.get_product('ATOM-USD')
            return float(product.price)
        except Exception as e:
            logger.error(f"Error getting ATOM price: {e}")
            return 0.0
    
    def get_usd_balance(self) -> float:
        """Get current USD balance."""
        try:
            accounts = self.client.get_accounts()
            for acc in accounts.accounts:
                bal = acc.available_balance
                if isinstance(bal, dict):
                    if bal.get('currency') == 'USD':
                        return float(bal.get('value', 0))
            return 0.0
        except Exception as e:
            logger.error(f"Error getting USD balance: {e}")
            return 0.0
    
    def can_fund(self) -> bool:
        """Check if we can still sell ATOM (haven't exceeded max total loss)."""
        return self.total_atom_sold_usd < self.max_total_loss
    
    def remaining_budget(self) -> float:
        """How much more ATOM we can sell (in USD)."""
        return max(0, self.max_total_loss - self.total_atom_sold_usd)
    
    def fund_trading_capital(self, amount_usd: float = None) -> Optional[Dict]:
        """
        Sell ATOM to fund trading capital.
        Amount capped at $10 per event and remaining budget.
        """
        if not self.can_fund():
            logger.warning(f"🚫 Funding limit reached: ${self.total_atom_sold_usd:.2f} / ${self.max_total_loss:.2f}")
            return None
        
        # Cap at $10 per event and remaining budget
        amount = min(
            amount_usd or self.max_sell_usd,
            self.max_sell_usd,
            self.remaining_budget()
        )
        
        if amount < 1.0:  # Minimum $1 trade
            logger.warning(f"Amount too small: ${amount:.2f}")
            return None
        
        atom_price = self.get_atom_price()
        if atom_price <= 0:
            logger.error("Cannot get ATOM price")
            return None
        
        atom_amount = amount / atom_price
        atom_balance = self.get_atom_balance()
        
        if atom_amount > atom_balance:
            logger.warning(f"Not enough ATOM: need {atom_amount:.4f}, have {atom_balance:.4f}")
            return None
        
        self.logger.log_decision(
            agent='Dev',
            action='ATOM_FUND',
            rationale=f"Selling {atom_amount:.6f} ATOM (~${amount:.2f}) for trading capital",
            details={
                'atom_amount': atom_amount,
                'usd_amount': amount,
                'atom_price': atom_price,
                'total_sold_before': self.total_atom_sold_usd,
                'remaining_budget': self.remaining_budget()
            }
        )
        
        if self.dry_run:
            result = {
                'status': 'DRY_RUN',
                'atom_sold': atom_amount,
                'usd_received': amount,
                'atom_price': atom_price,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            logger.info(f"📝 [DRY RUN] Sold {atom_amount:.6f} ATOM @ ${atom_price:.2f} = ${amount:.2f}")
        else:
            # LIVE: sell ATOM for USD
            try:
                import uuid
                order = self.client.market_order_sell(
                    client_order_id=f"atom-fund-{uuid.uuid4().hex[:8]}",
                    product_id='ATOM-USD',
                    base_size=str(round(atom_amount, 2))  # ATOM requires 2 decimal max
                )
                
                logger.info(f"📡 ATOM sell response type={type(order).__name__}: {order}")
                
                # Coinbase SDK returns CreateOrderResponse object (NOT a dict)
                order_id = None
                if hasattr(order, 'success') and order.success:
                    if hasattr(order, 'success_response'):
                        sr = order.success_response
                        order_id = sr.get('order_id') if isinstance(sr, dict) else getattr(sr, 'order_id', None)
                elif hasattr(order, 'error_response'):
                    er = order.error_response
                    error_msg = er.get('message', 'Unknown') if isinstance(er, dict) else getattr(er, 'message', str(er))
                    logger.error(f"❌ ATOM sell rejected: {error_msg}")
                    return None
                
                if not order_id:
                    logger.error(f"❌ Could not parse order ID")
                    return None
                
                result = {
                    'status': 'FILLED',
                    'order_id': order_id,
                    'atom_sold': atom_amount,
                    'usd_received': amount,
                    'atom_price': atom_price,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
                logger.info(f"✅ Sold {atom_amount:.2f} ATOM @ ${atom_price:.2f} = ${amount:.2f} (order: {order_id[:12]})")
                
            except Exception as e:
                logger.error(f"❌ ATOM sell exception: {e}")
                return None
        
        self.total_atom_sold_usd += amount
        self.funding_events.append(result)
        
        self.logger.log_trade(
            trade_type='funding',
            product_id='ATOM-USD',
            side='sell',
            size=atom_amount,
            price=atom_price,
            fees=amount * 0.006,
            agent='Dev',
            rationale=f"Funding: sold ATOM for ${amount:.2f} trading capital"
        )
        
        logger.info(f"💰 Funding: ${amount:.2f} | Total ATOM sold: ${self.total_atom_sold_usd:.2f} / ${self.max_total_loss:.2f}")
        
        return result
    
    def get_status(self) -> Dict:
        """Get funding status."""
        return {
            'total_atom_sold_usd': self.total_atom_sold_usd,
            'max_total_loss': self.max_total_loss,
            'remaining_budget': self.remaining_budget(),
            'funding_events': len(self.funding_events),
            'can_fund': self.can_fund()
        }
