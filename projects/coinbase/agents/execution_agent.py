"""
Execution Agent — Dev
Places orders, monitors fills, manages exits on Coinbase.
"""

import os
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

from coinbase.rest import RESTClient

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from risk_engine import ApprovedTrade
from trade_logger import TradeLogger

logger = logging.getLogger(__name__)


class ExecutionAgent:
    """
    Dev — Execution Agent
    Executes approved trades precisely and manages open orders.
    """
    
    AGENT_NAME = 'Dev'
    
    def __init__(self, client: RESTClient, trade_logger: TradeLogger, dry_run: bool = True):
        self.client = client
        self.logger = trade_logger
        self.dry_run = dry_run
        self.active_orders: Dict[str, Dict] = {}  # order_id -> order details
        
        if self.dry_run:
            logger.info("⚠️ DRY RUN MODE: No real orders will be placed")
    
    def _get_free_balance(self, currency: str = 'USD') -> float:
        """Check available balance on Coinbase."""
        try:
            accounts = self.client.get_accounts()
            for acc in accounts.accounts:
                bal = acc.available_balance
                if isinstance(bal, dict):
                    if bal.get('currency') == currency and float(bal.get('value', 0)) > 0:
                        return float(bal['value'])
                elif hasattr(bal, 'currency') and hasattr(bal, 'value'):
                    if bal.currency == currency and float(bal.value) > 0:
                        return float(bal.value)
            return 0.0
        except Exception as e:
            logger.error(f"Error checking balance: {e}")
            return 0.0
    
    def _generate_order_id(self) -> str:
        """Generate a unique client order ID."""
        return f"openclaw-{uuid.uuid4().hex[:12]}"
    
    def execute_trade(self, trade: ApprovedTrade) -> Optional[Dict]:
        """
        Execute an approved trade on Coinbase.
        Returns fill details or None on failure.
        """
        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='EXECUTE_START',
            rationale=f"Executing {trade.direction} {trade.product_id}: "
                     f"size={trade.size:.8f}, entry=${trade.entry_price:,.2f}",
            details={
                'product_id': trade.product_id,
                'size': trade.size,
                'entry': trade.entry_price,
                'stop': trade.stop_loss,
                'target': trade.take_profit,
                'notional': trade.notional
            }
        )
        
        # Pre-order balance check
        if self.dry_run:
            # In dry run, trust the risk engine's simulated equity
            free_balance = trade.notional + 1  # Always enough in simulation
        else:
            free_balance = self._get_free_balance('USD')
        
        if free_balance < trade.notional:
            if free_balance >= 1.0 and not self.dry_run:
                # Scale trade down to available balance
                scale = free_balance / trade.notional
                original_size = trade.size
                trade = ApprovedTrade(
                    product_id=trade.product_id,
                    direction=trade.direction,
                    entry_price=trade.entry_price,
                    stop_loss=trade.stop_loss,
                    take_profit=trade.take_profit,
                    size=trade.size * scale * 0.95,  # 5% buffer for fees
                    risk_usd=trade.risk_usd * scale,
                    notional=free_balance * 0.95,
                    rationale=trade.rationale
                )
                logger.info(f"📏 Scaled trade to available balance: ${free_balance:.2f} (size: {original_size:.8f} → {trade.size:.8f})")
            else:
                reason = f"Insufficient balance: ${free_balance:.2f} < ${trade.notional:.2f}"
                self.logger.log_decision(
                    agent=self.AGENT_NAME,
                    action='EXECUTE_FAILED',
                    rationale=reason
                )
                logger.error(f"❌ {reason}")
                return None
        
        client_order_id = self._generate_order_id()
        
        if self.dry_run:
            # Simulate fill in dry run mode
            fill = {
                'order_id': client_order_id,
                'product_id': trade.product_id,
                'side': 'BUY',
                'size': trade.size,
                'fill_price': trade.entry_price,
                'notional': trade.notional,
                'fees': trade.notional * 0.006,  # ~0.6% taker fee estimate
                'status': 'DRY_RUN_FILLED',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            self.logger.log_trade(
                trade_type='entry',
                product_id=trade.product_id,
                side='buy',
                size=trade.size,
                price=trade.entry_price,
                fees=fill['fees'],
                order_id=client_order_id,
                agent=self.AGENT_NAME,
                rationale=f"[DRY RUN] {trade.rationale}",
                details={'stop': trade.stop_loss, 'target': trade.take_profit}
            )
            
            logger.info(f"📝 [DRY RUN] BUY {trade.size:.8f} {trade.product_id} "
                       f"@ ${trade.entry_price:,.2f} (fees: ${fill['fees']:.4f})")
            
            return fill
        
        # LIVE order placement
        try:
            # Place market order (for immediate fill)
            order = self.client.market_order_buy(
                client_order_id=client_order_id,
                product_id=trade.product_id,
                quote_size=str(round(trade.notional, 2))
            )
            logger.info(f"📡 Buy response type={type(order).__name__}: {order}")
            
            # Coinbase SDK returns CreateOrderResponse object (NOT a dict)
            order_id = None
            error_msg = None
            
            if hasattr(order, 'success') and order.success:
                if hasattr(order, 'success_response'):
                    sr = order.success_response
                    order_id = sr.get('order_id') if isinstance(sr, dict) else getattr(sr, 'order_id', None)
            elif hasattr(order, 'error_response'):
                er = order.error_response
                error_msg = er.get('message', 'Unknown') if isinstance(er, dict) else getattr(er, 'message', str(er))
            
            if order_id:
                fill = {
                    'order_id': order_id,
                    'client_order_id': client_order_id,
                    'product_id': trade.product_id,
                    'side': 'BUY',
                    'size': trade.size,
                    'fill_price': trade.entry_price,
                    'notional': trade.notional,
                    'fees': trade.notional * 0.006,
                    'status': 'FILLED',
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
                
                self.active_orders[order_id] = fill
                
                self.logger.log_trade(
                    trade_type='entry',
                    product_id=trade.product_id,
                    side='buy',
                    size=trade.size,
                    price=trade.entry_price,
                    fees=fill['fees'],
                    order_id=order_id,
                    agent=self.AGENT_NAME,
                    rationale=trade.rationale
                )
                
                logger.info(f"✅ ORDER PLACED: BUY {trade.size:.8f} {trade.product_id} "
                           f"@ ${trade.entry_price:,.2f} (order: {order_id[:12]}...)")
                return fill
            else:
                reason = error_msg or f"Order failed: {order}"
                self.logger.log_decision(
                    agent=self.AGENT_NAME,
                    action='ORDER_FAILED',
                    rationale=reason
                )
                logger.error(f"❌ {reason}")
                return None
                
        except Exception as e:
            self.logger.log_decision(
                agent=self.AGENT_NAME,
                action='ORDER_ERROR',
                rationale=f"Order failed: {str(e)}"
            )
            logger.error(f"❌ Order error: {e}")
            return None
    
    def close_position(self, product_id: str, size: float, reason: str = 'manual') -> Optional[Dict]:
        """Close a position by selling."""
        client_order_id = self._generate_order_id()
        
        if self.dry_run:
            # Get current price for dry run
            try:
                product = self.client.get_product(product_id)
                current_price = float(product.price)
            except:
                current_price = 0.0
            
            fill = {
                'order_id': client_order_id,
                'product_id': product_id,
                'side': 'SELL',
                'size': size,
                'fill_price': current_price,
                'notional': size * current_price,
                'fees': size * current_price * 0.006,
                'status': 'DRY_RUN_FILLED',
                'reason': reason,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            self.logger.log_trade(
                trade_type=f'exit_{reason}',
                product_id=product_id,
                side='sell',
                size=size,
                price=current_price,
                fees=fill['fees'],
                order_id=client_order_id,
                agent=self.AGENT_NAME,
                rationale=f"[DRY RUN] Exit: {reason}"
            )
            
            logger.info(f"📝 [DRY RUN] SELL {size:.8f} {product_id} @ ${current_price:,.2f} ({reason})")
            return fill
        
        # LIVE sell order
        try:
            # Dynamically determine the correct precision for this product
            precision = 8
            try:
                product_info = self.client.get_product(product_id)
                # base_increment looks like '0.1' (1 decimal) or '0.00000001' (8 decimals)
                base_inc_str = str(product_info.base_increment)
                if '.' in base_inc_str:
                    precision = len(base_inc_str.split('.')[1].rstrip('0'))
                elif 'e' in base_inc_str.lower():
                    # Handle scientific notation like 1e-08
                    import math
                    precision = abs(int(math.floor(math.log10(float(base_inc_str)))))
                else:
                    precision = 0
            except Exception as e:
                logger.warning(f"⚠️ Could not fetch product precision for {product_id}, defaulting to 8: {e}")
                
            formatted_size = f"{size:.{precision}f}"
            
            order = self.client.market_order_sell(
                client_order_id=client_order_id,
                product_id=product_id,
                base_size=formatted_size
            )
            
            logger.info(f"📡 Sell response type={type(order).__name__}: {order}")
            
            # Coinbase SDK returns CreateOrderResponse object (NOT a dict)
            order_id = None
            
            if hasattr(order, 'success') and order.success:
                if hasattr(order, 'success_response'):
                    sr = order.success_response
                    order_id = sr.get('order_id') if isinstance(sr, dict) else getattr(sr, 'order_id', None)
            elif hasattr(order, 'error_response'):
                er = order.error_response
                error_msg = er.get('message', 'Unknown') if isinstance(er, dict) else getattr(er, 'message', str(er))
                logger.error(f"❌ Sell rejected: {error_msg}")
                return None
            
            if order_id:
                try:
                    product = self.client.get_product(product_id)
                    current_price = float(product.price)
                except:
                    current_price = 0.0
                
                fill = {
                    'order_id': order_id,
                    'product_id': product_id,
                    'side': 'SELL',
                    'size': size,
                    'fill_price': current_price,
                    'notional': size * current_price,
                    'fees': size * current_price * 0.006,
                    'status': 'FILLED',
                    'reason': reason,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
                
                self.logger.log_trade(
                    trade_type=f'exit_{reason}',
                    product_id=product_id,
                    side='sell',
                    size=size,
                    price=current_price,
                    fees=fill['fees'],
                    order_id=order_id,
                    agent=self.AGENT_NAME,
                    rationale=f"Exit: {reason}"
                )
                
                logger.info(f"✅ SELL {size:.8f} {product_id} @ ${current_price:,.2f} ({reason})")
                return fill
            
            logger.error(f"❌ Sell failed: {order}")
            return None
            
        except Exception as e:
            logger.error(f"❌ Sell error for {product_id}: {e}")
            return None
    
    def close_all_positions(self, positions: Dict, reason: str = 'emergency'):
        """Emergency: close all open positions."""
        results = []
        for pid, pos in positions.items():
            result = self.close_position(pid, pos.size, reason)
            results.append((pid, result))
        return results
