"""Built-in tool definitions for voice agents."""

BUILT_IN_TOOLS = {
    "end_call": {
        "name": "end_call",
        "description": "End the current phone call.",
        "parameters": {
            "type": "object",
            "properties": {"reason": {"type": "string", "description": "Reason for ending the call"}},
            "required": ["reason"],
        },
    },
    "transfer_call": {
        "name": "transfer_call",
        "description": "Transfer the call to another phone number or department.",
        "parameters": {
            "type": "object",
            "properties": {
                "to_number": {"type": "string", "description": "Phone number to transfer to"},
                "department": {"type": "string", "description": "Department name"},
            },
            "required": [],
        },
    },
    "check_availability": {
        "name": "check_availability",
        "description": "Check availability for a given date and time.",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Date (YYYY-MM-DD)"},
                "time": {"type": "string", "description": "Time (HH:MM)"},
            },
            "required": ["date"],
        },
    },
    "book_appointment": {
        "name": "book_appointment",
        "description": "Book an appointment for the caller.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Caller's name"},
                "date": {"type": "string", "description": "Date (YYYY-MM-DD)"},
                "time": {"type": "string", "description": "Time (HH:MM)"},
                "notes": {"type": "string", "description": "Additional notes"},
            },
            "required": ["name", "date", "time"],
        },
    },
}


def get_tools_for_agent(tools_enabled: list[str]) -> list[dict]:
    return [BUILT_IN_TOOLS[name] for name in tools_enabled if name in BUILT_IN_TOOLS]
