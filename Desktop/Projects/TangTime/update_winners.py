#!/usr/bin/env python3
"""
TangTime Winner Updater
=======================
Fetches W/L data from RecRec team pages and updates winner_id in Supabase.
Works with your existing database - no need to re-import everything.

Usage:
    python3 update_winners.py
"""

import requests
from bs4 import BeautifulSoup
import re
import time
import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://app.recrec.io"
REQUEST_DELAY = 0.5

# Supabase setup
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://ynwohnffmlfyejhfttxq.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set in .env file!")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_team_match_results(session, team_recrec_id, team_name):
    """Fetch W/L results from a team's RecRec page"""
    url = f"{BASE_URL}/competitors/{team_recrec_id}"
    
    try:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        time.sleep(REQUEST_DELAY)
    except Exception as e:
        print(f"    ⚠️  Error fetching {team_name}: {e}")
        return []
    
    soup = BeautifulSoup(resp.text, 'html.parser')
    results = []
    
    for row in soup.find_all('tr'):
        cells = row.find_all('td')
        if len(cells) < 4:
            continue
        
        # Look for opponent link
        opponent_link = row.find('a', href=lambda h: h and '/competitors/' in h)
        if not opponent_link:
            continue
        
        opponent_id = opponent_link['href'].split('/')[2]
        row_text = ' '.join([cell.text.strip() for cell in cells])
        
        # Extract date
        date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', row_text)
        if not date_match:
            continue
        
        date_str = date_match.group(1)
        
        # Parse to YYYY-MM-DD
        try:
            dt = datetime.strptime(date_str, '%m/%d/%Y')
            date_formatted = dt.strftime('%Y-%m-%d')
        except:
            continue
        
        # Extract result
        result = None
        if 'Won' in row_text:
            result = 'won'
        elif 'Lost' in row_text:
            result = 'lost'
        
        if result:
            results.append({
                'date': date_formatted,
                'opponent_recrec_id': opponent_id,
                'result': result
            })
    
    return results


def main():
    print("=" * 70)
    print("🏒 TangTime Winner Updater")
    print("=" * 70)
    
    # Step 1: Get all teams from Supabase
    print("\n📋 Fetching teams from Supabase...")
    
    teams_response = supabase.table('teams').select('id, recrec_id, name').not_.is_('recrec_id', 'null').execute()
    teams = teams_response.data
    
    print(f"   Found {len(teams)} teams with recrec_id")
    
    # Build lookup: recrec_id -> supabase_id
    recrec_to_supabase = {t['recrec_id']: t['id'] for t in teams}
    
    # Step 2: Fetch match results from RecRec for each team
    print("\n🌐 Fetching W/L data from RecRec...")
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })
    
    # Store: (date, team_a_recrec, team_b_recrec) -> winner_recrec_id
    match_winners = {}
    
    for i, team in enumerate(teams):
        if (i + 1) % 50 == 0 or i == 0:
            print(f"   Processing team {i + 1}/{len(teams)}...")
        
        results = get_team_match_results(session, team['recrec_id'], team['name'])
        
        for r in results:
            # Create a key for this match (sorted team IDs so order doesn't matter)
            team_ids = sorted([team['recrec_id'], r['opponent_recrec_id']])
            match_key = f"{r['date']}|{team_ids[0]}|{team_ids[1]}"
            
            # Determine winner
            if r['result'] == 'won':
                winner_recrec_id = team['recrec_id']
            else:
                winner_recrec_id = r['opponent_recrec_id']
            
            match_winners[match_key] = winner_recrec_id
    
    print(f"   ✅ Found {len(match_winners)} matches with known winners")
    
    # Step 3: Get all matches from Supabase (with pagination)
    print("\n📊 Fetching matches from Supabase...")
    
    matches = []
    page_size = 1000
    offset = 0
    
    while True:
        response = supabase.table('matches').select(
            'id, scheduled_date, team_a_id, team_b_id, winner_id'
        ).range(offset, offset + page_size - 1).execute()
        
        batch = response.data
        if not batch:
            break
        
        matches.extend(batch)
        print(f"      Fetched {len(matches)} matches...")
        offset += page_size
        
        if len(batch) < page_size:
            break
    
    print(f"   Found {len(matches)} total matches")
    
    # Build reverse lookup: supabase_id -> recrec_id
    supabase_to_recrec = {t['id']: t['recrec_id'] for t in teams}
    
    # Step 4: Update matches with winner_id
    print("\n🔄 Updating matches with winner data...")
    
    updated = 0
    skipped_no_winner = 0
    skipped_already_set = 0
    
    for match in matches:
        # Skip if already has winner
        if match['winner_id']:
            skipped_already_set += 1
            continue
        
        # Get recrec IDs for this match's teams
        team_a_recrec = supabase_to_recrec.get(match['team_a_id'])
        team_b_recrec = supabase_to_recrec.get(match['team_b_id'])
        
        if not team_a_recrec or not team_b_recrec:
            continue
        
        # Build match key
        team_ids = sorted([team_a_recrec, team_b_recrec])
        match_key = f"{match['scheduled_date']}|{team_ids[0]}|{team_ids[1]}"
        
        # Look up winner
        winner_recrec_id = match_winners.get(match_key)
        
        if not winner_recrec_id:
            skipped_no_winner += 1
            continue
        
        # Convert winner recrec_id to supabase UUID
        winner_supabase_id = recrec_to_supabase.get(winner_recrec_id)
        
        if not winner_supabase_id:
            continue
        
        # Update the match
        try:
            supabase.table('matches').update({
                'winner_id': winner_supabase_id,
                'status': 'completed'
            }).eq('id', match['id']).execute()
            updated += 1
            
            if updated % 500 == 0:
                print(f"      Updated {updated} matches...")
        except Exception as e:
            print(f"    ⚠️  Error updating match {match['id']}: {e}")
    
    # Summary
    print("\n" + "=" * 70)
    print("✅ UPDATE COMPLETE")
    print("=" * 70)
    print(f"""
   Matches updated with winner:  {updated}
   Already had winner:           {skipped_already_set}
   No winner data found:         {skipped_no_winner}
   
   Total matches processed:      {len(matches)}
""")


if __name__ == "__main__":
    main()
