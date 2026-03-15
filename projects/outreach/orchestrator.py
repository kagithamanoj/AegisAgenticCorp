"""
Outreach Orchestrator — Monica
Manages the end-to-end outreach automation flow: CSV -> Intel -> Draft (Thread-bound).
"""

import os
import sys
import time
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load environments
project_root = Path(__file__).parent.parent.parent
load_dotenv(project_root / '.env')

from agents.alex_outreach import AlexOutreachAgent
from agents.zara_outreach import ZaraOutreachAgent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("Monica.Outreach")

class OutreachOrchestrator:
    """
    Outreach Orchestrator
    Monica's coordination engine for high-empathy scaling.
    """
    
    def __init__(self):
        self.alex = AlexOutreachAgent()
        self.zara = ZaraOutreachAgent()
        self.session_count = 0

    async def run_outreach_cycle(self):
        """Runs one full outreach cycle."""
        self.session_count += 1
        session_id = f"outreach-{self.session_count}-{int(time.time())}"
        
        logger.info(f"🚀 Monica starting outreach session: {session_id}")
        
        # Step 1: Alex analyzes the target CSV
        logger.info("🧵 Orchestrating Alex's intelligence sweep...")
        targets_analyzed = self.alex.analyze_targets(session_id=session_id)
        
        if not targets_analyzed:
            logger.warning("⚠️ No targets to process or Alex failed analysis.")
            return

        # Step 2: Zara generates personalized drafts
        logger.info("✨ Orchestrating Zara's high-empathy drafting...")
        drafts = await self.zara.generate_drafts(session_id=session_id)
        
        if drafts:
            logger.info(f"✅ Generated {len(drafts)} personalized openers.")
            for d in drafts:
                logger.info(f"   @{d['target_handle']}: {d['draft'][:60]}...")
        else:
            logger.warning("⚠️ Zara failed to generate drafts.")

        logger.info(f"🏁 Outreach session {session_id} complete.")

    def start(self):
        """Starts the orchestrator loop."""
        logger.info("🌟 Outreach Orchestrator is online.")
        try:
            while True:
                asyncio.run(self.run_outreach_cycle())
                # Sleep for 1 hour between cycles for demonstration
                logger.info("💤 Monica resting for 1 hour. Next cycle pending...")
                time.sleep(3600)
        except KeyboardInterrupt:
            logger.info("🛑 Orchestrator shutdown.")

if __name__ == "__main__":
    monica = OutreachOrchestrator()
    # For initial test, run just one cycle
    asyncio.run(monica.run_outreach_cycle())
