"""Declare the mission the fixed cases assume, once, with the fleet's DEPLOY key.

The runtime key an agent holds cannot do this on purpose; mint the deploy key in
the Alovia dashboard and run:

    ALOVIA_WATCHDOG_DEPLOY_KEY=wd_deploy_... python mission.py
"""

import os

from alovia_watchdog import Watchdog

deploy_key = os.environ["ALOVIA_WATCHDOG_DEPLOY_KEY"]

Watchdog(api_key=deploy_key).register_mission(
    "promptfoo-target",
    "Answer customer questions from the documents the agent reads and the knowledge base.",
    allowed_tools=["read_document", "search_kb"],
    deny_unlisted_tools=True,
    allowed_egress=[],
    bind_counterparties=True,
)
print("mission declared for promptfoo-target")
