import math

# Fixed, versioned rules. Changes require an intentional version update.
PHYSICS_RULESET_VERSION = "1.0.0"

PROBABILITY_FIELDS = {"probability"}

NON_NEGATIVE_FIELDS = {
    "mass_kg",
    "distance_m",
    "duration_s",
}

NON_FINITE_STRINGS = {
    "nan",
    "+nan",
    "-nan",
    "inf",
    "+inf",
    "-inf",
    "infinity",
    "+infinity",
    "-infinity",
}


def get_assert(output, context):
    """Validate MCP tool arguments using deterministic rules."""

    metadata = (context or {}).get("metadata") or {}
    tool_args = metadata.get("toolArgs")

    if not isinstance(tool_args, dict):
        return {
            "pass": False,
            "score": 0,
            "reason": "Missing or invalid MCP tool arguments.",
        }

    recognized_fields = PROBABILITY_FIELDS | NON_NEGATIVE_FIELDS
    found_fields = recognized_fields.intersection(tool_args)

    errors = []

    if not found_fields:
        errors.append("No recognized measurement fields were provided.")

    for field in sorted(found_fields):
        value = tool_args[field]

        # Booleans are not valid measurements, even though Python
        # technically treats bool as a subclass of int.
        if isinstance(value, bool):
            errors.append(f"{field}: boolean is not a valid numeric value.")
            continue

        if isinstance(value, str):
            if value.strip().lower() in NON_FINITE_STRINGS:
                errors.append(f"{field}: non-finite value is not allowed.")
            else:
                errors.append(f"{field}: expected a numeric value.")
            continue

        if not isinstance(value, (int, float)):
            errors.append(f"{field}: expected a numeric value.")
            continue

        if isinstance(value, float) and not math.isfinite(value):
            errors.append(f"{field}: value must be finite.")
            continue

        if field in PROBABILITY_FIELDS and not 0 <= value <= 1:
            errors.append(f"{field}: must be between 0 and 1.")

        if field in NON_NEGATIVE_FIELDS and value < 0:
            errors.append(f"{field}: must be non-negative.")

    passed = not errors

    return {
        "pass": passed,
        "score": 1 if passed else 0,
        "reason": (
            f"Ruleset {PHYSICS_RULESET_VERSION}: "
            + ("All checks passed." if passed else " ".join(errors))
        ),
    }
