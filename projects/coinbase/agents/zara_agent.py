"""
Content Agent — Zara
Transforms research intel into compelling content and narratives.
"""

import os
import json
import logging
import asyncio
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime, timezone

# Add parent directory to sys.path to import common modules
import sys
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root.parent.parent)) # Root for models

try:
    from models.minimax import MinimaxOpenClawAgent
except ImportError:
    # Fallback or mock if models not found in path
    logger = logging.getLogger(__name__)
    logger.error("Could not import MinimaxOpenClawAgent. Ensure models/ directory is in path.")
    class MinimaxOpenClawAgent:
        def __init__(self, *args, **kwargs): pass
        async def think_and_respond(self, *args, **kwargs): return {"thinking": "Mock", "response": "Mock Content"}

logger = logging.getLogger(__name__)

class ZaraAgent:
    """
    Zara — Content & Marketing Agent
    Turns intelligence into impact.
    """
    
    AGENT_NAME = 'Zara'
    
    def __init__(self, blackboard_dir: Path = None):
        self.blackboard_dir = blackboard_dir or Path(__file__).parent.parent / 'blackboard'
        self.ai = MinimaxOpenClawAgent(self.AGENT_NAME, "Content Creation Specialist")
        self.logger = logging.getLogger(f"{__name__}.{self.AGENT_NAME}")

    async def draft_from_blackboard(self, session_id: str = None):
        """
        Check blackboard/research/intel.json and draft content.
        Files the drafts to blackboard/content/drafts.json.
        """
        intel_file = self.blackboard_dir / 'research' / 'intel.json'
        
        if not intel_file.exists():
            return None
            
        self.logger.info(f"🎨 Zara drafting content based on intel from {intel_file}")
        
        try:
            with open(intel_file, 'r') as f:
                intel_data = json.load(f)
                
            # [v2026.2.21 Alignment] Filter by session_id if provided
            if session_id and intel_data.get('session_id') != session_id:
                self.logger.debug(f"⏭️ Skipping intel from different session: {intel_data.get('session_id')}")
                return None
        except Exception as e:
            self.logger.error(f"Failed to read intel from blackboard: {e}")
            return None
            
        # Prepare the prompt for Zara
        context = json.dumps(intel_data, indent=2)
        task = (
            "Based on the provided intelligence report, create a high-impact content draft. "
            "Synthesize the critical and important insights into a narrative that positions Manoj as a thought leader. "
            "Include a draft for a Twitter/X thread and a LinkedIn post preview."
        )
        
        result = await self.ai.think_and_respond(task, context=context)
        
        draft = {
            "session_id": session_id,
            "source_intel_date": intel_data.get("date"),
            "thinking": result.get("thinking"),
            "content": result.get("response"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "DRAFT"
        }
        
        output_file = self.blackboard_dir / 'content' / 'drafts.json'
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            # Append to existing drafts or create new list
            existing_drafts = []
            if output_file.exists():
                with open(output_file, 'r') as f:
                    existing_drafts = json.load(f)
            
            existing_drafts.append(draft)
            
            with open(output_file, 'w') as f:
                json.dump(existing_drafts, f, indent=4)
                
            self.logger.info(f"✨ Zara filed a new draft to blackboard/content/drafts.json")
        except Exception as e:
            self.logger.error(f"Failed to write draft to blackboard: {e}")
            
        return draft

if __name__ == "__main__":
    # Quick test
    logging.basicConfig(level=logging.INFO)
    zara = ZaraAgent()
    asyncio.run(zara.draft_from_blackboard())
