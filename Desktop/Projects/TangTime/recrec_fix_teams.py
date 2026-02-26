#!/usr/bin/env python3
"""
RecRec Team Details Fixer
=========================
Extracts team IDs from match data and fetches their details.
Run this after recrec_scraper_full.py

Usage:
    python3 recrec_fix_teams.py
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time

BASE_URL = "https://app.recrec.io"
REQUEST_DELAY = 0.5


def get_team_details(session, team_id):
    """Fetch team details from RecRec"""
    try:
        resp = session.get(f"{BASE_URL}/competitors/{team_id}", timeout=30)
        resp.raise_for_status()
        time.sleep(REQUEST_DELAY)
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        page_text = soup.get_text()
        
        # Get team name
        name = ""
        name_link = soup.find('a', href=f"/competitors/{team_id}")
        if name_link:
            name = name_link.text.strip()
        
        # Extract ELO
        elo = None
        elo_match = re.search(r'ELO Rating:\s*(\d+)', page_text)
        if elo_match:
            elo = int(elo_match.group(1))
        
        # Extract overall record
        wins = 0
        losses = 0
        record_match = re.search(r'Record:\s*(\d+)\s*-\s*(\d+)', page_text)
        if record_match:
            wins = int(record_match.group(1))
            losses = int(record_match.group(2))
        
        # Extract seasons played
        seasons = 0
        seasons_match = re.search(r'(\d+)\s*Seasons?', page_text)
        if seasons_match:
            seasons = int(seasons_match.group(1))
        
        return {
            'id': team_id,
            'name': name,
            'elo': elo,
            'all_time_wins': wins,
            'all_time_losses': losses,
            'all_time_record': f"{wins}-{losses}",
            'seasons_played': seasons
        }
    except Exception as e:
        print(f"    ⚠️ Error fetching {team_id}: {e}")
        return None


def main():
    print("=" * 70)
    print("🔧 RecRec Team Details Fixer")
    print("=" * 70)
    print()
    
    # Load existing data
    print("📂 Loading recrec_full_data.json...")
    try:
        with open('recrec_full_data.json', 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("❌ recrec_full_data.json not found. Run recrec_scraper_full.py first.")
        return
    
    # Extract all unique team IDs from matches
    print("🔍 Extracting team IDs from matches...")
    team_ids = set()
    team_names = {}  # id -> name mapping from matches
    
    for season in data['seasons']:
        for division in season['divisions']:
            for match in division.get('matches', []):
                team_a_id = match.get('team_a_id')
                team_b_id = match.get('team_b_id')
                
                if team_a_id:
                    team_ids.add(team_a_id)
                    team_names[team_a_id] = match.get('team_a_name', '')
                if team_b_id:
                    team_ids.add(team_b_id)
                    team_names[team_b_id] = match.get('team_b_name', '')
    
    print(f"   Found {len(team_ids)} unique teams in match data")
    
    # Fetch details for each team
    print()
    print("📡 Fetching team details from RecRec...")
    print("-" * 50)
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    })
    
    all_teams = {}
    team_list = list(team_ids)
    
    for i, team_id in enumerate(team_list):
        if (i + 1) % 25 == 0 or i == 0 or i == len(team_list) - 1:
            print(f"   Processing team {i+1}/{len(team_list)}...")
        
        details = get_team_details(session, team_id)
        
        if details:
            # If we didn't get a name from the page, use the one from matches
            if not details['name'] and team_id in team_names:
                details['name'] = team_names[team_id]
            all_teams[team_id] = details
    
    # Update the data
    data['all_teams'] = all_teams
    
    # Also update team counts in divisions
    total_team_records = 0
    for season in data['seasons']:
        for division in season['divisions']:
            # Get unique teams in this division's matches
            div_teams = set()
            for match in division.get('matches', []):
                if match.get('team_a_id'):
                    div_teams.add(match['team_a_id'])
                if match.get('team_b_id'):
                    div_teams.add(match['team_b_id'])
            
            # Build teams list for this division
            division['teams'] = []
            for tid in div_teams:
                if tid in all_teams:
                    division['teams'].append({
                        'id': tid,
                        'name': all_teams[tid]['name'],
                        'elo': all_teams[tid]['elo']
                    })
            total_team_records += len(division['teams'])
    
    # Save updated data
    print()
    print("💾 Saving updated data...")
    with open('recrec_full_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # Summary
    print()
    print("=" * 70)
    print("✅ COMPLETE!")
    print("=" * 70)
    print(f"""
   Teams with details:     {len(all_teams)}
   Team-division records:  {total_team_records}
   
   Sample teams:
""")
    
    # Show some sample teams
    sample_teams = list(all_teams.values())[:10]
    for team in sample_teams:
        elo_str = f"ELO {team['elo']}" if team['elo'] else "No ELO"
        print(f"      • {team['name']}: {team['all_time_record']} ({elo_str})")
    
    print(f"\n   📁 Updated: recrec_full_data.json")


if __name__ == "__main__":
    main()
