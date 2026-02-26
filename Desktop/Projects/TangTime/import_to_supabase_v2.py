#!/usr/bin/env python3
"""
TangTime Data Importer v2
=========================
Imports data from recrec_full_data_v2.json into Supabase.
Now properly sets winner_id from team match results.

Usage:
    python3 import_to_supabase_v2.py

Requires:
    pip install supabase python-dotenv
"""

import json
import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Supabase credentials
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://ynwohnffmlfyejhfttxq.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')  # Use service key for writes

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_KEY not set!")
    print("   Get it from: Supabase Dashboard > Settings > API > service_role key")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def parse_date(date_str: str) -> str:
    """Convert MM/DD/YYYY to YYYY-MM-DD"""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, '%m/%d/%Y')
        return dt.strftime('%Y-%m-%d')
    except:
        return None


def parse_time(time_str: str) -> str:
    """Convert time to HH:MM:SS format"""
    if not time_str:
        return None
    try:
        # Handle "7:30 PM" format
        time_str = time_str.strip().upper()
        dt = datetime.strptime(time_str, '%I:%M %p')
        return dt.strftime('%H:%M:%S')
    except:
        return None


def build_match_key(date: str, team_a_id: str, team_b_id: str) -> str:
    """Create a unique key for matching results to matches"""
    # Sort team IDs so order doesn't matter
    teams = sorted([team_a_id, team_b_id])
    return f"{date}|{teams[0]}|{teams[1]}"


def main():
    print("=" * 70)
    print("🏒 TangTime Data Importer v2")
    print("=" * 70)
    
    # Load scraped data
    print("\n📂 Loading scraped data...")
    with open('recrec_full_data_v2.json', 'r') as f:
        data = json.load(f)
    
    print(f"   Loaded {len(data['seasons'])} seasons")
    print(f"   Loaded {len(data['all_teams'])} teams")
    print(f"   Loaded {len(data['team_match_results'])} match results")
    
    # =========================================================================
    # Build a lookup of match results (who won each match)
    # =========================================================================
    print("\n🔍 Building match result lookup...")
    
    # Map: match_key -> winner_team_id
    match_winners = {}
    
    for result in data['team_match_results']:
        if result['result'] not in ['won', 'lost']:
            continue  # Skip unknown results
        
        date = parse_date(result['date'])
        if not date:
            continue
        
        team_id = result['team_id']
        opponent_id = result['opponent_id']
        
        # Determine winner
        if result['result'] == 'won':
            winner_id = team_id
        else:
            winner_id = opponent_id
        
        # Create match key (date + sorted team IDs)
        match_key = build_match_key(date, team_id, opponent_id)
        
        # Store winner (may be set multiple times from both team perspectives)
        match_winners[match_key] = winner_id
    
    print(f"   Found {len(match_winners)} matches with known winners")
    
    # =========================================================================
    # Get existing venue (or create)
    # =========================================================================
    print("\n🏟️  Getting/creating venue...")
    
    venue_result = supabase.table('venues').select('id').eq('slug', 'royal-palms-brooklyn').execute()
    
    if venue_result.data:
        venue_id = venue_result.data[0]['id']
        print(f"   Found existing venue: {venue_id}")
    else:
        venue_insert = supabase.table('venues').insert({
            'name': 'Royal Palms Brooklyn',
            'slug': 'royal-palms-brooklyn',
            'city': 'Brooklyn',
            'state': 'NY'
        }).execute()
        venue_id = venue_insert.data[0]['id']
        print(f"   Created venue: {venue_id}")
    
    # =========================================================================
    # Import teams (upsert)
    # =========================================================================
    print("\n👥 Importing teams...")
    
    team_id_map = {}  # recrec_id -> supabase_uuid
    
    for recrec_id, team_data in data['all_teams'].items():
        # Check if team exists
        existing = supabase.table('teams').select('id').eq('recrec_id', recrec_id).execute()
        
        team_record = {
            'recrec_id': recrec_id,
            'name': team_data['name'],
            'venue_id': venue_id,
            'recrec_elo': team_data.get('elo'),
            'all_time_wins': team_data.get('all_time_wins', 0),
            'all_time_losses': team_data.get('all_time_losses', 0)
        }
        
        if existing.data:
            # Update
            result = supabase.table('teams').update(team_record).eq('recrec_id', recrec_id).execute()
            team_id_map[recrec_id] = existing.data[0]['id']
        else:
            # Insert
            result = supabase.table('teams').insert(team_record).execute()
            team_id_map[recrec_id] = result.data[0]['id']
    
    print(f"   Processed {len(team_id_map)} teams")
    
    # =========================================================================
    # Import seasons and divisions
    # =========================================================================
    print("\n📅 Importing seasons and divisions...")
    
    season_id_map = {}  # recrec_id -> supabase_uuid
    division_id_map = {}  # recrec_id -> supabase_uuid
    
    for season_data in data['seasons']:
        # Parse season start date
        start_date = parse_date(season_data['start_date'])
        
        # Check if season exists
        existing = supabase.table('seasons').select('id').eq('recrec_id', season_data['id']).execute()
        
        season_record = {
            'recrec_id': season_data['id'],
            'name': season_data['name'],
            'venue_id': venue_id,
            'start_date': start_date
        }
        
        if existing.data:
            season_id_map[season_data['id']] = existing.data[0]['id']
        else:
            result = supabase.table('seasons').insert(season_record).execute()
            season_id_map[season_data['id']] = result.data[0]['id']
        
        season_uuid = season_id_map[season_data['id']]
        
        # Import divisions
        for div_data in season_data['divisions']:
            existing = supabase.table('divisions').select('id').eq('recrec_id', div_data['id']).execute()
            
            # Parse day of week from division name
            day_of_week = None
            name_lower = div_data['name'].lower()
            for day_num, day_name in enumerate(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']):
                if day_name in name_lower:
                    day_of_week = day_num
                    break
            
            # Parse level
            level = None
            if 'pilot' in name_lower:
                level = 'Pilot'
            elif 'cherry' in name_lower:
                level = 'Cherry'
            elif 'hammer' in name_lower:
                level = 'Hammer'
            
            division_record = {
                'recrec_id': div_data['id'],
                'name': div_data['name'],
                'season_id': season_uuid,
                'day_of_week': day_of_week,
                'level': level
            }
            
            if existing.data:
                division_id_map[div_data['id']] = existing.data[0]['id']
            else:
                result = supabase.table('divisions').insert(division_record).execute()
                division_id_map[div_data['id']] = result.data[0]['id']
    
    print(f"   Processed {len(season_id_map)} seasons, {len(division_id_map)} divisions")
    
    # =========================================================================
    # Import matches with winner_id
    # =========================================================================
    print("\n🎯 Importing matches with winner data...")
    
    matches_processed = 0
    matches_with_winner = 0
    
    for season_data in data['seasons']:
        for div_data in season_data['divisions']:
            division_uuid = division_id_map.get(div_data['id'])
            if not division_uuid:
                continue
            
            for match_data in div_data.get('matches', []):
                team_a_uuid = team_id_map.get(match_data['team_a_id'])
                team_b_uuid = team_id_map.get(match_data['team_b_id'])
                
                if not team_a_uuid or not team_b_uuid:
                    continue
                
                scheduled_date = parse_date(match_data['date'])
                scheduled_time = parse_time(match_data['time'])
                
                # Look up winner
                winner_uuid = None
                if scheduled_date:
                    match_key = build_match_key(
                        scheduled_date, 
                        match_data['team_a_id'], 
                        match_data['team_b_id']
                    )
                    winner_recrec_id = match_winners.get(match_key)
                    if winner_recrec_id:
                        winner_uuid = team_id_map.get(winner_recrec_id)
                        if winner_uuid:
                            matches_with_winner += 1
                
                # Determine status
                status = match_data.get('status', 'scheduled')
                if winner_uuid:
                    status = 'completed'
                
                match_record = {
                    'division_id': division_uuid,
                    'team_a_id': team_a_uuid,
                    'team_b_id': team_b_uuid,
                    'scheduled_date': scheduled_date,
                    'scheduled_time': scheduled_time,
                    'court': match_data.get('court', ''),
                    'status': status,
                    'winner_id': winner_uuid
                }
                
                # Check if match exists (by division + date + teams)
                existing = supabase.table('matches').select('id')\
                    .eq('division_id', division_uuid)\
                    .eq('team_a_id', team_a_uuid)\
                    .eq('team_b_id', team_b_uuid)\
                    .eq('scheduled_date', scheduled_date)\
                    .execute()
                
                if existing.data:
                    # Update existing match
                    supabase.table('matches').update(match_record)\
                        .eq('id', existing.data[0]['id']).execute()
                else:
                    # Insert new match
                    supabase.table('matches').insert(match_record).execute()
                
                matches_processed += 1
                
                if matches_processed % 500 == 0:
                    print(f"      Processed {matches_processed} matches...")
    
    print(f"   ✅ Processed {matches_processed} matches")
    print(f"   ✅ {matches_with_winner} matches have winner data")
    
    # =========================================================================
    # Summary
    # =========================================================================
    print("\n" + "=" * 70)
    print("✅ IMPORT COMPLETE")
    print("=" * 70)
    print(f"""
   Teams:     {len(team_id_map)}
   Seasons:   {len(season_id_map)}
   Divisions: {len(division_id_map)}
   Matches:   {matches_processed}
   
   🏆 Matches with winners: {matches_with_winner}
""")


if __name__ == "__main__":
    main()
