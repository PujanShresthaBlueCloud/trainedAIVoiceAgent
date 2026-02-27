"""Built-in tool definitions for voice agents."""
from app.database import get_supabase

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
    """Return tool definitions for enabled tools, including custom functions from DB."""
    tools = []
    custom_names = []

    for name in tools_enabled:
        if name in BUILT_IN_TOOLS:
            tools.append(BUILT_IN_TOOLS[name])
        else:
            custom_names.append(name)

    # Load custom functions from database
    if custom_names:
        try:
            db = get_supabase()
            result = db.table("custom_functions").select("*").eq("is_active", True).in_("name", custom_names).execute()
            for func in result.data or []:
                params = func.get("parameters") or {}
                tools.append({
                    "name": func["name"],
                    "description": func.get("description") or f"Custom function: {func['name']}",
                    "parameters": params if params.get("type") else {
                        "type": "object",
                        "properties": params,
                        "required": [],
                    },
                })
        except Exception:
            pass

    return tools


def get_custom_function_metadata(name: str) -> dict | None:
    """Get full custom function record for speak hints etc."""
    try:
        db = get_supabase()
        result = db.table("custom_functions").select("*").eq("name", name).eq("is_active", True).execute()
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return None
