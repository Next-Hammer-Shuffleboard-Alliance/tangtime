#!/usr/bin/env python3
"""
TangTime Data Importer
======================
Imports RecRec scraped data into Supabase database.

Usage:
    python3 import_to_supabase.py
"""

import json
import re
from datetime import datetime

# You'll need to install this: pip3 install supabase
from supabase import create_client, Client

# =============================================================================
# SUPABASE CREDENTIALS
# =============================================================================
SUPABASE_URL = "https://ynwohnffmlfyejhfttxq.supabase.co"
SUPABASE_KEY = "sb_publishable_V6gptV3HmdIAdVfM1iQwZg_S1poN0C9"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def slugify(text):
    """Convert text to URL-friendly slug"""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text[:100]


def parse_date(date_str):
    """Parse date string to ISO format"""
    if not date_str:
        return None
    
    # Try various formats
    formats = [
        "%B %dst, %Y", "%B %dnd, %Y", "%B %drd, %Y", "%B %dth, %Y",
        "%m/%d/%Y", "%Y-%m-%d"
    ]
    
    # Clean up ordinal suffixes
    clean_date = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)
    
    for fmt in ["%B %d, %Y", "%m/%d/%Y", "%Y-%m-%d"]:
        try:
            return datetime.strptime(clean_date, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    
    return None


def parse_division_info(div_name):
    """Extract day and level from division name"""
    name_lower = div_name.lower()
    
    # Day of week
    day = 'monday'  # default
    for d in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']:
        if d in name_lower:
            day = d
            break
    
    # Level
    level = 'cherry'  # default
    for lvl in ['pilot', 'cherry', 'hammer', 'party']:
        if lvl in name_lower:
            level = lvl
            break
    
    return day, level


# =============================================================================
# MAIN IMPORT FUNCTION
# =============================================================================

def main():
    print("=" * 70)
    print("🚀 TangTime Data Importer")
    print("=" * 70)
    print()
    
    # Connect to Supabase
    print("📡 Connecting to Supabase...")
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("   ✅ Connected!")
    except Exception as e:
        print(f"   ❌ Connection failed: {e}")
        return
    
    # Load RecRec data
    print("\n📂 Loading RecRec data...")
    try:
        with open('recrec_full_data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"   ✅ Loaded {len(data['seasons'])} seasons")
    except FileNotFoundError:
        print("   ❌ recrec_full_data.json not found!")
        return
    
    # =========================================================================
    # STEP 1: Create Venue
    # =========================================================================
    print("\n" + "=" * 70)
    print("📍 STEP 1: Creating venue...")
    print("-" * 50)
    
    venue_data = {
        "name": "Royal Palms Brooklyn",
        "slug": "royal-palms-brooklyn",
        "city": "Brooklyn",
        "state": "NY",
        "timezone": "America/New_York",
        "website_url": "https://www.royalpalmsbrooklyn.com/"
    }
    
    try:
        # Check if venue exists
        existing = supabase.table('venues').select('id').eq('slug', venue_data['slug']).execute()
        
        if existing.data:
            venue_id = existing.data[0]['id']
            print(f"   ⏭️  Venue already exists: {venue_id}")
        else:
            result = supabase.table('venues').insert(venue_data).execute()
            venue_id = result.data[0]['id']
            print(f"   ✅ Created venue: {venue_id}")
    except Exception as e:
        print(f"   ❌ Error creating venue: {e}")
        return
    
    # =========================================================================
    # STEP 2: Import Teams
    # =========================================================================
    print("\n" + "=" * 70)
    print("👥 STEP 2: Importing teams...")
    print("-" * 50)
    
    teams_map = {}  # recrec_id -> supabase_id
    all_teams = data.get('all_teams', {})
    
    print(f"   Found {len(all_teams)} teams to import")
    
    imported_teams = 0
    skipped_teams = 0
    
    for recrec_id, team_info in all_teams.items():
        team_name = team_info.get('name', f'Unknown Team {recrec_id}')
        
        if not team_name or team_name == 'Unknown':
            skipped_teams += 1
            continue
        
        team_data = {
            "venue_id": venue_id,
            "name": team_name,
            "slug": slugify(team_name) or f"team-{recrec_id}",
            "recrec_id": recrec_id,
            "recrec_elo": team_info.get('elo'),
            "all_time_wins": team_info.get('all_time_wins', 0),
            "all_time_losses": team_info.get('all_time_losses', 0),
        }
        
        try:
            # Check if team exists
            existing = supabase.table('teams').select('id').eq('recrec_id', recrec_id).execute()
            
            if existing.data:
                teams_map[recrec_id] = existing.data[0]['id']
                skipped_teams += 1
            else:
                # Handle duplicate slugs
                slug_check = supabase.table('teams').select('id').eq('slug', team_data['slug']).eq('venue_id', venue_id).execute()
                if slug_check.data:
                    team_data['slug'] = f"{team_data['slug']}-{recrec_id[:6]}"
                
                result = supabase.table('teams').insert(team_data).execute()
                teams_map[recrec_id] = result.data[0]['id']
                imported_teams += 1
                
                if imported_teams % 100 == 0:
                    print(f"   ... imported {imported_teams} teams")
        except Exception as e:
            print(f"   ⚠️  Error importing team {team_name}: {e}")
            skipped_teams += 1
    
    print(f"   ✅ Imported: {imported_teams} | Skipped: {skipped_teams}")
    
    # =========================================================================
    # STEP 3: Import Seasons, Divisions, and Matches
    # =========================================================================
    print("\n" + "=" * 70)
    print("📅 STEP 3: Importing seasons, divisions, and matches...")
    print("-" * 50)
    
    total_seasons = 0
    total_divisions = 0
    total_matches = 0
    
    for season_data in data['seasons']:
        season_name = season_data.get('name', 'Unknown Season')
        start_date = parse_date(season_data.get('start_date', ''))
        
        # Create season
        season_insert = {
            "venue_id": venue_id,
            "name": season_name,
            "slug": slugify(season_name),
            "start_date": start_date or "2020-01-01",  # fallback
            "is_active": False
        }
        
        try:
            # Check if season exists
            existing = supabase.table('seasons').select('id').eq('venue_id', venue_id).eq('slug', season_insert['slug']).execute()
            
            if existing.data:
                season_id = existing.data[0]['id']
            else:
                result = supabase.table('seasons').insert(season_insert).execute()
                season_id = result.data[0]['id']
                total_seasons += 1
        except Exception as e:
            print(f"   ⚠️  Error creating season {season_name}: {e}")
            continue
        
        # Process divisions
        for div_data in season_data.get('divisions', []):
            div_name = div_data.get('name', 'Unknown Division')
            day, level = parse_division_info(div_name)
            
            div_insert = {
                "season_id": season_id,
                "name": div_name,
                "slug": slugify(div_name),
                "day_of_week": day,
                "level": level
            }
            
            try:
                # Check if division exists
                existing = supabase.table('divisions').select('id').eq('season_id', season_id).eq('slug', div_insert['slug']).execute()
                
                if existing.data:
                    division_id = existing.data[0]['id']
                else:
                    result = supabase.table('divisions').insert(div_insert).execute()
                    division_id = result.data[0]['id']
                    total_divisions += 1
            except Exception as e:
                print(f"   ⚠️  Error creating division {div_name}: {e}")
                continue
            
            # Process matches
            matches_to_insert = []
            for match_data in div_data.get('matches', []):
                team_a_recrec = match_data.get('team_a_id')
                team_b_recrec = match_data.get('team_b_id')
                
                # Skip if we don't have both teams
                if team_a_recrec not in teams_map or team_b_recrec not in teams_map:
                    continue
                
                match_date = parse_date(match_data.get('date', ''))
                
                match_insert = {
                    "division_id": division_id,
                    "team_a_id": teams_map[team_a_recrec],
                    "team_b_id": teams_map[team_b_recrec],
                    "scheduled_date": match_date or start_date or "2020-01-01",
                    "scheduled_time": match_data.get('time', '19:00'),
                    "court": match_data.get('court', ''),
                    "status": "completed",
                    "recrec_imported": True
                }
                
                matches_to_insert.append(match_insert)
            
            # Batch insert matches
            if matches_to_insert:
                try:
                    # Insert in batches of 100
                    for i in range(0, len(matches_to_insert), 100):
                        batch = matches_to_insert[i:i+100]
                        supabase.table('matches').insert(batch).execute()
                        total_matches += len(batch)
                except Exception as e:
                    print(f"   ⚠️  Error importing matches for {div_name}: {e}")
        
        print(f"   ✅ {season_name}: {len(season_data.get('divisions', []))} divisions")
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 70)
    print("🎉 IMPORT COMPLETE!")
    print("=" * 70)
    print(f"""
   ✅ Venue:      1 (Royal Palms Brooklyn)
   ✅ Teams:      {imported_teams}
   ✅ Seasons:    {total_seasons}
   ✅ Divisions:  {total_divisions}
   ✅ Matches:    {total_matches}
   
   Your historical data is now in Supabase!
   
   Next steps:
   1. Check Supabase Table Editor to verify data
   2. Build the TangTime frontend
""")


if __name__ == "__main__":
    main()
