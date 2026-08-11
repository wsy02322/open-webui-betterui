#!/usr/bin/env python3
"""
BetterUI server-side patch: strip model-bound reasoning_details on cross-model replay.

Aligns with upstream open-webui#28245 / #28240:
  - Keep reasoning.summary / reasoning.text when switching models
  - Drop reasoning.encrypted and signature-bearing details for a *different* model
  - Leave same-model turns untouched (Anthropic signatures / encrypted replay)

Applied at container start against the image's middleware.py (idempotent).
Does NOT modify the Open WebUI git tree — lives under deploy/hetzner-custom/.

Usage:
  python3 strip_bound_reasoning.py [/path/to/middleware.py]
  python3 strip_bound_reasoning.py --check [/path/to/middleware.py]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

MARKER = 'betterui-strip-bound-reasoning'
DEFAULT_MIDDLEWARE = Path('/app/backend/open_webui/utils/middleware.py')

STRIP_FN = '''
def strip_bound_reasoning_details(output: list) -> list:
    """Drop model-bound reasoning_details; providers reject them on another model (#28240)."""
    # betterui-strip-bound-reasoning
    stripped = []
    for item in output:
        details = item.get('reasoning_details')
        if item.get('type') == 'reasoning' and details:
            if not isinstance(details, list):
                details = [details]
            portable = [
                detail
                for detail in details
                if not (
                    isinstance(detail, dict)
                    and (detail.get('type') == 'reasoning.encrypted' or 'signature' in detail)
                )
            ]
            if len(portable) != len(details):
                item = {k: v for k, v in item.items() if k != 'reasoning_details'}
                if portable:
                    item['reasoning_details'] = portable
        stripped.append(item)
    return stripped

'''

PROCESS_FN = '''def process_messages_with_output(
    messages: list[dict],
    model_id: str,
    reasoning_format: str | None = None,
) -> list[dict]:
    """
    Process messages with OR-aligned output items for LLM consumption.

    For assistant messages with 'output' field, produces properly formatted
    OpenAI-style messages (tool_calls + tool results). Strips 'output' before LLM.
    Model-bound reasoning_details from a different model are dropped.
    """
    # betterui-strip-bound-reasoning
    processed = []

    for message in messages:
        if message.get('role') == 'assistant' and message.get('output'):
            output = message['output']
            source_model = message.get('model')
            if source_model and source_model != model_id and isinstance(output, list):
                output = strip_bound_reasoning_details(output)

            # Use output items for clean OpenAI-format messages
            output_messages = convert_output_to_messages(
                output,
                raw=True,
                reasoning_format=reasoning_format,
            )
            if output_messages:
                processed.extend(output_messages)
                continue

        # Strip 'output' and 'model' before adding (LLM shouldn't see them)
        clean_message = {k: v for k, v in message.items() if k not in ('output', 'model')}
        processed.append(clean_message)

    return processed
'''


def _ensure_model_in_key_tuple(text: str) -> str:
    """Ensure 'model' is kept when loading/continuing messages from DB."""

    def add_model(match: re.Match) -> str:
        inner = match.group(1)
        if "'model'" in inner or '"model"' in inner:
            return match.group(0)
        # Insert before closing paren of the tuple
        return match.group(0).replace(inner, inner.rstrip() + ", 'model'")

    # Matches: if k in ('role', 'content', ... )  or with 'id'/'usage' variants
    pattern = re.compile(
        r"if k in \(("
        r"(?:'[^']+'(?:\s*,\s*)?)+"
        r")\)"
    )

    # Only rewrite tuples that look like the persisted-message key filter
    def replacer(match: re.Match) -> str:
        inner = match.group(1)
        keys = {k.strip().strip("'\"") for k in inner.split(',') if k.strip()}
        if not {'role', 'content', 'output'}.issubset(keys):
            return match.group(0)
        if 'model' in keys:
            return match.group(0)
        cleaned = inner.rstrip().rstrip(',')
        return f"if k in ({cleaned}, 'model')"

    return pattern.sub(replacer, text)


def _replace_process_messages_with_output(text: str) -> str:
    # Match from function def through its return processed / end of function
    pattern = re.compile(
        r'^def process_messages_with_output\([\s\S]*?^    return processed\n',
        re.MULTILINE,
    )
    match = pattern.search(text)
    if not match:
        raise RuntimeError('Could not find process_messages_with_output() to patch')

    original_fn = match.group(0)
    replacement = PROCESS_FN.rstrip() + '\n'

    # Preserve newer convert_output_to_messages kwargs if present in the image
    if 'flatten_tool_images' in original_fn and 'flatten_tool_images' not in replacement:
        replacement = replacement.replace(
            'reasoning_format=reasoning_format,\n            )',
            'reasoning_format=reasoning_format,\n'
            '                flatten_tool_images=True,\n'
            '            )',
        )

    return text[: match.start()] + replacement + text[match.end() :]


def _insert_strip_fn(text: str) -> str:
    if 'def strip_bound_reasoning_details(' in text:
        return text
    anchor = 'def process_messages_with_output('
    idx = text.find(anchor)
    if idx < 0:
        raise RuntimeError('Could not find insertion point for strip_bound_reasoning_details')
    return text[:idx] + STRIP_FN.lstrip('\n') + '\n\n' + text[idx:]


def _patch_call_site(text: str) -> str:
    """Ensure process_messages_with_output(..., model_id=model['id'], ...)."""
    # Already patched
    if re.search(r"process_messages_with_output\(\s*[^)]*model_id\s*=", text):
        return text

    pattern = re.compile(
        r"form_data\['messages'\] = process_messages_with_output\(\s*"
        r"form_data\.get\('messages', \[\]\),\s*"
        r"reasoning_format=get_reasoning_format\(model\),\s*"
        r"\)",
        re.MULTILINE,
    )
    replacement = (
        "form_data['messages'] = process_messages_with_output(\n"
        "        form_data.get('messages', []),\n"
        "        model_id=model['id'],\n"
        "        reasoning_format=get_reasoning_format(model),\n"
        "    )"
    )
    new_text, n = pattern.subn(replacement, text, count=1)
    if n != 1:
        raise RuntimeError('Could not find process_messages_with_output() call site to patch')
    return new_text


def _patch_other_call_sites(text: str) -> str:
    """
    Tool-loop / internal rebuilds also call process_messages_with_output.
    After signature change they need model_id. Patch common patterns.
    """
    # convert_output_to_messages is preferred in tool loops; also catch remaining
    # process_messages_with_output(messages, reasoning_format=...) without model_id
    pattern = re.compile(
        r'process_messages_with_output\(\s*'
        r'(?P<msgs>[^,]+?),\s*'
        r'reasoning_format=(?P<rf>[^\n,]+?)\s*'
        r'\)'
    )

    def repl(m: re.Match) -> str:
        return (
            f"process_messages_with_output(\n"
            f"                        {m.group('msgs').strip()},\n"
            f"                        model_id=model.get('id') if isinstance(model, dict) else form_data.get('model'),\n"
            f"                        reasoning_format={m.group('rf').strip()},\n"
            f"                    )"
        )

    # Only replace sites that don't already pass model_id
    out = []
    last = 0
    for m in pattern.finditer(text):
        window_start = max(0, m.start() - 80)
        if 'model_id=' in text[window_start : m.end()]:
            continue
        out.append(text[last : m.start()])
        out.append(repl(m))
        last = m.end()
    out.append(text[last:])
    return ''.join(out)


def is_patched(text: str) -> bool:
    return MARKER in text and 'def strip_bound_reasoning_details(' in text


def apply_patch(path: Path) -> bool:
    original = path.read_text(encoding='utf-8')
    if is_patched(original):
        print(f'[betterui] already patched: {path}')
        return False

    text = original
    text = _ensure_model_in_key_tuple(text)
    text = _insert_strip_fn(text)
    text = _replace_process_messages_with_output(text)
    text = _patch_call_site(text)
    text = _patch_other_call_sites(text)

    if not is_patched(text):
        raise RuntimeError('Patch applied but marker missing — aborting write')

    # Sanity: signature must include model_id
    if "model_id: str" not in text:
        raise RuntimeError('Patch failed: process_messages_with_output missing model_id')

    backup = path.with_suffix(path.suffix + '.betterui.bak')
    if not backup.exists():
        backup.write_text(original, encoding='utf-8')
        print(f'[betterui] backup: {backup}')

    path.write_text(text, encoding='utf-8')
    print(f'[betterui] patched: {path}')
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description='Apply BetterUI strip-bound-reasoning patch')
    parser.add_argument(
        'middleware',
        nargs='?',
        type=Path,
        default=DEFAULT_MIDDLEWARE,
        help=f'Path to middleware.py (default: {DEFAULT_MIDDLEWARE})',
    )
    parser.add_argument('--check', action='store_true', help='Exit 0 if patched, 1 otherwise')
    args = parser.parse_args()

    path = args.middleware
    if not path.is_file():
        print(f'[betterui] middleware not found: {path}', file=sys.stderr)
        return 1

    if args.check:
        ok = is_patched(path.read_text(encoding='utf-8'))
        print('[betterui] patched' if ok else '[betterui] not patched')
        return 0 if ok else 1

    try:
        apply_patch(path)
    except Exception as e:
        print(f'[betterui] ERROR: {e}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
