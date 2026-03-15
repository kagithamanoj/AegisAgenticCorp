"""
Zara — Outreach Content Agent
Transforms outreach intelligence into high-empathy personalized openers.
"""

import os
import json
import logging
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

class ZaraOutreachAgent:
    """
    Zara — Personalization Specialist
    Role: High-Empathy Copywriting.
    """
    
    AGENT_NAME = 'Zara'
    
    def __init__(self):
        self.project_dir = Path(__file__).parent.parent
        self.blackboard_dir = self.project_dir / 'blackboard'
        self.ai = MinimaxOpenClawAgent(self.AGENT_NAME, "High-Empathy Personalization Specialist")

    async def generate_drafts(self, session_id: str = None):
        """
        Reads target_analysis.json from blackboard and generates personalized drafts.
        Files the drafts to blackboard/content/drafts.json.
        """
        analysis_file = self.blackboard_dir / 'research' / 'target_analysis.json'
        if not analysis_file.exists():
            logger.error(f"Analysis file not found: {analysis_file}")
            return
            
        logger.info(f"🎨 {self.AGENT_NAME} starting draft generation cycle...")
        
        try:
            with open(analysis_file, 'r') as f:
                analyses = json.load(f)
        except Exception as e:
            logger.error(f"Failed to read analysis from blackboard: {e}")
            return
            
        drafts = []
        for item in analyses:
            # Filter by session_id
            if session_id and item.get('session_id') != session_id:
                continue
                
            handle = item['handle']
            name = item['name']
            company = item['company']
            intel = item['analysis']
            
            logger.info(f"✨ Drafting opener for @{handle}...")
            
            # Generate personalized opener via AI
            content = await self._craft_opener(name, company, intel)
            
            drafts.append({
                "target_handle": handle,
                "target_name": name,
                "target_company": company,
                "intel_used": intel,
                "draft": content,
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "DRAFT"
            })
            
        # File to blackboard
        output_file = self.blackboard_dir / 'content' / 'drafts.json'
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            # Append or create
            existing = []
            if output_file.exists():
                with open(output_file, 'r') as f:
                    existing = json.load(f)
                    
            existing.extend(drafts)
            
            with open(output_file, 'w') as f:
                json.dump(existing, f, indent=4)
                
            logger.info(f"✨ Zara filed {len(drafts)} new drafts to {output_file}")
        except Exception as e:
            logger.error(f"Failed to write drafts to blackboard: {e}")
            
        return drafts

    async def _craft_opener(self, name: str, company: str, intel: str) -> str:
        """Uses AI to craft a personalized opener based on intel."""
        context = f"Target: {name} ({company})\nIntel:\n{intel}"
        task = (
            "Craft a highly personalized, empathetic cold outreach opener for X (Twitter) DM. "
            "The goal is to show you've actually read their recent thoughts and understand their immediate pain points. "
            "Avoid generic praise or 'checked your profile' boilerplate. "
            "Hit their pain point directly but professionally. "
            "Structure: 1-2 sentences max. Extremely punchy."
        )
        
        try:
            result = await self.ai.think_and_respond(task, context=context)
            return result.get('response', 'Opener unavailable.')
        except Exception as e:
            logger.error(f"AI draft generation failed: {e}")
            return "Personalized draft currently unavailable."

if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    zara = ZaraOutreachAgent()
    asyncio.run(zara.generate_drafts(session_id="manual-test"))
