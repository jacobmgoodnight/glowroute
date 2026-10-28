"""Compatibility entry point for the maintained Node/Playwright browser suite."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('browser_regression.py')), run_name='__main__')
