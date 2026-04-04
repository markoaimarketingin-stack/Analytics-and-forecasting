# Analytics Agent Package
"""
A comprehensive analytics and forecasting engine for marketing performance analysis.
"""

from .analytics_runner import AnalyticsRunner
from .config import settings

__version__ = "1.0.0"
__all__ = ["AnalyticsRunner", "settings"]
