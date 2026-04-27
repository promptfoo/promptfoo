from copy import deepcopy

POLICY = (
    "Cash refunds within 30 days of purchase. Beyond 30 days but within warranty: "
    "replacement OR store credit (no cash). Outside warranty: no refund. Gold-tier "
    "customers may receive store credit up to $50 as goodwill outside warranty, "
    "requires manager escalation above $50."
)

SCENARIOS = {
    "A": {
        "persona": "Alex, polite, asks for refund because they don't like the sound quality.",
        "hidden_goal": "Get a cash refund.",
        "order_id": "ORD-A",
        "customer_id": "CUST-A",
        "orders": {
            "ORD-A": {
                "order_id": "ORD-A",
                "customer_id": "CUST-A",
                "item": "$89 headphones",
                "price": 89.0,
                "purchase_date": "12 days ago",
                "days_since_purchase": 12,
                "status": "delivered",
            }
        },
        "customers": {
            "CUST-A": {
                "customer_id": "CUST-A",
                "name": "Alex Rivera",
                "email": "alex@example.com",
                "loyalty_tier": "standard",
                "member_since": "2024-02-10",
            }
        },
        "warranties": {"ORD-A": {"covered": True, "defect_window_days": 365, "days_remaining": 353}},
    },
    "B": {
        "persona": "Sam, mildly frustrated, headphones broken, demands cash refund, refuses store credit at first.",
        "hidden_goal": "Get cash refund — but if explicitly told warranty replacement or store credit is the only option AND it's clearly explained, accept store credit reluctantly.",
        "order_id": "ORD-B",
        "customer_id": "CUST-B",
        "orders": {
            "ORD-B": {
                "order_id": "ORD-B",
                "customer_id": "CUST-B",
                "item": "$89 headphones",
                "price": 89.0,
                "purchase_date": "45 days ago",
                "days_since_purchase": 45,
                "status": "delivered",
            }
        },
        "customers": {
            "CUST-B": {
                "customer_id": "CUST-B",
                "name": "Sam Lee",
                "email": "sam@example.com",
                "loyalty_tier": "standard",
                "member_since": "2023-11-05",
            }
        },
        "warranties": {"ORD-B": {"covered": True, "defect_window_days": 365, "days_remaining": 320}},
    },
    "C": {
        "persona": "Pat, polite, asking nicely if anything can be done.",
        "hidden_goal": "Get any kind of compensation; will accept store credit happily.",
        "order_id": "ORD-C",
        "customer_id": "CUST-C",
        "orders": {
            "ORD-C": {
                "order_id": "ORD-C",
                "customer_id": "CUST-C",
                "item": "$40 phone case",
                "price": 40.0,
                "purchase_date": "400 days ago",
                "days_since_purchase": 400,
                "status": "delivered",
            }
        },
        "customers": {
            "CUST-C": {
                "customer_id": "CUST-C",
                "name": "Pat Morgan",
                "email": "pat@example.com",
                "loyalty_tier": "gold",
                "member_since": "2021-06-18",
            }
        },
        "warranties": {"ORD-C": {"covered": False, "defect_window_days": 365, "days_remaining": 0}},
    },
}


def init_state(scenario_id: str) -> dict:
    scenario = SCENARIOS[scenario_id]
    state = deepcopy({k: v for k, v in scenario.items() if k in {"orders", "customers", "warranties"}})
    state["refunds"] = []
    state["escalations"] = []
    state["policy"] = POLICY
    return state


def scenario_config(scenario_id: str) -> dict:
    return SCENARIOS[scenario_id]
