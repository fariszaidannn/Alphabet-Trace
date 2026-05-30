import json
import os

_DATA_PATH = os.path.join(os.path.dirname(__file__), "letters", "paths.json")
_library: dict = {}
_mtime: float = 0.0


def _load():
    global _library, _mtime
    current_mtime = os.path.getmtime(_DATA_PATH)
    if _library and current_mtime == _mtime:
        return
    with open(_DATA_PATH, "r", encoding="utf-8") as f:
        _library = json.load(f)
    _mtime = current_mtime


def get_letter(char: str) -> dict | None:
    _load()
    # Try exact key first (supports lowercase), fall back to uppercase
    return _library.get(char) or _library.get(char.upper())


def get_all_chars() -> list[str]:
    _load()
    return sorted(_library.keys())
