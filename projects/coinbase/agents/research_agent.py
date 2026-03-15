"""
Research/Signal Agent — Alex
Pulls candles, computes technical indicators, outputs ranked trade candidates.
"""

import os
import logging
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

load_dotenv(Path(__file__).parents[1] / '.env')

from coinbase.rest import RESTClient

import sys
sys.path.insert(0, str(Path(__file__).parents[1]))
sys.path.insert(0, str(Path(__file__).parents[4]))  # Access root for models
from risk_engine import TradeCandidate
from trade_logger import TradeLogger
try:
    from models.minimax import MinimaxOpenClawAgent
except ImportError:
    logger.warning("Minimax models not found, AI validation will be disabled")
    MinimaxOpenClawAgent = None

logger = logging.getLogger(__name__)


class ResearchAgent:
    """
    Alex — Research/Signal Agent
    Finds high-probability trade setups with tight risk.
    """
    
    AGENT_NAME = 'Alex'
    
    def __init__(self, client: RESTClient, trade_logger: TradeLogger):
        self.client = client
        self.logger = trade_logger
        self.watch_list = os.getenv('WATCH_LIST', 'BTC-USD,ETH-USD,SOL-USD').split(',')
        self.watch_list = [p.strip() for p in self.watch_list]
        
        # Initialize Minimax AI Persona
        self.ai = None
        if MinimaxOpenClawAgent and os.getenv('MINIMAX_API_KEY'):
            try:
                self.ai = MinimaxOpenClawAgent('Alex', 'Research')
                logger.info("🧠 Alex AI (Minimax M2.5) initialized for validation")
            except Exception as e:
                logger.error(f"Failed to init AI: {e}")
    
    def _get_candles(self, product_id: str, granularity: str = 'FIFTEEN_MINUTE',
                     limit: int = 100) -> List[Dict]:
        """Fetch candle data from Coinbase with retry logic."""
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Calculate start and end times
                from datetime import timedelta
                end = datetime.now(timezone.utc)
                gran_minutes = {
                    'ONE_MINUTE': 1, 'FIVE_MINUTE': 5, 'FIFTEEN_MINUTE': 15,
                    'THIRTY_MINUTE': 30, 'ONE_HOUR': 60, 'SIX_HOUR': 360,
                    'ONE_DAY': 1440
                }
                minutes = gran_minutes.get(granularity, 15)
                start = end - timedelta(minutes=minutes * limit)
                
                candles = self.client.get_candles(
                    product_id=product_id,
                    start=str(int(start.timestamp())),
                    end=str(int(end.timestamp())),
                    granularity=granularity
                )
                if candles and hasattr(candles, 'candles'):
                    return [
                        {
                            'time': int(c.start),
                            'open': float(c.open),
                            'high': float(c.high),
                            'low': float(c.low),
                            'close': float(c.close),
                            'volume': float(c.volume)
                        }
                        for c in candles.candles
                    ]
                return []
            except Exception as e:
                if "429" in str(e) and attempt < max_retries - 1:
                    time.sleep(1 + attempt) # Backoff
                    continue
                logger.error(f"Error fetching candles for {product_id}: {e}")
                return []
        return []
    
    def _get_current_price(self, product_id: str) -> Optional[float]:
        """Get current price for a product."""
        try:
            product = self.client.get_product(product_id)
            return float(product.price)
        except Exception as e:
            logger.error(f"Error fetching price for {product_id}: {e}")
            return None
    
    def _compute_sma(self, closes: List[float], period: int) -> List[float]:
        """Compute Simple Moving Average."""
        sma = []
        for i in range(len(closes)):
            if i < period - 1:
                sma.append(None)
            else:
                sma.append(sum(closes[i-period+1:i+1]) / period)
        return sma
    
    def _compute_rsi(self, closes: List[float], period: int = 14) -> Optional[float]:
        """Compute RSI (Relative Strength Index)."""
        if len(closes) < period + 1:
            return None
        
        gains = []
        losses = []
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i-1]
            gains.append(max(0, diff))
            losses.append(max(0, -diff))
        
        if len(gains) < period:
            return None
        
        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))
    
    def _compute_macd(self, closes: List[float]) -> Optional[Dict]:
        """Compute MACD (12, 26, 9)."""
        if len(closes) < 26:
            return None
        
        def ema(data, period):
            multiplier = 2 / (period + 1)
            result = [data[0]]
            for i in range(1, len(data)):
                result.append((data[i] * multiplier) + (result[-1] * (1 - multiplier)))
            return result
        
        ema12 = ema(closes, 12)
        ema26 = ema(closes, 26)
        macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
        signal_line = ema(macd_line, 9)
        histogram = [macd_line[i] - signal_line[i] for i in range(len(closes))]
        
        return {
            'macd': macd_line[-1],
            'signal': signal_line[-1],
            'histogram': histogram[-1],
            'crossover': histogram[-1] > 0 and histogram[-2] <= 0 if len(histogram) > 1 else False,
            'crossunder': histogram[-1] < 0 and histogram[-2] >= 0 if len(histogram) > 1 else False
        }
    
    def _compute_bollinger(self, closes: List[float], period: int = 20, std_dev: float = 2.0) -> Optional[Dict]:
        """Compute Bollinger Bands."""
        if len(closes) < period:
            return None
        
        recent = closes[-period:]
        sma = sum(recent) / period
        variance = sum((x - sma) ** 2 for x in recent) / period
        std = variance ** 0.5
        
        return {
            'upper': sma + std_dev * std,
            'middle': sma,
            'lower': sma - std_dev * std,
            'bandwidth': (2 * std_dev * std) / sma * 100 if sma > 0 else 0,
            'pct_b': (closes[-1] - (sma - std_dev * std)) / (2 * std_dev * std) if std > 0 else 0.5
        }
    
    def _compute_atr(self, candles: List[Dict], period: int = 14) -> Optional[float]:
        """Compute Average True Range for stop-loss sizing."""
        if len(candles) < period + 1:
            return None
        
        true_ranges = []
        for i in range(1, len(candles)):
            high = candles[i]['high']
            low = candles[i]['low']
            prev_close = candles[i-1]['close']
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            true_ranges.append(tr)
        
        return sum(true_ranges[-period:]) / period
    
    def _compute_volume_spike(self, candles: List[Dict], period: int = 20) -> float:
        """Check if current volume is significantly above average."""
        if len(candles) < period + 1:
            return 1.0
        
        volumes = [c['volume'] for c in candles]
        avg_volume = sum(volumes[-period-1:-1]) / period
        current_volume = volumes[-1]
        
        return current_volume / avg_volume if avg_volume > 0 else 1.0
    
    def analyze_product(self, product_id: str) -> Optional[TradeCandidate]:
        """Analyze a single product and return a trade candidate if setup found."""
        # Add a small stagger to avoid hitting rate limits too hard in parallel mode
        import random
        import time
        time.sleep(random.uniform(0.1, 1.5)) 
        
        # Fetch candles (5-minute to capture rapid movements for the 5-hour window)
        candles = self._get_candles(product_id, 'FIVE_MINUTE', 100)
        if len(candles) < 30:
            logger.debug(f"{product_id}: Not enough candle data ({len(candles)} candles)")
            return None
        
        # Candles come newest first from Coinbase, reverse for chronological order
        candles = list(reversed(candles))
        closes = [c['close'] for c in candles]
        current_price = closes[-1]
        
        # Compute indicators
        sma20 = self._compute_sma(closes, 20)
        sma50 = self._compute_sma(closes, 50)
        rsi = self._compute_rsi(closes)
        macd = self._compute_macd(closes)
        bb = self._compute_bollinger(closes)
        atr = self._compute_atr(candles)
        vol_spike = self._compute_volume_spike(candles)
        
        if not all([rsi is not None, macd, bb, atr, sma20[-1], sma50[-1] if len(sma50) > 49 else True]):
            logger.debug(f"{product_id}: Insufficient indicator data")
            return None
        
        signals = {
            'price': current_price,
            'sma20': sma20[-1],
            'sma50': sma50[-1] if sma50[-1] else None,
            'rsi': rsi,
            'macd': macd,
            'bollinger': bb,
            'atr': atr,
            'volume_spike': vol_spike
        }
        
        # === SIGNAL LOGIC (Aggressive Low-Risk, Fast-Profit Model) ===
        candidate = None
        
        # Setup 1: Trend continuation (Extreme momentum required)
        if (sma50[-1] and current_price > sma50[-1] and current_price > sma20[-1] and
            rsi > 40 and rsi < 75 and  # Allow slightly higher RSI for strong momentum
            macd['histogram'] > 0 and vol_spike > 1.2):
            
            # Ultra-tight risk, immediate quick profit target
            stop = current_price - (0.5 * atr)
            target = current_price + (1.5 * atr)
            
            candidate = TradeCandidate(
                product_id=product_id,
                direction='long',
                entry_price=current_price,
                stop_loss=stop,
                take_profit=target,
                rationale=f"Trend continuation: fast momentum, "
                         f"RSI={rsi:.0f}, MACD bullish, vol={vol_spike:.1f}x",
                signals=signals
            )
        
        # Setup 2: Mean reversion (Not taken in aggressive short-term momentum strategy unless extreme)
        elif (bb['pct_b'] < 0.05 and rsi < 30 and
              macd['histogram'] > macd.get('prev_histogram', macd['histogram'] - 0.01)):
            
            stop = current_price - (0.5 * atr)
            target = current_price + (1.0 * atr)  # Very fast target
            
            candidate = TradeCandidate(
                product_id=product_id,
                direction='long',
                entry_price=current_price,
                stop_loss=stop,
                take_profit=target,
                rationale=f"Deep mean reversion: BB %B={bb['pct_b']:.2f}, RSI={rsi:.0f} oversold, "
                         f"MACD turning up",
                signals=signals
            )
        
        # Setup 3: Breakout (Must have massive volume)
        elif (vol_spike > 2.5 and current_price > bb['upper'] and
              rsi > 55 and rsi < 85 and
              macd['crossover']):
            
            stop = current_price - (0.5 * atr)
            target = current_price + (2.0 * atr)
            
            candidate = TradeCandidate(
                product_id=product_id,
                direction='long',
                entry_price=current_price,
                stop_loss=stop,
                take_profit=target,
                rationale=f"Hyper-Breakout: massive volume {vol_spike:.1f}x avg, price above upper BB, "
                         f"MACD crossover, RSI={rsi:.0f}",
                signals=signals
            )
        
        # Check minimum R:R
        if candidate:
            if candidate.reward_risk_ratio < 2.0:
                logger.debug(f"{product_id}: Setup found but R:R too low ({candidate.reward_risk_ratio:.1f}:1)")
                return None
                
            # === AI VALIDATION LAYER ===
            if self.ai:
                prompt = (
                    f"I found a mathematical setup for {product_id}. "
                    f"Price: ${current_price:.2f}. "
                    f"RSI: {rsi:.0f}. MACD Histogram: {macd['histogram']:.4f}. Volume Spike: {vol_spike:.1f}x. "
                    f"Bollinger %B: {bb['pct_b']:.2f}. "
                    f"Proposed Entry: ${candidate.entry_price:.2f}, Stop: ${candidate.stop_loss:.2f}, Target: ${candidate.take_profit:.2f}. "
                    f"Mathematical Rationale: {candidate.rationale}. "
                    f"Based on your knowledge of crypto market dynamics, and specifically considering the heavy market volatility due to the ongoing Iran war escalation, is this a safe setup to take right now? Factor in geopolitical risks. "
                    f"Start your response with 'YES' or 'NO', followed by a 1-sentence analytical reason."
                )
                
                logger.info(f"🧠 Asking Alex AI to validate {product_id} setup...")
                import asyncio
                try:
                    # Run async validation synchronously since scan_markets is sync
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
                        logger.warning(f"❌ AI Rejected {product_id}: {ai_text}")
                        self.logger.log_decision(self.AGENT_NAME, 'AI_REJECTED', f"AI Rejected {product_id}: {ai_text}")
                        return None
                        
                    # Append AI reason to rationale
                    candidate.rationale += f" | AI Validation: {ai_text}"
                except Exception as e:
                    logger.error(f"AI validation failed: {e}")
                    # Fail open if AI crashes to keep trading alive
        
        return candidate
    
    def scan_markets(self, write_to_blackboard: bool = True, session_id: str = None) -> List[TradeCandidate]:
        """Scan all watch list pairs and return ranked candidates."""
        candidates = []
        
        # Determine effective watch list
        effective_list = self.watch_list
        if len(self.watch_list) == 1 and self.watch_list[0].upper() == 'ALL':
            try:
                logger.info("🔭 Dynamic Market Discovery: Fetching all tradable USD pairs from Coinbase...")
                products = self.client.get_products()
                effective_list = [
                    p.product_id for p in products.products 
                    if p.quote_currency_id in ['USD', 'USDC'] and p.status == 'online' and not p.auction_mode
                ]
                logger.info(f"🔭 Discovery Complete: Found {len(effective_list)} active pairs.")
            except Exception as e:
                logger.error(f"Failed to fetch products: {e}")
                effective_list = ['BTC-USD', 'ETH-USD', 'SOL-USD'] # Fallback

        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='MARKET_SCAN_START',
            rationale=f"Scanning {len(effective_list)} pairs"
        )
        
        # Parallel Execution to keep 2-minute cadence
        with ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(self.analyze_product, effective_list))
            candidates = [c for c in results if c is not None]
        
        # Sort by reward:risk ratio (highest first), limit to 10 (increased for larger pool)
        candidates.sort(key=lambda c: c.reward_risk_ratio, reverse=True)
        candidates = candidates[:10]
        
        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='MARKET_SCAN_COMPLETE',
            rationale=f"Found {len(candidates)} candidates from {len(effective_list)} pairs",
            details={
                'candidates': [
                    {
                        'product_id': c.product_id,
                        'entry': c.entry_price,
                        'stop': c.stop_loss,
                        'target': c.take_profit,
                        'rr': c.reward_risk_ratio,
                        'rationale': c.rationale
                    }
                    for c in candidates
                ]
            }
        )

        if write_to_blackboard and candidates:
            import json
            blackboard_dir = Path(__file__).parent.parent / 'blackboard' / 'research'
            blackboard_dir.mkdir(parents=True, exist_ok=True)
            output_file = blackboard_dir / 'candidates.json'
            
            with open(output_file, 'w') as f:
                json.dump([
                    {
                        'product_id': c.product_id,
                        'direction': c.direction,
                        'entry_price': c.entry_price,
                        'stop_loss': c.stop_loss,
                        'take_profit': c.take_profit,
                        'rationale': c.rationale,
                        'session_id': session_id,
                        'timestamp': datetime.now(timezone.utc).isoformat()
                    }
                    for c in candidates
                ], f, indent=4)
            logger.info(f"📑 Filed {len(candidates)} candidates to blackboard/research/candidates.json")
        
        return candidates

    def scan_intel(self, session_id: str = None) -> Dict:
        """
        General intelligence sweep: Hacker News, tech trends, etc.
        Fulfillment of the 'Intelligence Backbone' role in SOUL.md.
        """
        logger.info(f"🔍 {self.AGENT_NAME} running general intelligence sweep...")
        
        # In a real implementation, this would use API clients for HN, Reddit, etc.
        # For this alignment phase, we'll simulate the sweep results based on current tech context.
        intel_report = {
            "session_id": session_id,
            "date": datetime.now(timezone.utc).isoformat(),
            "critical": [
                {
                    "title": "Heavy Market Movement Due to Iran War Escalation",
                    "source": "Bloomberg / Reuters",
                    "summary": "Global markets, including crypto, are experiencing massive volatility due to recent military escalations involving Iran. Traders are bracing for severe price swings.",
                    "relevance": "Critical"
                }
            ],
            "important": [
                {
                    "title": "Crypto Safe Haven Narrative Tested",
                    "source": "CoinDesk",
                    "summary": "Investors are closely watching if major cryptocurrencies act as safe havens or risk assets during the geopolitical crisis.",
                    "relevance": "High"
                }
            ],
            "trending_keywords": ["Iran War", "Crypto Volatility", "Geopolitics", "Safe Haven"]
        }
        
        blackboard_dir = Path(__file__).parent.parent / 'blackboard' / 'research'
        blackboard_dir.mkdir(parents=True, exist_ok=True)
        output_file = blackboard_dir / 'intel.json'
        
        with open(output_file, 'w') as f:
            json.dump(intel_report, f, indent=4)
            
        logger.info(f"📰 Intelligence report filed to blackboard/research/intel.json")
        
        # Log decision to dashboard-style logger
        self.logger.log_decision(
            agent=self.AGENT_NAME,
            action='INTEL_SWEEP_COMPLETE',
            rationale=f"Found {len(intel_report['critical'])} critical insights",
            details=intel_report
        )
        
        return intel_report
