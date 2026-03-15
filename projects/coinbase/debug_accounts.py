#!/usr/bin/env python3
"""
Debug script to inspect raw Coinbase account data.
READ-ONLY, no trades.
"""
import os, json
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

from coinbase.rest import RESTClient

api_key = os.getenv('COINBASE_API_KEY')
api_secret = os.getenv('COINBASE_API_SECRET', '').replace('\\n', '\n')

client = RESTClient(api_key=api_key, api_secret=api_secret)

print("=" * 60)
print(" COINBASE ACCOUNT DIAGNOSTIC")
print("=" * 60)

# Get accounts
accounts = client.get_accounts()

# Inspect raw structure of first account
acc_list = accounts.accounts if hasattr(accounts, 'accounts') else accounts.get('accounts', [])
print(f"\nTotal accounts/wallets: {len(acc_list)}")
print(f"\nFirst account raw type: {type(acc_list[0])}")

# Print first account as dict to see structure
first = acc_list[0]
if hasattr(first, '__dict__'):
    print(f"First account __dict__: {json.dumps({k: str(v) for k, v in first.__dict__.items()}, indent=2)}")
elif isinstance(first, dict):
    print(f"First account dict: {json.dumps({k: str(v) for k, v in first.items()}, indent=2)}")
else:
    print(f"First account repr: {repr(first)}")

# Try to find non-zero balances
print("\n" + "-" * 60)
print("ALL ACCOUNTS WITH BALANCES:")
print("-" * 60)

for acc in acc_list:
    try:
        # Try multiple access patterns
        if hasattr(acc, 'available_balance'):
            bal_obj = acc.available_balance
            if isinstance(bal_obj, dict):
                val = float(bal_obj.get('value', 0))
                cur = bal_obj.get('currency', '???')
            elif hasattr(bal_obj, 'value'):
                val = float(bal_obj.value)
                cur = bal_obj.currency if hasattr(bal_obj, 'currency') else '???'
            else:
                val = float(str(bal_obj)) if bal_obj else 0
                cur = '???'
        elif isinstance(acc, dict):
            bal_obj = acc.get('available_balance', {})
            val = float(bal_obj.get('value', 0)) if isinstance(bal_obj, dict) else 0
            cur = acc.get('currency', '???')
        else:
            val = 0
            cur = '???'
        
        # Also try to get name/currency from account level
        name = getattr(acc, 'name', None) or (acc.get('name') if isinstance(acc, dict) else None) or cur
        currency = getattr(acc, 'currency', None) or (acc.get('currency') if isinstance(acc, dict) else None) or cur
        
        if val > 0:
            print(f"  💰 {currency:>8} | Balance: {val:.8f} | Name: {name}")
        
    except Exception as e:
        print(f"  ⚠️ Error parsing account: {e}")
        # Print raw for debugging
        print(f"     Raw: {repr(acc)[:200]}")

# Also check portfolio/holdings
print("\n" + "-" * 60)
print("PORTFOLIO SUMMARY:")
print("-" * 60)

try:
    # Try to get portfolio breakdown
    products = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'AVAX-USD', 'LINK-USD', 'ADA-USD']
    for pair in products:
        try:
            product = client.get_product(pair)
            price = float(product.price)
            change = float(product.price_percentage_change_24h)
            arrow = "🟢" if change > 0 else "🔴"
            print(f"  {arrow} {pair:10} ${price:>12,.2f}  ({change:+.2f}%)")
        except:
            pass
except Exception as e:
    print(f"  Error: {e}")

print("\n✅ Done (read-only, no trades executed)")
