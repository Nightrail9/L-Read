from pathlib import Path


def is_drive_root(path: Path) -> bool:
    return path == path.anchor and len(path.parts) <= 1


def normalize_local_path(path_str: str) -> Path:
    return Path(path_str).expanduser().resolve()
