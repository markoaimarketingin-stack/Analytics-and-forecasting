#!/usr/bin/env python3
"""
Command Line Interface for Analytics Agent

Usage:
    python cli.py run <payload_file.json>
    python cli.py budget-sensitivity <base_payload.json> --budgets 10000 15000 20000
    python cli.py break-even <payload.json>
    python cli.py ltv-projection <payload.json> --months 12
    python cli.py cfo-mode <payload.json>
"""
import json
import sys
import argparse
from typing import Dict, Any
from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.logging_config import get_logger

logger = get_logger(__name__)


def load_json_file(file_path: str) -> Dict[str, Any]:
    """Load JSON data from file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error("File not found", file_path=file_path)
        sys.exit(1)
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON file", file_path=file_path, error=str(e))
        sys.exit(1)


def save_json_output(data: Dict[str, Any], output_file: str = None) -> None:
    """Save output to file or print to stdout."""
    if output_file:
        try:
            with open(output_file, 'w') as f:
                json.dump(data, f, indent=2)
            logger.info("Output saved to file", file_path=output_file)
        except Exception as e:
            logger.error("Failed to save output", error=str(e))
            sys.exit(1)
    else:
        print(json.dumps(data, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Analytics Agent CLI")
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Run command
    run_parser = subparsers.add_parser('run', help='Run full analytics pipeline')
    run_parser.add_argument('payload_file', help='JSON file with analytics payload')
    run_parser.add_argument('--output', '-o', help='Output file (default: stdout)')

    # Budget sensitivity command
    budget_parser = subparsers.add_parser('budget-sensitivity', help='Analyze budget sensitivity')
    budget_parser.add_argument('payload_file', help='JSON file with base payload')
    budget_parser.add_argument('--budgets', nargs='+', type=float, required=True,
                              help='Budget amounts to test')
    budget_parser.add_argument('--output', '-o', help='Output file (default: stdout)')

    # Break-even command
    break_even_parser = subparsers.add_parser('break-even', help='Calculate break-even analysis')
    break_even_parser.add_argument('payload_file', help='JSON file with analytics payload')
    break_even_parser.add_argument('--output', '-o', help='Output file (default: stdout)')

    # LTV projection command
    ltv_parser = subparsers.add_parser('ltv-projection', help='Project LTV over time')
    ltv_parser.add_argument('payload_file', help='JSON file with analytics payload')
    ltv_parser.add_argument('--months', type=int, default=12, help='Number of months to project')
    ltv_parser.add_argument('--output', '-o', help='Output file (default: stdout)')

    # CFO mode command
    cfo_parser = subparsers.add_parser('cfo-mode', help='Generate CFO executive summary')
    cfo_parser.add_argument('payload_file', help='JSON file with analytics payload')
    cfo_parser.add_argument('--output', '-o', help='Output file (default: stdout)')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        # Initialize the analytics runner
        logger.info("Initializing Analytics Runner")
        runner = AnalyticsRunner()

        if args.command == 'run':
            payload = load_json_file(args.payload_file)
            result = runner.run(payload)
            save_json_output(result, args.output)

        elif args.command == 'budget-sensitivity':
            payload = load_json_file(args.payload_file)
            result = runner.budget_sensitivity(payload, args.budgets)
            save_json_output(result, args.output)

        elif args.command == 'break-even':
            payload = load_json_file(args.payload_file)
            result = runner.break_even(payload)
            save_json_output(result, args.output)

        elif args.command == 'ltv-projection':
            payload = load_json_file(args.payload_file)
            result = runner.ltv_projection(payload, args.months)
            save_json_output(result, args.output)

        elif args.command == 'cfo-mode':
            payload = load_json_file(args.payload_file)
            result = runner.cfo_mode(payload)
            save_json_output(result, args.output)

        logger.info("Command completed successfully", command=args.command)

    except KeyboardInterrupt:
        logger.info("Command interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error("Command failed", command=args.command, error=str(e))
        sys.exit(1)


if __name__ == '__main__':
    main()
