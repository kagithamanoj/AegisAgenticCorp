#!/usr/bin/env python3
"""
Coinbase API Connectivity Test (READ-ONLY)
Tests API authentication and basic data retrieval.
NO trades will be executed.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment from coinbase/.env
load_dotenv(Path(__file__).parent / '.env')

from coinbase.rest import RESTClient


def test_connection():
    """Test Coinbase API connectivity"""
    print("\n" + "=" * 60)
    print(" COINBASE API CONNECTIVITY TEST (READ-ONLY)")
    print("=" * 60)

    api_key = os.getenv('COINBASE_API_KEY')
    api_secret = os.getenv('COINBASE_API_SECRET')

    if not api_key or api_key == 'your_coinbase_api_key_here':
        print("❌ COINBASE_API_KEY not set in .env")
        return False
    if not api_secret or api_secret == 'your_coinbase_api_secret_here':
        print("❌ COINBASE_API_SECRET not set in .env")
        return False

    # Fix escaped newlines from .env loading
    api_secret = api_secret.replace('\\n', '\n')

    print(f"✓ API Key found: {api_key[:30]}...")
    print(f"✓ API Secret found: {api_secret[:30]}...")

    results = {}

    # =========================================
    # TEST 1: Authentication
    # =========================================
    print("\n" + "-" * 40)
    print("TEST 1: Authentication & Account Access")
    print("-" * 40)

    try:
        client = RESTClient(api_key=api_key, api_secret=api_secret)
        accounts = client.get_accounts()
        
        if accounts and hasattr(accounts, 'accounts'):
            account_list = accounts.accounts
            print(f"✓ Authenticated successfully!")
            print(f"✓ Found {len(account_list)} accounts/wallets")
            
            # Show first few accounts (non-zero balances)
            shown = 0
            for acc in account_list:
                try:
                    bal = acc.available_balance if hasattr(acc, 'available_balance') else acc.get('available_balance', {})
                    if isinstance(bal, dict):
                        balance = float(bal.get('value', 0))
                        currency = acc.get('currency', acc.get('name', '???'))
                    else:
                        balance = float(bal.value) if bal else 0
                        currency = acc.currency if hasattr(acc, 'currency') else str(acc)
                    
                    if balance > 0:
                        print(f"  💰 {currency}: {balance:.6f}")
                        shown += 1
                except (ValueError, AttributeError, TypeError):
                    continue
                if shown >= 5:
                    print(f"  ... and more")
                    break
            
            if shown == 0:
                print("  📭 No non-zero balances (or all balances are zero)")
            
            results['auth'] = True
        else:
            print(f"❌ Unexpected response: {accounts}")
            results['auth'] = False
            
    except Exception as e:
        print(f"❌ Authentication failed: {e}")
        results['auth'] = False

    # =========================================
    # TEST 2: Market Data (Public)
    # =========================================
    print("\n" + "-" * 40)
    print("TEST 2: Market Data (BTC-USD)")
    print("-" * 40)

    try:
        product = client.get_product("BTC-USD")
        if product:
            print(f"✓ BTC-USD current price: ${float(product.price):,.2f}")
            print(f"  24h volume: {float(product.volume_24h):,.2f} BTC")
            print(f"  24h change: {float(product.price_percentage_change_24h):+.2f}%")
            results['market_data'] = True
        else:
            print("❌ Could not fetch BTC-USD data")
            results['market_data'] = False
    except Exception as e:
        print(f"❌ Market data failed: {e}")
        results['market_data'] = False

    # =========================================
    # TEST 3: Watch List Prices
    # =========================================
    print("\n" + "-" * 40)
    print("TEST 3: Watch List Prices")
    print("-" * 40)

    watch_list = os.getenv('WATCH_LIST', 'BTC-USD,ETH-USD').split(',')

    try:
        for pair in watch_list:
            pair = pair.strip()
            try:
                product = client.get_product(pair)
                price = float(product.price)
                change = float(product.price_percentage_change_24h)
                arrow = "🟢" if change > 0 else "🔴"
                print(f"  {arrow} {pair:10} ${price:>12,.2f}  ({change:+.2f}%)")
            except Exception as e:
                print(f"  ⚠️  {pair:10} Error: {e}")
        results['watchlist'] = True
    except Exception as e:
        print(f"❌ Watch list failed: {e}")
        results['watchlist'] = False

    # =========================================
    # SUMMARY
    # =========================================
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    all_passed = True
    for test, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        if not passed:
            all_passed = False
        print(f"  {test:25} {status}")

    print("=" * 60)

    if all_passed:
        print("\n✅ All tests passed! Coinbase API is connected and working.")
        print("   Your agents can now access market data and account info.")
        print("\n⚠️  NO TRADES WERE EXECUTED during this test.\n")
    else:
        print("\n❌ Some tests failed. Please check your API keys.\n")

    return all_passed


if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
