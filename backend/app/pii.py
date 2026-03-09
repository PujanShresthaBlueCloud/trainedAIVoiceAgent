"""PII masking and redaction utilities for Australian compliance."""

import re


def mask_phone_number(phone: str | None) -> str:
    """Mask a phone number, keeping country code and last 4 digits.

    +61412345678 → +61****5678
    0412345678 → 0412****78
    """
    if not phone:
        return ""
    # Strip whitespace
    phone = phone.strip()
    if phone.startswith("+"):
        # International format: keep prefix (up to 3 chars) and last 4
        if len(phone) > 7:
            return phone[:3] + "****" + phone[-4:]
        return phone[:2] + "****"
    elif len(phone) >= 8:
        return phone[:4] + "****" + phone[-2:]
    return "****"


def mask_email(email: str | None) -> str:
    """Mask an email address.

    user@example.com → u***@example.com
    """
    if not email or "@" not in email:
        return ""
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"{local}***@{domain}"
    return f"{local[0]}***@{domain}"


# Australian phone patterns: +61, 04xx, (02), (03), (07), (08)
_AU_PHONE_RE = re.compile(
    r"(\+61\s?\d[\s\-]?\d{4}[\s\-]?\d{4})"  # +61 4xx xxx xxx
    r"|(\b0[2-478]\s?\d{4}\s?\d{4}\b)"        # 04xx xxx xxx, 02 xxxx xxxx
    r"|(\(\d{2}\)\s?\d{4}\s?\d{4})"           # (02) xxxx xxxx
)

# Medicare number: 10 or 11 digits, sometimes with spaces/dashes
_MEDICARE_RE = re.compile(
    r"\b(\d{4}\s?\d{5}\s?\d{1,2})\b"
)

# TFN (Tax File Number): 8 or 9 digits
_TFN_RE = re.compile(
    r"\b(\d{3}\s?\d{3}\s?\d{2,3})\b"
)

# Email in text
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b"
)


def redact_pii_from_transcript(text: str) -> str:
    """Redact Australian PII patterns from transcript text."""
    if not text:
        return text

    # Redact phone numbers
    text = _AU_PHONE_RE.sub("[PHONE REDACTED]", text)

    # Redact Medicare numbers
    text = _MEDICARE_RE.sub("[MEDICARE REDACTED]", text)

    # Redact emails
    text = _EMAIL_RE.sub("[EMAIL REDACTED]", text)

    # Redact TFN — run last as it's broader and might overlap
    # Only redact if it looks like a TFN context (near keywords)
    text = _redact_tfn_contextual(text)

    return text


def _redact_tfn_contextual(text: str) -> str:
    """Redact TFN only when near tax/TFN keywords to reduce false positives."""
    tfn_context_re = re.compile(
        r"(?:tax\s*file\s*number|tfn|tax\s*number)"
        r"[:\s\-]*(\d{3}\s?\d{3}\s?\d{2,3})",
        re.IGNORECASE,
    )
    return tfn_context_re.sub("[TFN REDACTED]", text)
