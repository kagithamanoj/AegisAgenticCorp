"""
Alex — Outreach Research Agent
Analyzes X (Twitter) profiles to extract pain points and context for personalized outreach.
"""

import os
import json
import logging
import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Add root for models
import sys
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))
try:
    from models.minimax import MinimaxOpenClawAgent
except ImportError:
    MinimaxOpenClawAgent = None

logger = logging.getLogger(__name__)

class AlexOutreachAgent:
    """
    Alex — Outreach Specialist
    Role: Social Listening & Pain-Point Discovery.
    """
    
    AGENT_NAME = 'Alex'
    
    def __init__(self):
        self.project_dir = Path(__file__).parent.parent
        self.blackboard_dir = self.project_dir / 'blackboard'
        self.ai = None
        if MinimaxOpenClawAgent and os.getenv('MINIMAX_API_KEY'):
            self.ai = MinimaxOpenClawAgent(self.AGENT_NAME, "Social Listening Specialist")

    def analyze_targets(self, session_id: str = None):
        """
        Reads targets.csv, 'scrapes' tweets (simulated), and files analysis to blackboard.
        """
        targets_file = self.project_dir / 'targets.csv'
        if not targets_file.exists():
            logger.error(f"Targets file not found: {targets_file}")
            return
            
        logger.info(f"🔍 {self.AGENT_NAME} starting target analysis cycle...")
        
        analysis_results = []
        
        with open(targets_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                handle = row['handle']
                name = row['name']
                company = row['company']
                
                logger.info(f"🧵 Analyzing @{handle} ({name})...")
                
                # In a real app, this would use a Twitter API client like Tweepy
                tweets = self._get_simulated_tweets(handle)
                
                # Analyze pain points via AI
                insight = self._extract_insights(name, company, tweets)
                
                analysis_results.append({
                    "handle": handle,
                    "name": name,
                    "company": company,
                    "recent_tweets": tweets,
                    "analysis": insight,
                    "session_id": session_id,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
        
        # File to blackboard
        output_file = self.blackboard_dir / 'research' / 'target_analysis.json'
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_file, 'w') as f:
            json.dump(analysis_results, f, indent=4)
            
        logger.info(f"📑 Outreach intelligence filed to {output_file}")
        return analysis_results

    def _get_simulated_tweets(self, handle: str) -> List[str]:
        """Provides simulated tweets based on the handle for demonstration."""
        simulations = {
            "elonmusk": [
                "AI safety is much more important than people realize.",
                "Starship is the key to multi-planetary life.",
                "Neuralink is making great progress on human trials.",
                "Engineering is the hardest part.",
                "X is the town square of the digital age."
            ],
            "sama": [
                "GPT-5 progress is looking very promising.",
                "The energy constraints on AGI are real.",
                "Worldcoin is scaling globally.",
                "We need more compute.",
                "AI agents will change how we work entirely."
            ],
            "shubham_saboo": [
                "Agentic workflows are the future of software.",
                "Scale is not enough; we need better UI/UX for AI.",
                "Building with OpenClaw is a game changer.",
                "Context windows are getting larger, but attention is still scarce.",
                "Empathy at scale is the missing piece in outreach."
            ],
            "manoj_kumar": [
                "AegisCorp is scaling fast. Efficiency is everything.",
                "The 'High Empathy Scaling' project is officially greenlit.",
                "Trading is just the first use case for the squad.",
                "Mission Control UI is looking premium.",
                "Always look for the 'actual cheat code' in every process."
            ]
        }
        return simulations.get(handle.lower(), [
            "Building something new today.",
            "Technology is evolving fast.",
            "How do we make AI more useful?",
            "Thinking about scalability.",
            "Networking with other builders."
        ])

    def _extract_insights(self, name: str, company: str, tweets: List[str]) -> str:
        """Uses AI to extract pain points and key themes from tweets."""
        if not self.ai:
            return "Simulated Insight: User is focused on technology and innovation."
            
        context = f"Target: {name} ({company})\nTweets:\n" + "\n".join([f"- {t}" for t in tweets])
        task = (
            "Identify the target's primary current focus, a potential 'pain point' or challenge they mention, "
            "and one unique personal detail or recent achievement. "
            "Respond in 2-3 concise bullet points."
        )
        
        # We'll use a sync wrapper because our loop is sync for now
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(self.ai.think_and_respond(task, context=context))
            return result.get('response', 'Could not analyze tweets.')
        except Exception as e:
            logger.error(f"AI Insights extraction failed: {e}")
            return "Analysis currently unavailable."
        finally:
            loop.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agent = AlexOutreachAgent()
    agent.analyze_targets(session_id="manual-test")
