"""Compatibility entry point: the maintained browser suite now loads real JS modules."""
from pathlib import Path
import subprocess
subprocess.run(['node', str(Path(__file__).with_name('browser.mjs'))], check=True)
