"""
Orchestrator — Monica
Coordinates the trading loop: Research → Risk → Execution, 24/7 for 3 days.
"""

import os
import sys
import time
import signal
import logging
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import asyncio
import threading

# Load environment
load_dotenv(Path(__file__).parents[4] / '.env')  # Load root .env for Minimax API key
load_dotenv(Path(__file__).parents[1] / '.env')  # Load coinbase-specific .env

from coinbase.rest import RESTClient

sys.path.insert(0, str(Path(__file__).parents[1]))
sys.path.insert(0, str(Path(__file__).parents[4]))  # Access root for models
from trade_logger import TradeLogger
from position_tracker import PositionTracker
from risk_engine import RiskEngine
from atom_funder import AtomFunder
from trade_dashboard import TradeDashboard
from agents.research_agent import ResearchAgent
from agents.risk_manager_agent import RiskManagerAgent
from agents.execution_agent import ExecutionAgent
from agents.zara_agent import ZaraAgent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            Path(__file__).parent.parent / 'reports' / 'latest.log',
            mode='a'
        )
    ]
)
logger = logging.getLogger('Orchestrator')


class Orchestrator:
    """
    Monica — Orchestrator
    Runs the 24hr trading loop, coordinates all agents.
    """
    
    AGENT_NAME = 'Monica'
    
    def __init__(self):
        # Load config
        api_key = os.getenv('COINBASE_API_KEY')
        api_secret = os.getenv('COINBASE_API_SECRET', '').replace('\\n', '\n')
        self.dry_run = os.getenv('DRY_RUN', 'true').lower() == 'true'
        self.interval_minutes = int(os.getenv('ANALYSIS_INTERVAL_MINUTES', '30'))
        self.run_days = int(os.getenv('RUN_DAYS', '3'))
        
        # Initialize Coinbase client
        self.client = RESTClient(api_key=api_key, api_secret=api_secret)
        
        # Initialize core infrastructure
        self.trade_logger = TradeLogger()
        self.position_tracker = PositionTracker()
        self.risk_engine = RiskEngine(self.position_tracker, self.trade_logger)
        
        # Initialize agents
        self.research = ResearchAgent(self.client, self.trade_logger)
        self.risk_manager = RiskManagerAgent(self.risk_engine, self.trade_logger)
        self.execution = ExecutionAgent(self.client, self.trade_logger, dry_run=self.dry_run)
        self.zara = ZaraAgent()
        self.atom_funder = AtomFunder(self.client, self.trade_logger, dry_run=self.dry_run)
        self.dashboard = TradeDashboard()
        
        # Strategy config
        # User requested max $20 loss limit, strictly hardcoded to ensure compliance
        self.profit_target = float(os.getenv('PROFIT_TARGET', '1000'))
        self.max_total_loss = float(os.getenv('MAX_TOTAL_LOSS', '20.0'))
        self.max_total_loss = min(self.max_total_loss, 20.0)  # Hard ceiling
        
        # We need rapid 2-minute cycle analysis to match the 5-minute candles
        self.interval_minutes = int(os.getenv('ANALYSIS_INTERVAL_MINUTES', '2'))
        self.run_days = int(os.getenv('RUN_DAYS', '3'))
        
        self.compound_profits = os.getenv('COMPOUND_PROFITS', 'true').lower() == 'true'
        
        # State
        self.running = True
        self.cycle_count = 0
        self.start_time = None
        self.last_day_boundary = None
        self.target_hit = False
        
        # Setup graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        # Check for kill file
        self.kill_file = Path(__file__).parent.parent / 'STOP'
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info("\n🛑 Shutdown signal received. Closing positions and exiting...")
        self.running = False
    
    def _update_equity(self):
        """Update equity from Coinbase account data."""
        try:
            accounts = self.client.get_accounts()
            cash = 0.0
            for acc in accounts.accounts:
                bal = acc.available_balance
                if isinstance(bal, dict):
                    if bal.get('currency') == 'USD':
                        cash += float(bal.get('value', 0))
                    elif bal.get('currency') == 'USDC':
                        cash += float(bal.get('value', 0))
            
            # Add position values
            positions_value = 0.0
            for pid, pos in self.position_tracker.open_positions.items():
                try:
                    product = self.client.get_product(pid)
                    positions_value += pos.size * float(product.price)
                except:
                    positions_value += pos.notional  # fallback
            
            self.risk_engine.update_equity(cash, positions_value)
            
        except Exception as e:
            logger.error(f"Error updating equity: {e}")
    
    def _get_current_prices(self) -> dict:
        """Get current prices for all positions and watch list."""
        prices = {}
        # Get prices for open positions
        for pid in self.position_tracker.open_positions:
            try:
                product = self.client.get_product(pid)
                prices[pid] = float(product.price)
            except:
                pass
        # Also get watch list prices (skip dynamic 'ALL' keyword)
        for pid in self.research.watch_list:
            if pid.upper() == 'ALL' or pid not in prices:
                if pid.upper() == 'ALL':
                    continue
                try:
                    product = self.client.get_product(pid)
                    prices[pid] = float(product.price)
                except:
                    pass
        return prices
    
    def _check_day_boundary(self):
        """Check if we've crossed into a new trading day (UTC)."""
        today = datetime.now(timezone.utc).date()
        if self.last_day_boundary is None:
            self.last_day_boundary = today
            return
        
        if today > self.last_day_boundary:
            self.last_day_boundary = today
            logger.info(f"\n{'='*60}")
            logger.info(f"📅 NEW TRADING DAY: {today}")
            logger.info(f"{'='*60}")
            
            # Generate previous day's summary
            self._generate_daily_summary()
            
            # Reset daily counters
            self.risk_engine.new_trading_day()
    
    def _generate_daily_summary(self):
        """Generate end-of-day summary."""
        status = self.risk_engine.get_status()
        summary = {
            'equity': status['equity'],
            'starting_capital': status['starting_capital'],
            'daily_pnl': status['equity'] - self.risk_engine.day_start_equity,
            'total_pnl': status['total_pnl'],
            'total_pnl_pct': status['total_pnl_pct'],
            'trades_today': len(self.trade_logger.get_today_trades()),
            'decisions_today': len(self.trade_logger.get_today_decisions()),
            'open_positions': self.position_tracker.get_position_count(),
            'realized_pnl': self.position_tracker.total_realized_pnl,
            'total_fees': self.position_tracker.total_fees,
            'cycle_count': self.cycle_count
        }
        
        self.trade_logger.log_daily_summary(summary)
        
        logger.info(f"\n📊 DAILY SUMMARY:")
        logger.info(f"   Equity: ${summary['equity']:.2f}")
        logger.info(f"   Daily P&L: ${summary['daily_pnl']:+.2f}")
        logger.info(f"   Total P&L: ${summary['total_pnl']:+.2f} ({summary['total_pnl_pct']:+.1f}%)")
        logger.info(f"   Trades: {summary['trades_today']}")
        logger.info(f"   Fees: ${summary['total_fees']:.2f}")
    
    def run_cycle(self):
        """Run one analysis → risk → execution cycle."""
        self.cycle_count += 1
        
        logger.info(f"\n{'─'*60}")
        logger.info(f"🔄 CYCLE {self.cycle_count} — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        logger.info(f"{'─'*60}")
        
        self.trade_logger.log_decision(
            agent=self.AGENT_NAME,
            action='CYCLE_START',
            rationale=f"Cycle {self.cycle_count}",
            details={'risk_status': self.risk_engine.get_status()}
        )
        
        # Step 0: Update equity
        self._update_equity()
        
        # Step 0.5: Check day boundary
        self._check_day_boundary()
        
        # Step 0.7: Check profit target
        if self.risk_engine.current_equity >= self.profit_target:
            logger.info(f"\n🎉🎉🎉 PROFIT TARGET HIT! Equity: ${self.risk_engine.current_equity:.2f} >= ${self.profit_target:.2f} 🎉🎉🎉")
            self.target_hit = True
            self.running = False
            return
        
        # Step 0.8: Check total loss limit (only count actual trading losses, not funding)
        total_loss = abs(min(0, self.position_tracker.total_realized_pnl))
        if total_loss >= self.max_total_loss:
            logger.warning(f"🚫 MAX TOTAL LOSS REACHED: ${total_loss:.2f} >= ${self.max_total_loss:.2f}")
            self.risk_engine.trading_halted = True
            self.risk_engine.halt_reason = f"Total loss limit: ${total_loss:.2f}"
            self.running = False
            return
        
        # Step 0.9: Fund capital from ATOM if needed
        usd_balance = self.atom_funder.get_usd_balance()
        max_trade_notional = self.risk_engine.current_equity * self.risk_engine.max_exposure_pct
        min_trade_capital = max(max_trade_notional, 10.0)  # Need enough USD to cover a trade
        
        # ONLY fund if our total equity is LESS than our target capital limit ($20), 
        # protecting against over-funding across script restarts
        if self.risk_engine.current_equity < self.max_total_loss and usd_balance < min_trade_capital and self.atom_funder.can_fund():
            logger.info(f"💸 Low USD balance (${usd_balance:.2f} < ${min_trade_capital:.2f}) and Equity (${self.risk_engine.current_equity:.2f}) below limit. Selling ATOM for capital...")
            fund_result = self.atom_funder.fund_trading_capital(10.0)
            if fund_result:
                usd_received = fund_result.get('usd_received', 0)
                usd_balance += usd_received
                # In dry-run, simulate that we now have more USD
                if self.dry_run:
                    self.risk_engine.current_equity += usd_received
                    logger.info(f"💰 [DRY RUN] Equity updated to ${self.risk_engine.current_equity:.2f}")
                else:
                    # Wait for ATOM sale to settle on Coinbase — poll balance
                    pre_balance = usd_balance
                    logger.info(f"⏳ Waiting for ATOM sale to settle (USD before: ${pre_balance:.2f})...")
                    for attempt in range(10):  # Up to 30 seconds
                        time.sleep(3)
                        usd_balance = self.atom_funder.get_usd_balance()
                        if usd_balance > pre_balance + 1.0:  # At least $1 more
                            logger.info(f"💰 Settlement confirmed: ${usd_balance:.2f} (took {(attempt+1)*3}s)")
                            break
                        logger.info(f"⏳ Still settling... ${usd_balance:.2f} (attempt {attempt+1}/10)")
                    self._update_equity()
                    logger.info(f"💰 Post-funding: USD=${usd_balance:.2f}, Equity=${self.risk_engine.current_equity:.2f}")
                # Log to dashboard
                self.dashboard.log_funding(
                    atom_sold=fund_result.get('atom_sold', 0),
                    atom_price=fund_result.get('atom_price', 0),
                    usd_received=usd_received,
                    budget_remaining=self.atom_funder.remaining_budget(),
                    equity_after=self.risk_engine.current_equity,
                    cycle=self.cycle_count
                )
        
        # Compounding: update risk engine equity to use ALL available capital
        if self.compound_profits:
            self.risk_engine.current_equity = max(self.risk_engine.current_equity, usd_balance)
        
        # Step 1: Check if trading should be halted
        halted, reason = self.risk_manager.should_halt()
        if halted:
            logger.warning(f"⚠️ Trading halted: {reason}")
            # Still check positions for exits
            prices = self._get_current_prices()
            triggers = self.risk_manager.check_positions(prices)
            for trigger_type, pid, price in triggers:
                pos = self.position_tracker.get_position(pid)
                if pos:
                    self.execution.close_position(pid, pos.size, trigger_type)
                    self.risk_manager.on_trade_exit(pid, price, trigger_type)
            return
        
        # Step 2: Check open positions for stop/target triggers
        prices = self._get_current_prices()
        triggers = self.risk_manager.check_positions(prices)
        for trigger_type, pid, price in triggers:
            pos = self.position_tracker.get_position(pid)
            if pos:
                fill = self.execution.close_position(pid, pos.size, trigger_type)
                if fill:
                    exit_price = fill.get('fill_price', price)
                    pnl = (exit_price - pos.entry_price) * pos.size - pos.fees_paid
                    pnl_pct = (pnl / pos.notional) * 100 if pos.notional > 0 else 0
                    self.risk_manager.on_trade_exit(pid, exit_price, trigger_type)
                    # Log to dashboard
                    self.dashboard.log_trade(
                        trade_type=f'EXIT_{trigger_type.upper()}',
                        side='SELL', product_id=pid,
                        size=pos.size, price=exit_price,
                        fees=fill.get('fees', 0),
                        pnl=pnl, pnl_pct=pnl_pct,
                        equity_after=self.risk_engine.current_equity,
                        status=trigger_type,
                        rationale=f'{trigger_type} triggered',
                        cycle=self.cycle_count
                    )
        
        # [v2026.2.21 Alignment] Thread-bound Session Context
        session_id = f"cycle-{self.cycle_count}-{int(time.time())}"
        logger.info(f"🧵 Session Context: {session_id}")

        # Step 3: Research — scan markets for new setups (Files to Blackboard)
        self.research.scan_markets(write_to_blackboard=True, session_id=session_id)
        
        # Step 3.5: Intelligence — General research sweep (Files to Blackboard)
        self.research.scan_intel(session_id=session_id)
        
        # Step 4: Risk review — Review candidates from Blackboard
        self.risk_manager.review_from_blackboard(session_id=session_id)
        
        # Step 4.5: Content — Draft updates based on Intel
        # Note: In a production async loop we'd use await, but since orchestrator is sync-styled:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # This is tricky in a managed loop, but for this script:
                def run_async(coro):
                    new_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(new_loop)
                    return new_loop.run_until_complete(coro)
                threading.Thread(target=run_async, args=(self.zara.draft_from_blackboard(session_id=session_id),)).start()
            else:
                loop.run_until_complete(self.zara.draft_from_blackboard(session_id=session_id))
        except Exception as e:
            logger.error(f"Failed to run Zara's async drafting: {e}")
        
        # Step 5: Execute approved trades from Blackboard
        self._execute_from_blackboard(session_id=session_id)
        
        # Log cycle status
        status = self.risk_engine.get_status()
        logger.info(f"\n� Status: Equity=${status['equity']:.2f} | "
                    f"Exposure=${status['exposure']:.2f} ({status['exposure_pct']:.1f}%) | "
                    f"24hr Loss=${status['loss_24hr']:.2f} | "
                    f"Positions={status['open_positions']}")

    def _execute_from_blackboard(self, session_id: str = None):
        """Read blackboard/risk/approved.json and execute trades."""
        blackboard_dir = Path(__file__).parent.parent / 'blackboard'
        approved_file = blackboard_dir / 'risk' / 'approved.json'
        
        if not approved_file.exists():
            return
            
        logger.info(f"⚡ Monica executing approved trades from blackboard")
        
        try:
            with open(approved_file, 'r') as f:
                data = json.load(f)
                
            # [v2026.2.21 Alignment] Filter by session_id if provided
            approved_trades = []
            for t in data:
                if session_id and t.get('session_id') != session_id:
                    logger.debug(f"⏭️ Skipping trade for {t['product_id']} from different session: {t.get('session_id')}")
                    continue
                approved_trades.append(t)
        except Exception as e:
            logger.error(f"Failed to read approved trades from blackboard: {e}")
            return

        for t in approved_trades:
            # Reconstruct ApprovedTrade object if needed or just use dict
            # For simplicity, we can pass a mock/dict if ExecutionAgent supports it 
            # or just use the raw values
            from risk_engine import ApprovedTrade
            trade = ApprovedTrade(
                product_id=t['product_id'],
                size=t['size'],
                entry_price=t['entry_price'],
                stop_loss=t['stop_loss'],
                take_profit=t['take_profit'],
                risk_usd=t['risk_usd'],
                rationale=t.get('reason', 'Blackboard fill')
            )
            
            fill = self.execution.execute_trade(trade)
            if fill:
                self.risk_manager.on_trade_fill(
                    product_id=trade.product_id,
                    fill_price=fill.get('fill_price', trade.entry_price),
                    size=trade.size,
                    fees=fill.get('fees', 0),
                    stop_loss=trade.stop_loss,
                    take_profit=trade.take_profit
                )
                # Log to dashboard
                self.dashboard.log_trade(
                    trade_type='ENTRY',
                    side='BUY', product_id=trade.product_id,
                    size=trade.size, price=fill.get('fill_price', trade.entry_price),
                    notional=trade.size * trade.entry_price, 
                    fees=fill.get('fees', 0),
                    stop_loss=trade.stop_loss, take_profit=trade.take_profit,
                    equity_after=self.risk_engine.current_equity,
                    status='FILLED',
                    rationale=trade.rationale,
                    cycle=self.cycle_count
                )
        
        # Clean up approved file
        approved_file.unlink()

        
        # Log cycle status
        status = self.risk_engine.get_status()
        logger.info(f"\n📈 Status: Equity=${status['equity']:.2f} | "
                    f"Exposure=${status['exposure']:.2f} ({status['exposure_pct']:.1f}%) | "
                    f"24hr Loss=${status['loss_24hr']:.2f} | "
                    f"Positions={status['open_positions']}")
    
    def run(self):
        """Main entry point: run the trading system."""
        self.start_time = datetime.now(timezone.utc)
        end_time = self.start_time + timedelta(days=self.run_days)
        
        mode = "DRY RUN" if self.dry_run else "LIVE"
        
        logger.info(f"\n{'='*60}")
        logger.info(f"🚀 OPENCLAW CRYPTO TRADING SYSTEM — {mode}")
        logger.info(f"{'='*60}")
        logger.info(f"   Start: {self.start_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        logger.info(f"   End:   {end_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        logger.info(f"   Capital: ${self.risk_engine.starting_capital:.2f} (from ATOM sales)")
        logger.info(f"   Max total loss: ${self.max_total_loss:.2f}")
        logger.info(f"   Profit target: ${self.profit_target:.2f}")
        logger.info(f"   Compounding: {'ON' if self.compound_profits else 'OFF'}")
        logger.info(f"   Interval: {self.interval_minutes} min")
        logger.info(f"   Watch list: {', '.join(self.research.watch_list)}")
        logger.info(f"{'='*60}\n")
        
        self.trade_logger.log_decision(
            agent=self.AGENT_NAME,
            action='SYSTEM_START',
            rationale=f"{mode} mode, {self.run_days} days, ${self.risk_engine.starting_capital} capital",
            details={
                'mode': mode,
                'start': self.start_time.isoformat(),
                'end': end_time.isoformat(),
                'config': {
                    'interval_minutes': self.interval_minutes,
                    'watch_list': self.research.watch_list,
                    'max_risk_pct': self.risk_engine.max_risk_pct * 100,
                    'max_exposure_pct': self.risk_engine.max_exposure_pct * 100,
                    'max_24hr_loss': self.risk_engine.max_24hr_loss
                }
            }
        )
        
        try:
            while self.running:
                # Check time limit
                if datetime.now(timezone.utc) >= end_time:
                    logger.info(f"\n⏰ Time limit reached ({self.run_days} days). Shutting down.")
                    break
                
                # Check kill file
                if self.kill_file.exists():
                    logger.info(f"\n🛑 Kill file detected. Shutting down.")
                    self.kill_file.unlink()
                    break
                
                # Run a trading cycle
                try:
                    self.run_cycle()
                except Exception as e:
                    logger.error(f"❌ Cycle error: {e}", exc_info=True)
                    self.trade_logger.log_decision(
                        agent=self.AGENT_NAME,
                        action='CYCLE_ERROR',
                        rationale=str(e)
                    )
                
                # Sleep until next cycle
                logger.info(f"\n💤 Sleeping {self.interval_minutes} minutes until next cycle...")
                for _ in range(self.interval_minutes * 60):
                    if not self.running:
                        break
                    time.sleep(1)
        
        finally:
            # Graceful shutdown
            self._shutdown()
    
    def _shutdown(self):
        """Graceful shutdown: close all positions, generate final report."""
        logger.info(f"\n{'='*60}")
        logger.info(f"🏁 SHUTTING DOWN")
        logger.info(f"{'='*60}")
        
        # Close all open positions
        open_positions = dict(self.position_tracker.open_positions)
        if open_positions:
            logger.info(f"Closing {len(open_positions)} open positions...")
            self.execution.close_all_positions(open_positions, 'shutdown')
            for pid in list(open_positions.keys()):
                try:
                    product = self.client.get_product(pid)
                    price = float(product.price)
                    self.risk_manager.on_trade_exit(pid, price, 'shutdown')
                except:
                    pass
        
        # Generate final summary
        self._generate_daily_summary()
        
        self.trade_logger.log_decision(
            agent=self.AGENT_NAME,
            action='SYSTEM_SHUTDOWN',
            rationale=f"Completed {self.cycle_count} cycles",
            details={
                'final_status': self.risk_engine.get_status(),
                'total_cycles': self.cycle_count
            }
        )
        
        status = self.risk_engine.get_status()
        logger.info(f"\n📊 FINAL STATUS:")
        logger.info(f"   Starting Capital: ${status['starting_capital']:.2f}")
        logger.info(f"   Final Equity:     ${status['equity']:.2f}")
        logger.info(f"   Total P&L:        ${status['total_pnl']:+.2f} ({status['total_pnl_pct']:+.1f}%)")
        logger.info(f"   Total Cycles:     {self.cycle_count}")
        logger.info(f"   Total Fees:       ${self.position_tracker.total_fees:.2f}")
        logger.info(f"\n{'='*60}")
        logger.info(f"✅ System shut down cleanly.")
        logger.info(f"{'='*60}\n")


def main():
    """Entry point."""
    orchestrator = Orchestrator()
    orchestrator.run()


if __name__ == '__main__':
    main()
